// Novora native shell (Win32 + WebView2, dynamically loaded loader).
// No WRL / no MSVC-only helpers: raw COM handler implementations.
//
// Build: desktop/build.ps1 (llvm-mingw clang++)

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <objbase.h>
#include <shobjidl.h>   // SetCurrentProcessExplicitAppUserModelID

#include "WebView2.h"

#include <string>
#include <cstdio>

// ---------------------------------------------------------------- constants

static const wchar_t* kWindowClass = L"NovoraMainWindow";
static const wchar_t* kWindowTitle = L"Novora";
static const wchar_t* kAppUrl      = L"http://127.0.0.1:47830/pc";
static const char*    kAppHost     = "127.0.0.1";
static const int      kAppPort     = 47830;
static const int      kWindowW     = 1280;
static const int      kWindowH     = 800;
static const DWORD    kServerWaitMs = 10000;

// ---------------------------------------------------------------- globals

static ICoreWebView2Environment* g_env        = nullptr;
static ICoreWebView2Controller*  g_controller = nullptr;
static ICoreWebView2*            g_webview    = nullptr;
static HMODULE                   g_loader     = nullptr;
static HICON                     g_hIcon      = nullptr;
static HICON                     g_hIconSm    = nullptr;

// ---------------------------------------------------------------- helpers

static std::wstring ExeDir()
{
    wchar_t buf[MAX_PATH * 2] = {0};
    DWORD n = GetModuleFileNameW(nullptr, buf, (DWORD)(sizeof(buf) / sizeof(buf[0])));
    std::wstring p(buf, n);
    size_t slash = p.find_last_of(L"\\/");
    if (slash != std::wstring::npos)
        p.resize(slash);
    return p;
}

static void LogLine(const wchar_t* fmt, ...)
{
    wchar_t msg[1024] = {0};
    va_list args;
    va_start(args, fmt);
    _vsnwprintf_s(msg, _TRUNCATE, fmt, args);
    va_end(args);

    std::wstring path = ExeDir() + L"\\novora-start.log";
    FILE* f = nullptr;
    if (_wfopen_s(&f, path.c_str(), L"a, ccs=UTF-8") == 0 && f) {
        SYSTEMTIME st;
        GetLocalTime(&st);
        fwprintf(f, L"[%04u-%02u-%02u %02u:%02u:%02u] %ls\n",
                 st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond, msg);
        fclose(f);
    }
}

// Non-blocking TCP probe with short timeout.
static bool IsPortOpen(const char* host, int port, int timeoutMs)
{
    static bool wsaReady = false;
    if (!wsaReady) {
        WSADATA wsa;
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0)
            return false;
        wsaReady = true;
    }

    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET)
        return false;

    sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    if (InetPtonA(AF_INET, host, &addr.sin_addr) != 1) {
        closesocket(s);
        return false;
    }

    u_long nonBlocking = 1;
    ioctlsocket(s, FIONBIO, &nonBlocking);

    bool open = false;
    int rc = connect(s, (sockaddr*)&addr, sizeof(addr));
    if (rc == 0) {
        open = true;
    } else if (WSAGetLastError() == WSAEWOULDBLOCK) {
        fd_set wr;
        FD_ZERO(&wr);
        FD_SET(s, &wr);
        timeval tv;
        tv.tv_sec = timeoutMs / 1000;
        tv.tv_usec = (timeoutMs % 1000) * 1000;
        if (select(0, nullptr, &wr, nullptr, &tv) > 0) {
            int err = 0;
            int len = (int)sizeof(err);
            if (getsockopt(s, SOL_SOCKET, SO_ERROR, (char*)&err, &len) == 0 && err == 0)
                open = true;
        }
    }

    closesocket(s);
    return open;
}

// Starts <exeDir>\runtime\node.exe <exeDir>\app\server.mjs hidden, waits for port.
static bool StartBundledServer(const std::wstring& exeDir)
{
    std::wstring node = exeDir + L"\\runtime\\node.exe";
    std::wstring script = exeDir + L"\\app\\server.mjs";

    if (GetFileAttributesW(node.c_str()) == INVALID_FILE_ATTRIBUTES) {
        LogLine(L"bundled node.exe missing: %ls", node.c_str());
        return false;
    }
    if (GetFileAttributesW(script.c_str()) == INVALID_FILE_ATTRIBUTES) {
        LogLine(L"bundled server.mjs missing: %ls", script.c_str());
        return false;
    }

    std::wstring cmd = L"\"" + node + L"\" \"" + script + L"\"";
    std::wstring cwd = exeDir + L"\\app";

    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    PROCESS_INFORMATION pi = {0};
    std::wstring mutableCmd = cmd; // CreateProcessW may modify the buffer

    BOOL ok = CreateProcessW(nullptr, &mutableCmd[0], nullptr, nullptr, FALSE,
                             CREATE_NO_WINDOW, nullptr, cwd.c_str(), &si, &pi);
    if (!ok) {
        LogLine(L"CreateProcess failed (%lu) for %ls", GetLastError(), cmd.c_str());
        return false;
    }
    LogLine(L"started bundled server pid=%lu", pi.dwProcessId);

    // Let the child own itself; we never kill it on exit.
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);

    for (DWORD waited = 0; waited < kServerWaitMs; waited += 150) {
        if (IsPortOpen(kAppHost, kAppPort, 400)) {
            LogLine(L"server reachable after %lu ms", waited);
            return true;
        }
        Sleep(150);
    }

    LogLine(L"server did not become reachable within %lu ms", kServerWaitMs);
    return false;
}

static void EnsureServer()
{
    if (IsPortOpen(kAppHost, kAppPort, 400)) {
        LogLine(L"server already reachable on %d", kAppPort);
        return;
    }
    LogLine(L"server not reachable on %d, starting bundled copy", kAppPort);
    StartBundledServer(ExeDir());
}

// ---------------------------------------------------------------- auto update
//
// Ruft <exeDir>\app\updater.mjs vor dem Serverstart auf (docs\UPDATES.md §3).
// Nie blockierend fuer den Start: jeder Fehler wird nur geloggt.

// PLATZHALTER: echte Update-URL eintragen, sobald der Update-Server steht.
static const wchar_t* kDefaultManifestUrl =
    L"https://updates.example.com/novora/updates/latest.json";

static const DWORD kUpdaterWaitMs = 10000;

static bool FileExists(const std::wstring& p)
{
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

static std::wstring Utf8ToWide(const std::string& s)
{
    if (s.empty())
        return std::wstring();
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    if (n <= 0)
        return std::wstring(); // kein gueltiges UTF-8
    std::wstring w((size_t)n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
    return w;
}

static bool IsSpaceChar(wchar_t c)
{
    return c == L' ' || c == L'\t' || c == L'\r' || c == L'\n' || c == L'"';
}

// Liest die Update-Quelle: eine Zeile URL/Pfad, oder {"manifest":"..."}.
static bool ReadManifestSource(const std::wstring& path, std::wstring& out)
{
    if (!FileExists(path))
        return false;

    FILE* f = nullptr;
    if (_wfopen_s(&f, path.c_str(), L"rb") != 0 || !f)
        return false;
    char buf[8192] = {0};
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    fclose(f);
    if (n == 0)
        return false;

    std::string raw(buf, n);
    // UTF-8-BOM entfernen
    if (raw.size() >= 3 && (unsigned char)raw[0] == 0xEF &&
        (unsigned char)raw[1] == 0xBB && (unsigned char)raw[2] == 0xBF)
        raw.erase(0, 3);

    std::wstring text = Utf8ToWide(raw);
    if (text.empty())
        return false;

    // JSON-Form: "manifest" : "wert"
    size_t key = text.find(L"\"manifest\"");
    if (key != std::wstring::npos) {
        size_t colon = text.find(L':', key);
        if (colon != std::wstring::npos) {
            size_t i = text.find_first_not_of(L" \t\r\n", colon + 1);
            if (i != std::wstring::npos && text[i] == L'"') {
                size_t end = text.find(L'"', i + 1);
                if (end != std::wstring::npos && end > i + 1) {
                    out = text.substr(i + 1, end - i - 1);
                    return !out.empty();
                }
            }
        }
    }

    // sonst: erste nicht-leere Zeile, getrimmt
    size_t begin = 0;
    while (begin < text.size()) {
        size_t eol = text.find_first_of(L"\r\n", begin);
        std::wstring line = text.substr(begin, (eol == std::wstring::npos ? text.size() : eol) - begin);
        size_t a = line.find_first_not_of(L" \t");
        size_t b = line.find_last_not_of(L" \t");
        if (a != std::wstring::npos && b != std::wstring::npos) {
            out = line.substr(a, b - a + 1);
            return !out.empty();
        }
        if (eol == std::wstring::npos)
            break;
        begin = eol + 1;
    }
    return false;
}

// Fuehrt den Updater synchron aus (max. 10 s). Bricht den Start nie ab.
static void RunUpdater()
{
    static bool alreadyRan = false; // kein zweiter Lauf (z.B. Reload)
    if (alreadyRan) {
        LogLine(L"Updater bereits gelaufen, uebersprungen");
        return;
    }
    alreadyRan = true;

    std::wstring exeDir = ExeDir();
    std::wstring node   = exeDir + L"\\runtime\\node.exe";
    std::wstring updater = exeDir + L"\\app\\updater.mjs";
    std::wstring pubkey = exeDir + L"\\update.pub";

    if (!FileExists(node)) {
        LogLine(L"Updater uebersprungen: runtime\\node.exe fehlt");
        return;
    }
    if (!FileExists(updater)) {
        LogLine(L"Updater uebersprungen: app\\updater.mjs fehlt");
        return;
    }
    if (!FileExists(pubkey)) {
        LogLine(L"Updater uebersprungen: update.pub fehlt (kein unsigniertes Update)");
        return;
    }

    std::wstring manifest;
    if (!ReadManifestSource(exeDir + L"\\update.json", manifest) &&
        !ReadManifestSource(exeDir + L"\\update.url", manifest)) {
        manifest = kDefaultManifestUrl;
        LogLine(L"Updater: keine lokale Quelle, nutze Standard-URL");
    }

    std::wstring cmd = L"\"" + node + L"\" \"" + updater + L"\""
                       L" --manifest \"" + manifest + L"\""
                       L" --app \"" + exeDir + L"\\app\""
                       L" --org \"" + exeDir + L"\""
                       L" --pubkey \"" + pubkey + L"\"";

    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    PROCESS_INFORMATION pi = {0};
    std::wstring mutableCmd = cmd; // CreateProcessW darf den Puffer aendern

    BOOL ok = CreateProcessW(nullptr, &mutableCmd[0], nullptr, nullptr, FALSE,
                             CREATE_NO_WINDOW, nullptr, exeDir.c_str(), &si, &pi);
    if (!ok) {
        LogLine(L"Updater: CreateProcess fehlgeschlagen (%lu)", GetLastError());
        return;
    }

    DWORD rc = WaitForSingleObject(pi.hProcess, kUpdaterWaitMs);
    if (rc == WAIT_TIMEOUT) {
        TerminateProcess(pi.hProcess, 1);
        WaitForSingleObject(pi.hProcess, 2000);
        LogLine(L"Updater: Timeout nach %lu ms, beendet", kUpdaterWaitMs);
    } else if (rc == WAIT_OBJECT_0) {
        DWORD code = 1;
        if (GetExitCodeProcess(pi.hProcess, &code)) {
            if (code == 0)
                LogLine(L"Updater: fertig, aktuell oder aktualisiert (exit 0)");
            else if (code == 2)
                LogLine(L"Updater: Update verfuegbar, nicht eingespielt (exit 2)");
            else
                LogLine(L"Updater: Fehler (exit %lu)", code);
        }
    } else {
        LogLine(L"Updater: WaitForSingleObject unerwartet (%lu)", rc);
    }

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
}

// ---------------------------------------------------------------- COM handlers

struct EnvHandler : public ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler
{
    LONG refCount = 1;
    HWND hwnd = nullptr;

    explicit EnvHandler(HWND h) : hwnd(h) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override
    {
        if (!ppv)
            return E_POINTER;
        if (IsEqualIID(riid, IID_IUnknown) ||
            IsEqualIID(riid, IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler)) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    ULONG STDMETHODCALLTYPE AddRef() override { return (ULONG)InterlockedIncrement(&refCount); }

    ULONG STDMETHODCALLTYPE Release() override
    {
        LONG n = InterlockedDecrement(&refCount);
        if (n == 0)
            delete this;
        return (ULONG)n;
    }

    // Defined after ControllerHandler, which it instantiates.
    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result,
                                     ICoreWebView2Environment* env) override;
};

// Controller-created handler (defined before EnvHandler::Invoke).
struct ControllerHandler : public ICoreWebView2CreateCoreWebView2ControllerCompletedHandler
{
    LONG refCount = 1;
    HWND hwnd = nullptr;

    explicit ControllerHandler(HWND h) : hwnd(h) {}

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override
    {
        if (!ppv)
            return E_POINTER;
        if (IsEqualIID(riid, IID_IUnknown) ||
            IsEqualIID(riid, IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler)) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }

    ULONG STDMETHODCALLTYPE AddRef() override { return (ULONG)InterlockedIncrement(&refCount); }

    ULONG STDMETHODCALLTYPE Release() override
    {
        LONG n = InterlockedDecrement(&refCount);
        if (n == 0)
            delete this;
        return (ULONG)n;
    }

    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result,
                                     ICoreWebView2Controller* controller) override
    {
        if (FAILED(result) || !controller) {
            LogLine(L"controller creation failed hr=0x%08lX", (unsigned long)result);
            MessageBoxW(hwnd, L"WebView2-Controller konnte nicht erstellt werden.",
                        L"Novora", MB_ICONERROR | MB_OK);
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
            return S_OK;
        }

        g_controller = controller;
        g_controller->AddRef();

        RECT rc;
        GetClientRect(hwnd, &rc);
        g_controller->put_Bounds(rc);

        HRESULT hr = g_controller->get_CoreWebView2(&g_webview);
        if (FAILED(hr) || !g_webview) {
            LogLine(L"get_CoreWebView2 failed hr=0x%08lX", (unsigned long)hr);
            return S_OK;
        }

        ICoreWebView2Settings* settings = nullptr;
        if (SUCCEEDED(g_webview->get_Settings(&settings)) && settings) {
            settings->put_AreDevToolsEnabled(FALSE);
            settings->put_AreDefaultScriptDialogsEnabled(TRUE);
            settings->Release();
        }

        // Reihenfolge: WebView2/Fenster -> Updater -> Server -> Navigate.
        RunUpdater();
        EnsureServer();

        LogLine(L"navigating to %ls", kAppUrl);
        g_webview->Navigate(kAppUrl);
        return S_OK;
    }
};

HRESULT EnvHandler::Invoke(HRESULT result, ICoreWebView2Environment* env)
{
    if (FAILED(result) || !env) {
        LogLine(L"CreateCoreWebView2EnvironmentWithOptions failed hr=0x%08lX", (unsigned long)result);
        MessageBoxW(hwnd,
                    L"WebView2-Umgebung konnte nicht erstellt werden.\n"
                    L"Bitte pruefen, ob die WebView2-Runtime installiert ist.",
                    L"Novora", MB_ICONERROR | MB_OK);
        PostMessageW(hwnd, WM_CLOSE, 0, 0);
        return S_OK;
    }

    g_env = env;
    g_env->AddRef();

    HRESULT hr = g_env->CreateCoreWebView2Controller(hwnd, new ControllerHandler(hwnd));
    if (FAILED(hr))
        LogLine(L"CreateCoreWebView2Controller failed hr=0x%08lX", (unsigned long)hr);
    return S_OK;
}

// ---------------------------------------------------------------- WebView2 init

typedef HRESULT (STDMETHODCALLTYPE* PFN_CreateCoreWebView2EnvironmentWithOptions)(
    PCWSTR browserExecutableFolder,
    PCWSTR userDataFolder,
    ICoreWebView2EnvironmentOptions* environmentOptions,
    ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* environmentCreatedHandler);

static bool LoadWebView2Loader()
{
    if (g_loader)
        return true;
    std::wstring dll = ExeDir() + L"\\WebView2Loader.dll";
    g_loader = LoadLibraryW(dll.c_str());
    if (!g_loader) {
        LogLine(L"LoadLibrary failed (%lu) for %ls", GetLastError(), dll.c_str());
        return false;
    }
    return true;
}

static HRESULT InitWebView2(HWND hwnd)
{
    if (!LoadWebView2Loader())
        return HRESULT_FROM_WIN32(GetLastError());

    PFN_CreateCoreWebView2EnvironmentWithOptions fn =
        (PFN_CreateCoreWebView2EnvironmentWithOptions)
            GetProcAddress(g_loader, "CreateCoreWebView2EnvironmentWithOptions");
    if (!fn) {
        LogLine(L"GetProcAddress(CreateCoreWebView2EnvironmentWithOptions) failed");
        return E_FAIL;
    }

    std::wstring userData = ExeDir() + L"\\userdata";
    return fn(nullptr, userData.c_str(), nullptr, new EnvHandler(hwnd));
}

// ---------------------------------------------------------------- window proc

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg) {
    case WM_SETICON: {
        // Keep title bar / taskbar / Alt-Tab icons in sync with the resource icon.
        HICON ic = (HICON)lParam;
        if (wParam == ICON_BIG)      g_hIcon   = ic;
        else if (wParam == ICON_SMALL) g_hIconSm = ic;
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
    case WM_SIZE: {
        if (g_controller) {
            RECT rc;
            GetClientRect(hwnd, &rc);
            g_controller->put_Bounds(rc);
        }
        return 0;
    }
    case WM_GETMINMAXINFO: {
        MINMAXINFO* mmi = (MINMAXINFO*)lParam;
        mmi->ptMinTrackSize.x = 640;
        mmi->ptMinTrackSize.y = 480;
        return 0;
    }
    case WM_DESTROY:
        if (g_webview) { g_webview->Release(); g_webview = nullptr; }
        if (g_controller) { g_controller->Release(); g_controller = nullptr; }
        if (g_env) { g_env->Release(); g_env = nullptr; }
        PostQuitMessage(0);
        return 0;
    default:
        return DefWindowProcW(hwnd, msg, wParam, lParam);
    }
}

// ---------------------------------------------------------------- selftest

static int RunSelfTest()
{
    bool loaderOk = LoadWebView2Loader();
    PFN_CreateCoreWebView2EnvironmentWithOptions fn = nullptr;
    if (loaderOk)
        fn = (PFN_CreateCoreWebView2EnvironmentWithOptions)
                GetProcAddress(g_loader, "CreateCoreWebView2EnvironmentWithOptions");

    bool serverUp = IsPortOpen(kAppHost, kAppPort, 400);

    std::wstring path = ExeDir() + L"\\selftest.log";
    FILE* f = nullptr;
    if (_wfopen_s(&f, path.c_str(), L"w, ccs=UTF-8") == 0 && f) {
        fwprintf(f, L"loader_dll_loaded=%d\n", loaderOk ? 1 : 0);
        fwprintf(f, L"CreateCoreWebView2EnvironmentWithOptions=%d\n", fn ? 1 : 0);
        fwprintf(f, L"server_%d_reachable=%d\n", kAppPort, serverUp ? 1 : 0);
        fclose(f);
    }
    return (loaderOk && fn) ? 0 : 2;
}

// ---------------------------------------------------------------- entry point

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, PWSTR, int nCmdShow)
{
    if (wcsstr(GetCommandLineW(), L"--selftest") != nullptr)
        return RunSelfTest();

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    // Own taskbar group so our resource icon is used instead of the host process icon.
    SetCurrentProcessExplicitAppUserModelID(L"de.novora.app");

    // Icon resource id 1 comes from desktop\native\novora.rc.
    int iconCx = GetSystemMetrics(SM_CXICON);
    int iconCy = GetSystemMetrics(SM_CYICON);
    int smCx   = GetSystemMetrics(SM_CXSMICON);
    int smCy   = GetSystemMetrics(SM_CYSMICON);
    g_hIcon = (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(1), IMAGE_ICON, iconCx, iconCy, 0);
    g_hIconSm = (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(1), IMAGE_ICON, smCx, smCy, 0);
    if (!g_hIcon)   g_hIcon   = LoadIconW(hInstance, MAKEINTRESOURCEW(1));
    if (!g_hIconSm) g_hIconSm = LoadIconW(hInstance, MAKEINTRESOURCEW(1));
    if (!g_hIcon)   { g_hIcon = LoadIconW(nullptr, IDI_APPLICATION); }
    if (!g_hIconSm) { g_hIconSm = g_hIcon; }

    WNDCLASSEXW wc = {0};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hIcon = g_hIcon;
    wc.hIconSm = g_hIconSm;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = kWindowClass;
    if (!RegisterClassExW(&wc)) {
        LogLine(L"RegisterClassEx failed (%lu)", GetLastError());
        return 1;
    }

    int screenW = GetSystemMetrics(SM_CXSCREEN);
    int screenH = GetSystemMetrics(SM_CYSCREEN);
    int x = (screenW - kWindowW) / 2;
    int y = (screenH - kWindowH) / 2;

    HWND hwnd = CreateWindowExW(0, kWindowClass, kWindowTitle,
                                WS_OVERLAPPEDWINDOW,
                                x, y, kWindowW, kWindowH,
                                nullptr, nullptr, hInstance, nullptr);
    if (!hwnd) {
        LogLine(L"CreateWindowEx failed (%lu)", GetLastError());
        return 1;
    }

    // Explicit WM_SETICON pass (also covers shells that ignore WNDCLASSEX icons).
    SendMessageW(hwnd, WM_SETICON, ICON_BIG, (LPARAM)g_hIcon);
    SendMessageW(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)g_hIconSm);

    HRESULT hr = InitWebView2(hwnd);
    if (FAILED(hr)) {
        LogLine(L"InitWebView2 failed hr=0x%08lX", (unsigned long)hr);
        MessageBoxW(hwnd,
                    L"WebView2 wurde nicht gefunden.\n"
                    L"Bitte WebView2Loader.dll neben Novora.exe legen und die\n"
                    L"WebView2-Runtime (Microsoft Edge) installieren.",
                    L"Novora", MB_ICONERROR | MB_OK);
        DestroyWindow(hwnd);
        CoUninitialize();
        return 1;
    }

    ShowWindow(hwnd, nCmdShow);

    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    CoUninitialize();
    return (int)msg.wParam;
}
