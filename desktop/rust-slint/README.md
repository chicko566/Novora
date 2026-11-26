# Novora — native Vorschau (Rust/Slint)

Machbarkeitsnachweis: ein eigenständiges natives Fenster **ohne WebView**.
Rendert ausschließlich das Novora-Layout (Kopfzeile, 5×3-Kachelraster, Statuszeile)
über Slint + FemtoVG. Keine Bilder, keine Netzabrufe, keine fremden Assets.

**Stand: 2026-11-24** — Build ok, Starttest ok.

## Inhalt

```
desktop/rust-slint/
  Cargo.toml          # slint 1, slint-build 1, edition 2021
  build.rs            # slint_build::compile("ui/app.slint")
  ui/app.slint        # Fenster 900x520, #0F1216, Akzent #7C5CFF
  src/main.rs         # AppWindow::new()?.run()
```

## Bauen

Alle Caches liegen auf `D:`, weil `C:` auf diesem Rechner knapp ist.
Toolchain: `rustc`/`cargo` 1.100.0, Target `stable-x86_64-pc-windows-gnu`,
Linker `D:\Tools\mingw64\bin\x86_64-w64-mingw32-gcc.exe` (winlibs, mit `libgcc`).

```powershell
$env:RUSTUP_HOME='D:\Tools\rust'
$env:CARGO_HOME='D:\Tools\cargo'
$env:TMP='D:\Tools\tmp'
$env:TEMP='D:\Tools\tmp'
$env:Path="D:\Tools\mingw64\bin;D:\Tools\cargo\bin;$env:Path"

Set-Location desktop\rust-slint
cargo build --release
```

Erster Lauf lädt die Crates nach `D:\Tools\cargo` (5–10 min). Danach ~1,5 min.

## Starten

```
desktop\rust-slint\target\release\novora-native.exe
```

bzw.

```powershell
Start-Process desktop\rust-slint\target\release\novora-native.exe
```

## Stand des Artefakts

| Punkt | Wert |
|---|---|
| EXE | `desktop\rust-slint\target\release\novora-native.exe` |
| Größe | 8.446.464 Bytes (~8,1 MB, statisch gelinkt) |
| Build | `cargo build --release` → Exit 0 |
| Starttest | 3 s Laufzeit, Prozess lebt, Fenstertitel `Novora` |
| Slint | 1.19.1 |

Die EXE liegt unter `target/` und ist damit nicht Teil des Repos/Installers.

## Grenzen

- **Nur Vorschau.** Keine Anbindung an `server.mjs`, kein Pairing, keine API-Calls,
  kein Zustand, keine Persistenz — die Kacheln sind reine Darstellung.
- Kein WebView2, kein HTML/CSS: Layout ist in Slint-DSL geschrieben.
- Keine Bilder/Logos eingebunden; ein späterer Icon-Satz müsste eigens verdrahtet werden.
- Nicht Teil von `dist/`, Installer oder Update-Manifest — bewusst eigenständig.
- Nur für x86_64 Windows (GNU-Toolchain) gebaut; kein Cross-Build für Android/macOS.
- Klicken auf eine Kachel setzt nur lokal `active-tile` (Demo der Interaktion).
