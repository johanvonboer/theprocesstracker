#[tauri::command]
fn write_secret_file(path: String, content: String) -> Result<(), String> {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }

    file.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![write_secret_file]);

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
