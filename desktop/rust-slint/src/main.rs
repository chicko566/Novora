// Novora - native Vorschau (Rust/Slint)
// Zeigt nur das Layout. Keine Server-, Pairing- oder Asset-Anbindung.

slint::include_modules!();

fn main() -> Result<(), slint::PlatformError> {
    let window = AppWindow::new()?;
    window.run()
}
