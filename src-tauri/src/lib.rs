use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize, Clone)]
pub struct MonitorDto {
    pub index: usize,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

fn monitor_list(app: &AppHandle) -> Result<Vec<MonitorDto>, String> {
    let monitors = app
        .available_monitors()
        .map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;

    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, m)| {
            let pos = m.position();
            let size = m.size();
            let is_primary = primary
                .as_ref()
                .is_some_and(|p| p.name() == m.name() && p.position() == pos);
            MonitorDto {
                index,
                name: m
                    .name()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("モニタ {}", index + 1)),
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                is_primary,
            }
        })
        .collect())
}

fn place_output_on_monitor(app: &AppHandle, index: usize) -> Result<(), String> {
    let output = app
        .get_webview_window("output")
        .ok_or_else(|| "出力ウィンドウがありません".to_string())?;
    let monitors = app
        .available_monitors()
        .map_err(|e| e.to_string())?;
    let monitor = monitors
        .get(index)
        .ok_or_else(|| format!("モニタ {} がありません", index))?;

    let pos = monitor.position();
    let size = monitor.size();
    output
        .set_decorations(false)
        .map_err(|e| e.to_string())?;
    output
        .set_fullscreen(false)
        .map_err(|e| e.to_string())?;
    output
        .set_position(PhysicalPosition::new(pos.x, pos.y))
        .map_err(|e| e.to_string())?;
    output
        .set_size(PhysicalSize::new(size.width, size.height))
        .map_err(|e| e.to_string())?;
    output
        .set_fullscreen(true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn initial_window_placement(app: &AppHandle) -> Result<(), String> {
    let control = app
        .get_webview_window("control")
        .ok_or_else(|| "操作ウィンドウがありません".to_string())?;

    let monitors = app
        .available_monitors()
        .map_err(|e| e.to_string())?;

    if let Some(m) = monitors.first() {
        let pos = m.position();
        let size = m.size();
        let _ = control.set_position(PhysicalPosition::new(pos.x, pos.y));
        let _ = control.set_size(PhysicalSize::new(size.width, size.height));
        let _ = control.maximize();
    }

    if monitors.len() > 1 {
        place_output_on_monitor(app, 1)?;
    } else if let Some(m) = monitors.first() {
        let output = app
            .get_webview_window("output")
            .ok_or_else(|| "出力ウィンドウがありません".to_string())?;
        let pos = m.position();
        let size = m.size();
        let w = (size.width as f64 * 0.45) as u32;
        let h = (size.height as f64 * 0.45) as u32;
        let _ = output.set_decorations(true);
        let _ = output.set_fullscreen(false);
        let _ = output.set_position(PhysicalPosition::new(
            pos.x + size.width as i32 - w as i32 - 40,
            pos.y + 80,
        ));
        let _ = output.set_size(PhysicalSize::new(w, h));
    }

    Ok(())
}

#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorDto>, String> {
    monitor_list(&app)
}

#[tauri::command]
fn move_output_to_monitor(app: AppHandle, index: usize) -> Result<(), String> {
    place_output_on_monitor(&app, index)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![list_monitors, move_output_to_monitor])
        .setup(|app| {
            let url = WebviewUrl::App("index.html".into());
            let _output = WebviewWindowBuilder::new(app, "output", url)
                .title("出力")
                .inner_size(960.0, 540.0)
                .decorations(false)
                .resizable(true)
                .fullscreen(false)
                .background_color(tauri::window::Color(0, 0, 0, 255))
                .build()
                .map_err(|e| e.to_string())?;

            if let Err(e) = initial_window_placement(app.handle()) {
                eprintln!("初期ウィンドウ配置: {e}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
