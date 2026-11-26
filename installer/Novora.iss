; Novora setup script (Inno Setup 6, Unicode).
; Build: ISCC.exe /DMyAppVersion=0.4.0 Novora.iss
; Requires payload\ next to this file (see build.ps1).

#define MyAppName "Novora"
#ifndef MyAppVersion
  #define MyAppVersion "0.4.0"
#endif
#define MyAppPublisher "Novora"
#define MyAppExeName "Novora.exe"
#define MyAppId "{{7C1D9E42-3A6B-4F58-9C2E-0B5A8D41F7C3}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Novora Setup
DefaultDirName={localappdata}\Novora
DefaultGroupName=Novora
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=out
OutputBaseFilename=NovoraSetup-{#MyAppVersion}
SetupIconFile=..\dist\build\novora.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
Uninstallable=yes
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no
AllowNoIcons=yes
DisableReadyPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "german"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "payload\Novora.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "payload\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "payload\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "payload\update.pub"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "payload\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Comment: "Novora starten"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[InstallDelete]
; Alte Dateien aus früheren ZIP-/Skript-Installationen entfernen (Nutzerdaten bleiben).
Type: filesandordirs; Name: "{app}\app\docs"
Type: filesandordirs; Name: "{app}\app\test"
Type: files; Name: "{app}\app\start.bat"
Type: files; Name: "{app}\app\start-hidden.vbs"
Type: files; Name: "{app}\start.bat"
Type: files; Name: "{app}\start-hidden.vbs"
; Fremde Icon-Pakete (Simple Icons, Tabler) und alter Icon-Browser: ersetzt durch iconset.js
Type: files; Name: "{app}\app\web\brands.js"
Type: files; Name: "{app}\app\web\icons.js"
Type: files; Name: "{app}\app\web\icons.html"
Type: files; Name: "{app}\web\brands.js"
Type: files; Name: "{app}\web\icons.js"
Type: files; Name: "{app}\web\icons.html"
Type: files; Name: "{app}\app\web\applogos.js"
Type: filesandordirs; Name: "{app}\app\web\logos"
Type: files; Name: "{app}\web\applogos.js"

[UninstallDelete]
; Nutzerdaten (app\data.json) bleiben bei der Deinstallation absichtlich erhalten.
Type: dirifempty; Name: "{app}\app"

[Code]
var
  LicensePage: TInputQueryWizardPage;
  PendingKey: String;
  EmptyKeyWarned: Boolean;

// Nur A-Z und 0-9 behalten, alles andere (Bindestriche, Leerzeichen) weg.
function NormalizeLicenseKey(const Raw: String): String;
var
  i: Integer;
  ch: String;
begin
  Result := '';
  for i := 1 to Length(Raw) do
  begin
    ch := Uppercase(Copy(Raw, i, 1));
    if ((ch >= 'A') and (ch <= 'Z')) or ((ch >= '0') and (ch <= '9')) then
      Result := Result + ch;
  end;
end;

// NVR + 4 Gruppen zu 5 Zeichen: NVR-XXXXX-XXXXX-XXXXX-XXXXX
function FormatLicenseKey(const Norm: String): String;
begin
  Result := Copy(Norm, 1, 3) + '-' + Copy(Norm, 4, 5) + '-' + Copy(Norm, 9, 5) + '-' +
            Copy(Norm, 14, 5) + '-' + Copy(Norm, 19, 5);
end;

// Lockere Format-/Pruefsummen-Pruefung ohne Netz und ohne Server-Pepper:
// Laenge 27 inkl. Bindestriche und nur Zeichen des Key-Alphabets.
function LicenseKeyProblem(const Raw: String): String;
var
  norm, body, bad, ch: String;
  i: Integer;
begin
  Result := '';
  norm := NormalizeLicenseKey(Raw);
  if norm = '' then Exit;
  if (Length(norm) <> 23) or (Copy(norm, 1, 3) <> 'NVR') then
  begin
    Result := 'Der Lizenzschluessel muss so aussehen: NVR-XXXXX-XXXXX-XXXXX-XXXXX (27 Zeichen).';
    Exit;
  end;
  body := Copy(norm, 4, 20);
  bad := '';
  for i := 1 to Length(body) do
  begin
    ch := Copy(body, i, 1);
    if Pos(ch, '23456789ABCDEFGHJKMNPQRSTVWXYZ') = 0 then
    begin
      if Pos(ch, bad) = 0 then bad := bad + ch;
    end;
  end;
  if bad <> '' then
    Result := 'Diese Zeichen kommen im Lizenzschluessel nicht vor: ' + bad + '.' + #13#10#13#10 +
              'Erlaubt sind 2-9 und A-Z ohne I, L, O und U (keine 0, keine 1).' + #13#10 +
              'Bitte den Schluessel aus der Kaufbestaetigung genau pruefen.';
end;

procedure InitializeWizard();
begin
  LicensePage := CreateInputQueryPage(wpWelcome,
    'Lizenzschluessel',
    'Novora freischalten',
    'Bitte den Lizenzschluessel aus der Kaufbestaetigung eintragen.' + #13#10 +
    'Der Schluessel ist Pflicht: Ohne gueltigen Key wird die Installation nicht fortgesetzt.' + #13#10 +
    'Novora aktiviert ihn beim ersten Start automatisch. Der PC muss dabei online sein.');
  LicensePage.Add('Lizenzschluessel:', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  key, problem: String;
begin
  Result := True;
  if CurPageID <> LicensePage.ID then Exit;

  key := Trim(LicensePage.Values[0]);
  if key = '' then
  begin
    PendingKey := '';
    MsgBox('Bitte den Lizenzschluessel eintragen.' + #13#10#13#10 +
           'Ohne Lizenzschluessel kann Novora nicht installiert werden.',
           mbError, MB_OK);
    Result := False;
    Exit;
  end;

  problem := LicenseKeyProblem(key);
  if problem <> '' then
  begin
    MsgBox(problem, mbError, MB_OK);
    Result := False;
    Exit;
  end;

  PendingKey := FormatLicenseKey(NormalizeLicenseKey(key));
  // Kein Key im Log: nur die Tatsache.
  Log('License key accepted (format only, activation happens on first start).');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  // Die Schluesselseite wird nie uebersprungen.
  Result := False;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  dir, file: String;
begin
  if CurStep <> ssPostInstall then Exit;
  if WizardSilent() then Exit;
  if PendingKey = '' then Exit;

  dir := ExpandConstant('{userappdata}\Novora');
  if not ForceDirectories(dir) then
  begin
    Log('Could not create data directory for pending license key.');
    Exit;
  end;

  file := dir + '\pending-key.txt';
  if SaveStringToFile(file, PendingKey + #13#10, False) then
    Log('Pending license key written; activation runs on first start.')
  else
    Log('Could not write pending license key; app asks on first start.');
end;

function DirVersion(const Base: String): String;
var
  FindRec: TFindRec;
begin
  Result := '';
  if FindFirst(Base + '\*', FindRec) then
  try
    repeat
      if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0)
         and (FindRec.Name <> '.') and (FindRec.Name <> '..')
         and (FindRec.Name <> 'SetupMetrics') and (Result = '') then
        Result := FindRec.Name;
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

function GetWebView2Version(): String;
var
  v: String;
begin
  Result := '';
  // 64-bit machine view
  if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) and (v <> '') and (v <> '0.0.0.0') then
    Result := v
  // 32-bit / WOW6432Node view
  else if RegQueryStringValue(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) and (v <> '') and (v <> '0.0.0.0') then
    Result := v
  // per-user install
  else if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) and (v <> '') and (v <> '0.0.0.0') then
    Result := v
  // Fallback: Evergreen-Runtime liegt als Versionsordner im Programmverzeichnis
  else
  begin
    Result := DirVersion(ExpandConstant('{commonpf32}\Microsoft\EdgeWebView\Application'));
    if Result = '' then Result := DirVersion(ExpandConstant('{commonpf}\Microsoft\EdgeWebView\Application'));
    if Result = '' then Result := DirVersion(ExpandConstant('{localappdata}\Microsoft\EdgeWebView\Application'));
  end;
end;

function InitializeSetup(): Boolean;
var
  ver: String;
begin
  Result := True;
  // Ohne Schluesselabfrage keine Installation: stille Setups werden abgebrochen.
  if WizardSilent() then
  begin
    Log('Silent install refused: a license key must be entered in the wizard.');
    Result := False;
    Exit;
  end;
  ver := GetWebView2Version();
  if ver = '' then
  begin
    Log('WebView2 Evergreen Runtime not found.');
    if not WizardSilent() then
      MsgBox('Microsoft Edge WebView2 Runtime wurde nicht gefunden.' + #13#10#13#10 +
             'Novora zeigt sein Fenster ueber WebView2 an. Ohne die Runtime startet die App nicht.' + #13#10 +
             'Bitte die "Evergreen Standalone Runtime" von Microsoft installieren (kostenlos),' + #13#10 +
             'danach das Setup erneut ausfuehren.' + #13#10#13#10 +
             'Die Installation wird trotzdem fortgesetzt, damit die Deinstallation spaeter moeglich ist.',
             mbInformation, MB_OK);
  end
  else
    Log('WebView2 Runtime found: ' + ver);
end;
