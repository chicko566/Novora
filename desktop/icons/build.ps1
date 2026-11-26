# Build the Novora icon helper (Win32 shell + WIC, console).
# Usage: powershell -ExecutionPolicy Bypass -File desktop\icons\build.ps1
$ErrorActionPreference = 'Stop'

# Repo root: desktop\icons -> desktop -> repo
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outDir = Join-Path $root 'dist\tools'
$src = Join-Path $PSScriptRoot 'novora-icons.cpp'

# --- 1. Pick a compiler (same toolchain as desktop\native) ------------------
$preferred = 'D:\Tools\LLVM-MinGW\llvm-mingw-20261020-ucrt-x86_64\bin\x86_64-w64-mingw32-clang++.exe'
$cxx = $null
if (Test-Path $preferred) {
    $cxx = $preferred
} else {
    foreach ($cand in @('x86_64-w64-mingw32-clang++.exe', 'clang++.exe')) {
        $cmd = Get-Command $cand -ErrorAction SilentlyContinue
        if ($cmd) { $cxx = $cmd.Source; break }
    }
}
if (-not $cxx) { throw "Kein clang++ gefunden (weder $preferred noch im PATH)" }

if (-not (Test-Path $src)) { throw "Quelle fehlt: $src" }
New-Item -ItemType Directory -Force $outDir | Out-Null
$exe = Join-Path $outDir 'novora-icons.exe'

Write-Host "Compiler: $cxx"
Write-Host "Kompiliere novora-icons.cpp ..."

# $args is an automatic PowerShell variable — use $cliArgs instead.
$cliArgs = @(
    '-std=c++17', '-O2', '-municode',
    '-DUNICODE', '-D_UNICODE', '-D_WIN32_WINNT=0x0A00',
    '-o', $exe, $src,
    '-lole32', '-loleaut32', '-luuid', '-lshell32', '-lshlwapi',
    '-lwindowscodecs', '-lgdiplus', '-lgdi32', '-luser32', '-ladvapi32'
)
& $cxx @cliArgs
if ($LASTEXITCODE -ne 0) { throw "Kompilierung fehlgeschlagen (Exit $LASTEXITCODE)" }
if (-not (Test-Path $exe)) { throw "novora-icons.exe wurde nicht erzeugt" }

# --- 2. Verify PE header (MZ) ---------------------------------------------
$fs = [System.IO.File]::OpenRead($exe)
try {
    $magic = New-Object byte[] 2
    [void]$fs.Read($magic, 0, 2)
} finally { $fs.Dispose() }
if ($magic[0] -ne 0x4D -or $magic[1] -ne 0x5A) { throw "novora-icons.exe hat keinen gueltigen MZ-Header" }

$size = (Get-Item $exe).Length
Write-Host ""
Write-Host ("Build OK: {0} ({1:N0} Bytes)" -f $exe, $size)
