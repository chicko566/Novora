// novora-icons — Win32 shell helper for Novora (Novora / StreamDeck).
//
// Extracts application icons from installed EXE files (and UWP package assets)
// as high-quality PNG, lists installed apps, and reports the foreground window.
// Console only, single file, no network, no writes besides the requested --out.
//
//   novora-icons.exe --foreground
//   novora-icons.exe --exe <path> --out <png> [--size 256]
//   novora-icons.exe --list
//   novora-icons.exe --uwp <packageFamily> --out <png> [--size 256]
//   novora-icons.exe --help
//
// Every command answers JSON on stdout (except --help). Failures are
// {"ok":false,"error":"code","message":"..."} with exit code 1.

#define INITGUID
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <wincodec.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <map>
#include <string>
#include <vector>

// ---------------------------------------------------------------- text utils

static std::string toUtf8(const std::wstring& s) {
    if (s.empty()) return std::string();
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    if (n <= 0) return std::string();
    std::string out((size_t)n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n, nullptr, nullptr);
    return out;
}

static std::wstring toWide(const std::string& s) {
    if (s.empty()) return std::wstring();
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    if (n <= 0) return std::wstring();
    std::wstring out((size_t)n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n);
    return out;
}

// Escapes RFC 8259 text. Input is UTF-8, non-ASCII bytes stay raw (valid JSON).
static std::string jsonEscRaw(const std::string& u) {
    std::string o;
    o.reserve(u.size() + 16);
    for (size_t i = 0; i < u.size(); ++i) {
        unsigned char c = (unsigned char)u[i];
        switch (c) {
            case '"': o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\r': o += "\\r"; break;
            case '\t': o += "\\t"; break;
            case '\b': o += "\\b"; break;
            case '\f': o += "\\f"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    _snprintf_s(buf, sizeof(buf), _TRUNCATE, "\\u%04x", (unsigned)c);
                    o += buf;
                } else {
                    o += (char)c;
                }
        }
    }
    return o;
}

static std::string jsonEsc(const std::wstring& w) { return jsonEscRaw(toUtf8(w)); }
static std::string jsonEsc(const char* s) { return jsonEscRaw(std::string(s ? s : "")); }

static void emit(const std::string& line) {
    fwrite(line.data(), 1, line.size(), stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static int failJson(const std::string& code, const std::string& message) {
    emit("{\"ok\":false,\"error\":\"" + jsonEscRaw(code) + "\",\"message\":\"" +
         jsonEscRaw(message) + "\"}");
    return 1;
}

static int failJson(const std::string& code, const std::wstring& message) {
    return failJson(code, toUtf8(message));
}

static bool endsWithI(const std::wstring& s, const wchar_t* suffix) {
    size_t n = wcslen(suffix);
    if (s.size() < n) return false;
    return _wcsicmp(s.c_str() + (s.size() - n), suffix) == 0;
}

static bool fileExists(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static std::wstring trimQuotes(const std::wstring& s) {
    size_t b = 0, e = s.size();
    while (b < e && (s[b] == L' ' || s[b] == L'\t' || s[b] == L'"')) ++b;
    while (e > b && (s[e - 1] == L' ' || s[e - 1] == L'\t' || s[e - 1] == L'"')) --e;
    return s.substr(b, e - b);
}

static std::wstring fileNameOf(const std::wstring& p) {
    size_t slash = p.find_last_of(L"\\/");
    return slash == std::wstring::npos ? p : p.substr(slash + 1);
}

static std::wstring stemOf(const std::wstring& p) {
    std::wstring f = fileNameOf(p);
    size_t dot = f.find_last_of(L'.');
    return dot == std::wstring::npos ? f : f.substr(0, dot);
}

struct ComScope {
    HRESULT hr;
    ComScope() : hr(CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)) {}
    ~ComScope() {
        if (SUCCEEDED(hr)) CoUninitialize();
    }
};

// ---------------------------------------------------------------- bitmap -> WIC

struct PixBuf {
    UINT w = 0;
    UINT h = 0;
    bool hasAlpha = false;
    std::vector<BYTE> px;  // top-down BGRA, 32bpp
};

// Copies an HBITMAP into a top-down BGRA buffer and normalises the alpha plane.
static bool captureBitmap(HBITMAP hbmp, PixBuf& out) {
    if (!hbmp) return false;
    BITMAP bm;
    ZeroMemory(&bm, sizeof(bm));
    if (!GetObjectW(hbmp, sizeof(bm), &bm) || bm.bmWidth <= 0 || bm.bmHeight <= 0) return false;
    if (bm.bmWidth > 4096 || bm.bmHeight > 4096) return false;

    BITMAPINFO bi;
    ZeroMemory(&bi, sizeof(bi));
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = bm.bmWidth;
    bi.bmiHeader.biHeight = -bm.bmHeight;  // top-down
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    out.w = (UINT)bm.bmWidth;
    out.h = (UINT)bm.bmHeight;
    out.px.assign((size_t)out.w * out.h * 4, 0);

    HDC hdc = GetDC(nullptr);
    if (!hdc) return false;
    int got = GetDIBits(hdc, hbmp, 0, out.h, out.px.data(), &bi, DIB_RGB_COLORS);
    ReleaseDC(nullptr, hdc);
    if (got <= 0) return false;

    for (size_t i = 3; i < out.px.size(); i += 4) {
        if (out.px[i]) {
            out.hasAlpha = true;
            break;
        }
    }
    if (!out.hasAlpha) {
        for (size_t i = 3; i < out.px.size(); i += 4) out.px[i] = 255;
    }
    return true;
}

// Encodes a WIC source as PNG, scaled to size x size when requested.
static bool encodePng(IWICImagingFactory* fac, IWICBitmapSource* src, const std::wstring& outPath,
                      int size, int* outW, int* outH) {
    if (!fac || !src) return false;

    UINT sw = 0, sh = 0;
    if (FAILED(src->GetSize(&sw, &sh)) || sw == 0 || sh == 0) return false;

    IWICBitmapScaler* scaler = nullptr;
    IWICBitmapSource* finalSrc = src;
    if (size > 0 && ((int)sw != size || (int)sh != size)) {
        if (FAILED(fac->CreateBitmapScaler(&scaler))) return false;
        WICBitmapInterpolationMode mode = (size < (int)sw) ? WICBitmapInterpolationModeFant
                                                          : WICBitmapInterpolationModeCubic;
        HRESULT hr = scaler->Initialize(src, (UINT)size, (UINT)size, mode);
        if (FAILED(hr)) {
            scaler->Release();
            return false;
        }
        finalSrc = scaler;
        sw = sh = (UINT)size;
    }

    IWICStream* stream = nullptr;
    IWICBitmapEncoder* enc = nullptr;
    IWICBitmapFrameEncode* frame = nullptr;
    IPropertyBag2* props = nullptr;
    bool ok = false;

    do {
        if (FAILED(fac->CreateStream(&stream))) break;
        if (FAILED(stream->InitializeFromFilename(outPath.c_str(), GENERIC_WRITE))) break;
        if (FAILED(fac->CreateEncoder(GUID_ContainerFormatPng, nullptr, &enc))) break;
        if (FAILED(enc->Initialize(stream, WICBitmapEncoderNoCache))) break;
        if (FAILED(enc->CreateNewFrame(&frame, &props))) break;
        if (FAILED(frame->Initialize(props))) break;
        if (FAILED(frame->SetSize(sw, sh))) break;
        frame->SetResolution(96.0, 96.0);
        WICPixelFormatGUID pf = GUID_WICPixelFormat32bppPBGRA;
        frame->SetPixelFormat(&pf);  // advisory; encoder converts as needed
        if (FAILED(frame->WriteSource(finalSrc, nullptr))) break;
        if (FAILED(frame->Commit())) break;
        if (FAILED(enc->Commit())) break;
        ok = true;
    } while (false);

    if (props) props->Release();
    if (frame) frame->Release();
    if (enc) enc->Release();
    if (stream) stream->Release();
    if (scaler) scaler->Release();

    if (ok) {
        if (outW) *outW = (int)sw;
        if (outH) *outH = (int)sh;
    }
    return ok;
}

static bool encodePixBuf(IWICImagingFactory* fac, const PixBuf& bmp, const std::wstring& outPath,
                         int size, int* outW, int* outH) {
    const UINT stride = bmp.w * 4;
    const GUID fmt = bmp.hasAlpha ? GUID_WICPixelFormat32bppPBGRA : GUID_WICPixelFormat32bppBGR;
    IWICBitmap* wic = nullptr;
    HRESULT hr = fac->CreateBitmapFromMemory(bmp.w, bmp.h, fmt, stride, (UINT)bmp.px.size(),
                                             const_cast<BYTE*>(bmp.px.data()), &wic);
    if (FAILED(hr) || !wic) return false;
    bool ok = encodePng(fac, wic, outPath, size, outW, outH);
    wic->Release();
    return ok;
}

// Decodes PNG/ICO/JPG via WIC and re-encodes as PNG (used for UWP assets).
static bool convertImageFile(const std::wstring& srcFile, const std::wstring& outPath, int size,
                             int* outW, int* outH) {
    IWICImagingFactory* fac = nullptr;
    if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&fac))))
        return false;

    IWICBitmapDecoder* dec = nullptr;
    IWICBitmapFrameDecode* frame = nullptr;
    IWICFormatConverter* conv = nullptr;
    bool ok = false;

    if (SUCCEEDED(fac->CreateDecoderFromFilename(srcFile.c_str(), nullptr, GENERIC_READ,
                                                 WICDecodeMetadataCacheOnLoad, &dec)) &&
        SUCCEEDED(dec->GetFrame(0, &frame)) && SUCCEEDED(fac->CreateFormatConverter(&conv)) &&
        SUCCEEDED(conv->Initialize(frame, GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone,
                                   nullptr, 0.0, WICBitmapPaletteTypeCustom))) {
        ok = encodePng(fac, conv, outPath, size, outW, outH);
    }

    if (conv) conv->Release();
    if (frame) frame->Release();
    if (dec) dec->Release();
    fac->Release();
    return ok;
}

// --------------------------------------------------------------- icon sources

static HBITMAP iconToBitmap(HICON hicon, int size) {
    if (!hicon) return nullptr;
    HDC screen = GetDC(nullptr);
    if (!screen) return nullptr;

    BITMAPINFO bi;
    ZeroMemory(&bi, sizeof(bi));
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = size;
    bi.bmiHeader.biHeight = -size;
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    void* bits = nullptr;
    HBITMAP hbmp = CreateDIBSection(screen, &bi, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (hbmp && bits) {
        HDC mem = CreateCompatibleDC(screen);
        if (mem) {
            HGDIOBJ old = SelectObject(mem, hbmp);
            DrawIconEx(mem, 0, 0, hicon, size, size, 0, nullptr, DI_NORMAL);
            SelectObject(mem, old);
            DeleteDC(mem);
        } else {
            DeleteObject(hbmp);
            hbmp = nullptr;
        }
    }
    ReleaseDC(nullptr, screen);
    return hbmp;
}

static bool isShellName(const std::wstring& p) {
    return p.size() >= 6 && _wcsnicmp(p.c_str(), L"shell:", 6) == 0;
}

// IShellItemImageFactory first: returns the jumbo (256) icon of an EXE or a
// shell: parsing name such as shell:AppsFolder\<pkg>!<AppId>.
static bool shellItemIcon(const std::wstring& path, int size, HBITMAP* out) {
    IShellItemImageFactory* factory = nullptr;
    HRESULT hr = SHCreateItemFromParsingName(path.c_str(), nullptr, IID_IShellItemImageFactory,
                                             (void**)&factory);
    if (FAILED(hr) || !factory) return false;
    SIZE sz;
    sz.cx = size;
    sz.cy = size;
    hr = factory->GetImage(sz, (SIIGBF)(SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK), out);
    factory->Release();
    return SUCCEEDED(hr) && *out != nullptr;
}

static bool extractIconChain(const std::wstring& path, int size, HBITMAP* out) {
    if (shellItemIcon(path, size, out)) return true;
    if (!isShellName(path) && fileExists(path)) {
        HICON large = nullptr;
        UINT n = ExtractIconExW(path.c_str(), 0, &large, nullptr, 1);
        if (n > 0 && large) {
            HBITMAP bmp = iconToBitmap(large, size);
            DestroyIcon(large);
            if (bmp) {
                *out = bmp;
                return true;
            }
        }
        SHFILEINFOW sfi;
        ZeroMemory(&sfi, sizeof(sfi));
        if (SHGetFileInfoW(path.c_str(), 0, &sfi, sizeof(sfi), SHGFI_ICON | SHGFI_LARGEICON) &&
            sfi.hIcon) {
            HBITMAP bmp = iconToBitmap(sfi.hIcon, size);
            DestroyIcon(sfi.hIcon);
            if (bmp) {
                *out = bmp;
                return true;
            }
        }
    }
    return false;
}

static bool ensureParentDir(const std::wstring& file) {
    size_t slash = file.find_last_of(L"\\/");
    if (slash == std::wstring::npos) return true;
    std::wstring dir = file.substr(0, slash);
    if (dir.empty()) return true;
    DWORD a = GetFileAttributesW(dir.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

static int writeIconPng(const std::wstring& source, const std::wstring& outPath, int size) {
    if (!ensureParentDir(outPath))
        return failJson("no_output_dir", L"Ausgabeordner existiert nicht: " + outPath);

    HBITMAP hbmp = nullptr;
    if (!extractIconChain(source, size, &hbmp))
        return failJson("no_icon", L"Kein Icon gefunden fuer: " + source);

    PixBuf bmp;
    bool captured = captureBitmap(hbmp, bmp);
    DeleteObject(hbmp);
    if (!captured) return failJson("decode_failed", L"Bitmap konnte nicht gelesen werden: " + source);

    IWICImagingFactory* fac = nullptr;
    if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                IID_PPV_ARGS(&fac))))
        return failJson("wic_failed", "WIC-ImagingFactory nicht verfuegbar");

    int w = 0, h = 0;
    bool ok = encodePixBuf(fac, bmp, outPath, size, &w, &h);
    fac->Release();
    if (!ok) return failJson("write_failed", L"PNG konnte nicht geschrieben werden: " + outPath);

    emit("{\"ok\":true,\"source\":\"" + jsonEsc(source) + "\",\"out\":\"" + jsonEsc(outPath) +
         "\",\"width\":" + std::to_string(w) + ",\"height\":" + std::to_string(h) + "}");
    return 0;
}

// ------------------------------------------------------------------ foreground

static int cmdForeground() {
    HWND hwnd = GetForegroundWindow();
    if (!hwnd) return failJson("no_foreground", "Kein Vordergrundfenster");

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (!pid) return failJson("no_process", "Fenstern ist kein Prozess zugeordnet");

    HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!proc) return failJson("open_process_failed", "OpenProcess abgelehnt (PID " + std::to_string(pid) + ")");

    WCHAR exe[32768];
    DWORD size = (DWORD)(sizeof(exe) / sizeof(exe[0]));
    BOOL got = QueryFullProcessImageNameW(proc, 0, exe, &size);
    CloseHandle(proc);
    if (!got || size == 0) return failJson("query_path_failed", "Prozesspfad nicht lesbar");

    std::wstring path(exe, size);

    // Window titles of UWP frames are often empty; climb to the root owner.
    std::wstring title;
    for (HWND h = hwnd; h; h = GetAncestor(h, GA_ROOTOWNER)) {
        int len = GetWindowTextLengthW(h);
        if (len <= 0) continue;
        std::wstring buf((size_t)len + 1, L'\0');
        int gotLen = GetWindowTextW(h, &buf[0], len + 1);
        if (gotLen > 0) {
            buf.resize((size_t)gotLen);
            title = buf;
            break;
        }
        if (h == GetAncestor(h, GA_ROOTOWNER)) break;
    }

    emit("{\"ok\":true,\"path\":\"" + jsonEsc(path) + "\",\"title\":\"" + jsonEsc(title) +
         "\",\"process\":\"" + jsonEsc(stemOf(path)) + "\",\"pid\":" + std::to_string(pid) + "}");
    return 0;
}

// ----------------------------------------------------------------------- list

struct AppEntry {
    std::wstring name;
    std::wstring path;
    std::wstring source;
};

typedef std::map<std::wstring, size_t> SeenMap;

static void addApp(std::vector<AppEntry>& apps, SeenMap& seen, const std::wstring& name,
                   const std::wstring& path, const wchar_t* source) {
    if (name.empty() || path.empty()) return;
    if (apps.size() >= 900) return;
    std::wstring key = path;
    for (size_t i = 0; i < key.size(); ++i) key[i] = towlower(key[i]);
    if (seen.find(key) != seen.end()) return;
    seen[key] = apps.size();
    AppEntry e;
    e.name = name.size() > 120 ? name.substr(0, 120) : name;
    e.path = path;
    e.source = source;
    apps.push_back(e);
}

static bool resolveShortcut(const std::wstring& lnk, std::wstring& target) {
    IShellLinkW* link = nullptr;
    if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_IShellLinkW,
                                (void**)&link)))
        return false;
    bool ok = false;
    IPersistFile* pf = nullptr;
    if (SUCCEEDED(link->QueryInterface(IID_IPersistFile, (void**)&pf))) {
        if (SUCCEEDED(pf->Load(lnk.c_str(), STGM_READ))) {
            WCHAR buf[2048];
            ZeroMemory(buf, sizeof(buf));
            WIN32_FIND_DATAW wfd;
            ZeroMemory(&wfd, sizeof(wfd));
            if (SUCCEEDED(link->GetPath(buf, 2048, &wfd, SLGP_RAWPATH)) && buf[0]) {
                target = buf;
                ok = endsWithI(target, L".exe");
            }
        }
        pf->Release();
    }
    link->Release();
    return ok;
}

static void scanStartMenuDir(const std::wstring& dir, int depth, std::vector<AppEntry>& apps,
                             SeenMap& seen) {
    if (depth > 6 || dir.empty()) return;
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileW((dir + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) return;
    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        std::wstring full = dir + L"\\" + fd.cFileName;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            scanStartMenuDir(full, depth + 1, apps, seen);
        } else if (endsWithI(full, L".lnk")) {
            std::wstring target;
            if (resolveShortcut(full, target) && fileExists(target))
                addApp(apps, seen, stemOf(full), target, L"startmenu");
        }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
}

static void scanStartMenu(std::vector<AppEntry>& apps, SeenMap& seen) {
    const int folders[2] = {CSIDL_PROGRAMS, CSIDL_COMMON_PROGRAMS};
    for (int i = 0; i < 2; ++i) {
        WCHAR dir[MAX_PATH + 1];
        ZeroMemory(dir, sizeof(dir));
        if (SUCCEEDED(SHGetFolderPathW(nullptr, folders[i], nullptr, SHGFP_TYPE_CURRENT, dir)) &&
            dir[0])
            scanStartMenuDir(dir, 0, apps, seen);
    }
}

static void scanAppPaths(HKEY root, const wchar_t* sub, std::vector<AppEntry>& apps, SeenMap& seen) {
    HKEY key;
    if (RegOpenKeyExW(root, sub, 0, KEY_READ, &key) != ERROR_SUCCESS) return;
    DWORD index = 0;
    for (;;) {
        WCHAR name[512];
        DWORD nameLen = (DWORD)(sizeof(name) / sizeof(name[0]));
        FILETIME ft;
        LONG r = RegEnumKeyExW(key, index++, name, &nameLen, nullptr, nullptr, nullptr, &ft);
        if (r != ERROR_SUCCESS) break;

        HKEY sk;
        if (RegOpenKeyExW(key, name, 0, KEY_READ, &sk) != ERROR_SUCCESS) continue;
        WCHAR value[2048];
        DWORD valueLen = sizeof(value);
        DWORD type = 0;
        if (RegQueryValueExW(sk, nullptr, nullptr, &type, (LPBYTE)value, &valueLen) == ERROR_SUCCESS &&
            (type == REG_SZ || type == REG_EXPAND_SZ)) {
            size_t chars = wcsnlen(value, (size_t)(sizeof(value) / sizeof(value[0])));
            std::wstring p = trimQuotes(std::wstring(value, chars));
            if (type == REG_EXPAND_SZ) {
                WCHAR expanded[2048];
                ZeroMemory(expanded, sizeof(expanded));
                if (ExpandEnvironmentStringsW(p.c_str(), expanded,
                                               (DWORD)(sizeof(expanded) / sizeof(expanded[0]))) > 0)
                    p = expanded;
            }
            if (endsWithI(p, L".exe") && fileExists(p)) {
                std::wstring appName = name;
                if (endsWithI(appName, L".exe")) appName = stemOf(appName);
                addApp(apps, seen, appName, p, L"apppaths");
            }
        }
        RegCloseKey(sk);
    }
    RegCloseKey(key);
}

// shell:AppsFolder — UWP apps appear as "<familyName>!<AppId>", desktop apps as
// plain EXE paths. No UWP activation COM needed for listing.
static std::wstring resolveKnownFolder(const std::wstring& p) {
    if (p.size() < 39 || p[0] != L'{') return p;
    size_t close = p.find(L'}');
    if (close == std::wstring::npos) return p;
    GUID g;
    if (FAILED(CLSIDFromString(p.substr(0, close + 1).c_str(), &g))) return p;
    PWSTR base = nullptr;
    if (FAILED(SHGetKnownFolderPath(g, KF_FLAG_DEFAULT, nullptr, &base)) || !base) return p;
    std::wstring out(base);
    CoTaskMemFree(base);
    std::wstring rest = p.substr(close + 1);
    if (!rest.empty() && rest[0] == L'\\') out += rest;
    return out;
}

static void dbg(const char* stage, HRESULT hr) {
    if (!GetEnvironmentVariableW(L"NOVORA_ICONS_DEBUG", nullptr, 0)) return;
    char buf[160];
    _snprintf_s(buf, sizeof(buf), _TRUNCATE, "dbg %s hr=0x%08lx\n", stage, (unsigned long)hr);
    fputs(buf, stderr);
}

static void scanAppsFolder(std::vector<AppEntry>& apps, SeenMap& seen) {
    PIDLIST_ABSOLUTE rootPidl = nullptr;
    HRESULT hrParse = SHParseDisplayName(L"shell:AppsFolder", nullptr, &rootPidl, 0, nullptr);
    dbg("parse", hrParse);
    if (FAILED(hrParse)) return;

    IShellFolder* folder = nullptr;
    HRESULT hrBind = SHBindToObject(nullptr, rootPidl, nullptr, IID_IShellFolder, (void**)&folder);
    dbg("bind", hrBind);
    if (SUCCEEDED(hrBind)) {
        IEnumIDList* enumIds = nullptr;
        HRESULT hrEnum = folder->EnumObjects(nullptr, SHCONTF_FOLDERS | SHCONTF_NONFOLDERS,
                                             &enumIds);
        dbg("enum", hrEnum);
        if (SUCCEEDED(hrEnum)) {
            LPITEMIDLIST child = nullptr;
            ULONG fetched = 0;
            int guard = 0;
            HRESULT hrNext = S_FALSE;
            while ((hrNext = enumIds->Next(1, &child, &fetched)) == S_OK && fetched == 1 &&
                   guard++ < 900) {
                WCHAR display[512];
                ZeroMemory(display, sizeof(display));
                STRRET strret;
                ZeroMemory(&strret, sizeof(strret));
                if (SUCCEEDED(folder->GetDisplayNameOf(child, SHGDN_NORMAL, &strret)))
                    StrRetToBufW(&strret, child, display,
                                 (UINT)(sizeof(display) / sizeof(display[0])));

                PWSTR parsing = nullptr;
                HRESULT hrName = SHGetNameFromIDList(child, SIGDN_DESKTOPABSOLUTEPARSING, &parsing);
                std::wstring parsed;
                if (SUCCEEDED(hrName) && parsing) {
                    parsed = parsing;
                    CoTaskMemFree(parsing);
                } else {
                    // AppsFolder children are not file-system items: the shell
                    // parsing name comes from SHGDN_FORPARSING instead.
                    STRRET fp;
                    ZeroMemory(&fp, sizeof(fp));
                    if (SUCCEEDED(folder->GetDisplayNameOf(child, SHGDN_FORPARSING, &fp))) {
                        WCHAR buf[1024];
                        ZeroMemory(buf, sizeof(buf));
                        if (SUCCEEDED(StrRetToBufW(&fp, child, buf,
                                                   (UINT)(sizeof(buf) / sizeof(buf[0])))))
                            parsed = buf;
                    }
                }
                if (guard <= 3 && GetEnvironmentVariableW(L"NOVORA_ICONS_DEBUG", nullptr, 0)) {
                    char buf[360];
                    _snprintf_s(buf, sizeof(buf), _TRUNCATE, "dbg name disp=%ls parsed=%ls\n", display,
                                parsed.empty() ? L"(empty)" : parsed.c_str());
                    fputs(buf, stderr);
                }
                if (!parsed.empty()) {
                    std::wstring p = resolveKnownFolder(parsed);
                    std::wstring path;
                    if (endsWithI(p, L".exe") && fileExists(p))
                        path = p;
                    else if (p.find(L'!') != std::wstring::npos)
                        path = L"shell:AppsFolder\\" + p;
                    if (!path.empty())
                        addApp(apps, seen, display[0] ? std::wstring(display) : p, path,
                               L"appsfolder");
                }
                CoTaskMemFree(child);
                child = nullptr;
            }
            enumIds->Release();
            if (GetEnvironmentVariableW(L"NOVORA_ICONS_DEBUG", nullptr, 0)) {
                char buf[160];
                _snprintf_s(buf, sizeof(buf), _TRUNCATE, "dbg next hr=0x%08lx count=%d\n",
                            (unsigned long)hrNext, guard);
                fputs(buf, stderr);
            }
        }
        folder->Release();
    }
    CoTaskMemFree(rootPidl);
}

static int cmdList() {
    std::vector<AppEntry> apps;
    SeenMap seen;
    scanStartMenu(apps, seen);
    scanAppPaths(HKEY_CURRENT_USER, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",
                 apps, seen);
    scanAppPaths(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths",
                 apps, seen);
    scanAppPaths(HKEY_LOCAL_MACHINE,
                 L"SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths", apps,
                 seen);
    scanAppsFolder(apps, seen);

    // Same display name from several sources: keep the first (Start Menu wins).
    std::vector<AppEntry> unique;
    std::map<std::wstring, size_t> byName;
    for (size_t i = 0; i < apps.size(); ++i) {
        std::wstring key = apps[i].name;
        for (size_t k = 0; k < key.size(); ++k) key[k] = towlower(key[k]);
        if (byName.find(key) != byName.end()) continue;
        byName[key] = unique.size();
        unique.push_back(apps[i]);
        if (unique.size() >= 600) break;
    }

    std::sort(unique.begin(), unique.end(), [](const AppEntry& a, const AppEntry& b) {
        return _wcsicmp(a.name.c_str(), b.name.c_str()) < 0;
    });

    std::string out = "[";
    for (size_t i = 0; i < unique.size(); ++i) {
        if (i) out += ",";
        out += "{\"name\":\"" + jsonEsc(unique[i].name) + "\",\"path\":\"" +
               jsonEsc(unique[i].path) + "\",\"source\":\"" + jsonEsc(unique[i].source) + "\"}";
    }
    out += "]";
    emit(out);
    return 0;
}

// ------------------------------------------------------------------------ UWP

static bool readTextFile(const std::wstring& file, std::string& out) {
    HANDLE h = CreateFileW(file.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER sz;
    if (!GetFileSizeEx(h, &sz) || sz.QuadPart <= 0 || sz.QuadPart > (8 << 20)) {
        CloseHandle(h);
        return false;
    }
    std::vector<char> buf((size_t)sz.QuadPart);
    DWORD read = 0;
    BOOL ok = ReadFile(h, buf.data(), (DWORD)buf.size(), &read, nullptr);
    CloseHandle(h);
    if (!ok || read == 0) return false;

    if (buf.size() >= 2 && (unsigned char)buf[0] == 0xFF && (unsigned char)buf[1] == 0xFE) {
        out = toUtf8(std::wstring((const wchar_t*)(buf.data() + 2), (buf.size() - 2) / 2));
        return true;
    }
    if (buf.size() >= 2 && (unsigned char)buf[0] == 0x3C && buf[1] == 0) {
        out = toUtf8(std::wstring((const wchar_t*)buf.data(), buf.size() / 2));
        return true;
    }
    out.assign(buf.data(), (size_t)read);
    return true;
}

static bool findPackageRoot(const std::wstring& family, std::wstring& root) {
    const wchar_t* sub =
        L"SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\"
        L"AppModel\\Repository\\Packages";
    HKEY roots[2] = {HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    for (int r = 0; r < 2; ++r) {
        HKEY key;
        if (RegOpenKeyExW(roots[r], sub, 0, KEY_READ, &key) != ERROR_SUCCESS) continue;
        DWORD index = 0;
        for (;;) {
            WCHAR name[512];
            DWORD nameLen = (DWORD)(sizeof(name) / sizeof(name[0]));
            FILETIME ft;
            if (RegEnumKeyExW(key, index++, name, &nameLen, nullptr, nullptr, nullptr, &ft) !=
                ERROR_SUCCESS)
                break;
            HKEY sk;
            if (RegOpenKeyExW(key, name, 0, KEY_READ, &sk) != ERROR_SUCCESS) continue;
            WCHAR fam[512];
            DWORD famLen = sizeof(fam);
            DWORD type = 0;
            if (RegQueryValueExW(sk, L"PackageFamilyName", nullptr, &type, (LPBYTE)fam, &famLen) ==
                    ERROR_SUCCESS &&
                _wcsicmp(fam, family.c_str()) == 0) {
                WCHAR pr[2048];
                DWORD prLen = sizeof(pr);
                DWORD prType = 0;
                if (RegQueryValueExW(sk, L"PackageRoot", nullptr, &prType, (LPBYTE)pr, &prLen) ==
                        ERROR_SUCCESS &&
                    pr[0]) {
                    root = pr;
                    RegCloseKey(sk);
                    RegCloseKey(key);
                    return true;
                }
            }
            RegCloseKey(sk);
        }
        RegCloseKey(key);
    }
    return false;
}

static bool attrValue(const std::string& xml, const char* attr, std::string& value) {
    std::string needle = std::string(attr) + "=\"";
    size_t pos = xml.find(needle);
    if (pos == std::string::npos) return false;
    pos += needle.size();
    size_t end = xml.find('"', pos);
    if (end == std::string::npos) return false;
    value = xml.substr(pos, end - pos);
    return !value.empty();
}

static bool appIdFromManifest(const std::string& xml, std::string& id) {
    size_t app = xml.find("<Application");
    if (app == std::string::npos) return false;
    size_t end = xml.find('>', app);
    if (end == std::string::npos) end = xml.size();
    return attrValue(xml.substr(app, end - app), "Id", id);
}

static int cmdUwp(const std::wstring& family, const std::wstring& outPath, int size) {
    std::wstring pkgRoot;
    if (!findPackageRoot(family, pkgRoot))
        return failJson("package_not_found", L"Paket nicht gefunden: " + family);

    std::string manifest;
    std::wstring manifestPath = pkgRoot + L"\\AppxManifest.xml";
    if (!readTextFile(manifestPath, manifest))
        return failJson("manifest_missing", L"AppxManifest.xml nicht lesbar: " + manifestPath);

    const char* logoAttrs[3] = {"Square44x44Logo", "Square150x150Logo", "Logo"};
    for (int i = 0; i < 3; ++i) {
        std::string rel;
        if (!attrValue(manifest, logoAttrs[i], rel)) continue;
        if (rel.rfind("ms-resource:", 0) == 0) continue;
        for (size_t k = 0; k < rel.size(); ++k)
            if (rel[k] == '/') rel[k] = '\\';
        std::wstring asset = pkgRoot + L"\\" + toWide(rel);
        if (!fileExists(asset)) continue;
        int w = 0, h = 0;
        if (convertImageFile(asset, outPath, size, &w, &h)) {
            emit("{\"ok\":true,\"package\":\"" + jsonEsc(family) + "\",\"source\":\"manifest\"," +
                 "\"asset\":\"" + jsonEsc(asset) + "\",\"out\":\"" + jsonEsc(outPath) +
                 "\",\"width\":" + std::to_string(w) + ",\"height\":" + std::to_string(h) + "}");
            return 0;
        }
    }

    std::string appId;
    if (!appIdFromManifest(manifest, appId)) appId = "App";
    std::wstring shellName =
        L"shell:AppsFolder\\" + family + L"!" + toWide(appId);
    int rc = writeIconPng(shellName, outPath, size);
    if (rc == 0) return 0;

    if (appId != "App") return writeIconPng(L"shell:AppsFolder\\" + family + L"!App", outPath, size);
    return rc;
}

// ----------------------------------------------------------------------- main

static void printHelp() {
    emit("novora-icons 1.0 - Novora icon helper");
    emit("");
    emit("  --foreground                     active window: path, title, process");
    emit("  --exe <path> --out <png>         extract an icon as PNG");
    emit("  --list                           installed apps (startmenu, app paths, shell:AppsFolder)");
    emit("  --uwp <packageFamily> --out <png> extract a UWP package logo");
    emit("  --size <px>                      target size, 16..1024 (default 256)");
    emit("  --help                           this text");
    emit("");
    emit("All commands except --help answer JSON. Failures exit with code 1.");
}

int wmain(int argc, wchar_t** argv) {
    if (argc <= 1) {
        printHelp();
        return 0;
    }

    std::wstring mode;
    std::wstring exePath;
    std::wstring uwpFamily;
    std::wstring outPath;
    int size = 256;

    for (int i = 1; i < argc; ++i) {
        std::wstring a = argv[i];
        if (a == L"--help" || a == L"-h" || a == L"/?") {
            printHelp();
            return 0;
        } else if (a == L"--foreground" || a == L"--list") {
            mode = a;
        } else if (a == L"--exe" || a == L"--uwp" || a == L"--out" || a == L"--size") {
            if (i + 1 >= argc) return failJson("missing_value", L"Wert fehlt fuer " + a);
            std::wstring v = argv[++i];
            if (a == L"--exe") {
                mode = L"--exe";
                exePath = v;
            } else if (a == L"--uwp") {
                mode = L"--uwp";
                uwpFamily = v;
            } else if (a == L"--out") {
                outPath = v;
            } else {
                wchar_t* endp = nullptr;
                long n = wcstol(v.c_str(), &endp, 10);
                if (!endp || *endp || n < 16 || n > 1024)
                    return failJson("bad_size", L"--size muss 16..1024 sein: " + v);
                size = (int)n;
            }
        } else {
            return failJson("unknown_argument", L"Unbekanntes Argument: " + a);
        }
    }

    ComScope com;
    if (FAILED(com.hr) && com.hr != RPC_E_CHANGED_MODE)
        return failJson("com_failed", "COM-Initialisierung fehlgeschlagen");

    if (mode == L"--foreground") return cmdForeground();
    if (mode == L"--list") return cmdList();

    if (mode == L"--exe") {
        if (exePath.empty()) return failJson("missing_path", "--exe ohne Pfad");
        if (outPath.empty()) return failJson("missing_out", "--exe ohne --out");
        std::wstring path = exePath;
        if (!isShellName(path)) {
            WCHAR full[32768];
            DWORD n = GetFullPathNameW(path.c_str(), 32768, full, nullptr);
            if (n > 0 && n < 32768) path.assign(full, n);
        }
        return writeIconPng(path, outPath, size);
    }

    if (mode == L"--uwp") {
        if (uwpFamily.empty()) return failJson("missing_package", "--uwp ohne Paketfamilie");
        if (outPath.empty()) return failJson("missing_out", "--uwp ohne --out");
        return cmdUwp(uwpFamily, outPath, size);
    }

    return failJson("no_mode", "Kein Kommando angegeben (--help zeigt die Liste)");
}
