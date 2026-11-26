# Baut eine installierbare Debug-APK ohne Gradle/Android Studio.
# Voraussetzung: JDK 17 + Android build-tools + android.jar (Pfade unten anpassen).
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sdk = if ($env:ANDROID_SDK) { $env:ANDROID_SDK } else { 'D:\Tools\android' }
$jdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { (Get-ChildItem "$sdk\jdk" -Directory | Select-Object -First 1).FullName }
$bt = (Get-ChildItem "$sdk\buildtools" -Directory | Select-Object -First 1).FullName
$aj = (Get-ChildItem "$sdk\platform" -Recurse -Filter android.jar | Select-Object -First 1).FullName
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$bt;$env:Path"

$zxing = Join-Path $root 'libs\core-3.5.3.jar'
if (-not (Test-Path $zxing)) {
  throw "ZXing fehlt: $zxing (Download: https://repo1.maven.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar)"
}

$build = Join-Path $root 'build'
Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\flat", "$build\gen", "$build\classes", "$build\dex" | Out-Null

Write-Host "JDK: $jdk"
Write-Host "BuildTools: $bt"
Write-Host "android.jar: $aj"

# 1) Ressourcen kompilieren
$resFiles = Get-ChildItem "$root\res" -Recurse -File | Select-Object -ExpandProperty FullName
& "$bt\aapt2.exe" compile -o "$build\flat" $resFiles
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

# 2) Versionen aus dem Manifest lesen (einzige Quelle der Wahrheit)
$mfText = Get-Content "$root\AndroidManifest.xml" -Raw
if ($mfText -notmatch 'android:versionCode\s*=\s*"(\d+)"') { throw 'versionCode fehlt im Manifest' }
$versionCode = [int]$Matches[1]
if ($mfText -notmatch 'android:versionName\s*=\s*"([^"]+)"') { throw 'versionName fehlt im Manifest' }
$versionName = $Matches[1]
Write-Host "Version: $versionName (code $versionCode)"

# 3) Ressourcen linken (erzeugt base.apk + R.java)
$flats = Get-ChildItem "$build\flat" -Filter *.flat | Select-Object -ExpandProperty FullName
& "$bt\aapt2.exe" link -o "$build\base.apk" -I $aj `
  --manifest "$root\AndroidManifest.xml" `
  --java "$build\gen" `
  --min-sdk-version 26 --target-sdk-version 34 `
  --version-code $versionCode --version-name $versionName `
  --auto-add-overlay $flats
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

# 3) Java kompilieren
$javaFiles = @(Get-ChildItem "$root\src" -Recurse -Filter *.java | Select-Object -ExpandProperty FullName)
$javaFiles += (Get-ChildItem "$build\gen" -Recurse -Filter R.java | Select-Object -ExpandProperty FullName)
& "$jdk\bin\javac.exe" -nowarn -source 8 -target 8 -classpath "$aj;$zxing" -d "$build\classes" $javaFiles 2>$null
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

# 4) DEX bauen (App-Code + ZXing)
& "$jdk\bin\jar.exe" cf "$build\classes.jar" -C "$build\classes" .
& "$bt\d8.bat" --lib $aj --min-api 26 --release --output "$build\dex" "$build\classes.jar" $zxing
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

# 5) classes.dex in die APK
& "$jdk\bin\jar.exe" uf "$build\base.apk" -C "$build\dex" classes.dex
if ($LASTEXITCODE -ne 0) { throw 'jar uf failed' }

# 6) Ausrichten + signieren
& "$bt\zipalign.exe" -f 4 "$build\base.apk" "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

$ks = Join-Path $root 'debug.keystore'
if (-not (Test-Path $ks)) {
  & "$jdk\bin\keytool.exe" -genkeypair -keystore $ks -storepass android -keypass android `
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 `
    -dname "CN=Android Debug,O=Android,C=US"
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

$out = Join-Path $root 'Novora-debug.apk'
& "$bt\apksigner.bat" sign --ks $ks --ks-pass pass:android --key-pass pass:android `
  --out $out "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }

& "$bt\apksigner.bat" verify --print-certs $out | Write-Host
Write-Host ""
Write-Host "FERTIG: $out"
Write-Host ("Groesse: {0:N0} KB" -f ((Get-Item $out).Length / 1KB))
