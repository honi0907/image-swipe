use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

mod ble_remote;
mod remote_cue;
mod remote_lan;

use serde::Serialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

static VIDEO_PREP_LOCK: Mutex<()> = Mutex::new(());

fn video_cache_key(path: &str) -> u64 {
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    if let Ok(m) = std::fs::metadata(path) {
        m.len().hash(&mut h);
        if let Ok(t) = m.modified() {
            t.hash(&mut h);
        }
    }
    h.finish()
}

fn tool_path(name: &str) -> Option<PathBuf> {
    let output = Command::new("where.exe")
        .arg(name)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(PathBuf::from)
}

fn video_codec(ffprobe: &Path, path: &str) -> Option<String> {
    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "csv=p=0",
            path,
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_ascii_lowercase();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

fn webview_can_play(codec: &str) -> bool {
    matches!(codec, "h264" | "avc1" | "vp8" | "vp9" | "av1")
}

fn prepare_video_sync(app: &AppHandle, path: String) -> Result<String, String> {
    let _guard = VIDEO_PREP_LOCK.lock().map_err(|e| e.to_string())?;
    let src = Path::new(&path);
    if !src.is_file() {
        return Err("ファイルがありません".to_string());
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "mov" && ext != "m4v" {
        return Ok(path);
    }

    let Some(ffmpeg) = tool_path("ffmpeg") else {
        return Ok(path);
    };
    let Some(ffprobe) = tool_path("ffprobe") else {
        return Ok(path);
    };
    let codec = video_codec(&ffprobe, &path).unwrap_or_default();
    if webview_can_play(&codec) {
        return Ok(path);
    }

    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let sub = cache.join("video_prep");
    std::fs::create_dir_all(&sub).map_err(|e| e.to_string())?;
    let out = sub.join(format!("{:016x}_h264.mp4", video_cache_key(&path)));
    if out.is_file() {
        return Ok(out.to_string_lossy().into_owned());
    }

    let status = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            &path,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
        ])
        .arg(&out)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() || !out.is_file() {
        let _ = std::fs::remove_file(&out);
        return Err("HEVC などの MOV を H.264 に変換できませんでした".to_string());
    }
    Ok(out.to_string_lossy().into_owned())
}

fn capture_video_poster_sync(app: &AppHandle, path: String) -> Result<String, String> {
    let src = Path::new(&path);
    if !src.is_file() {
        return Err("ファイルがありません".to_string());
    }
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    let sub = cache.join("video_posters");
    std::fs::create_dir_all(&sub).map_err(|e| e.to_string())?;
    let out = sub.join(format!("{:016x}.jpg", video_cache_key(&path)));
    if out.is_file() {
        return Ok(out.to_string_lossy().into_owned());
    }
    let Some(ffmpeg) = tool_path("ffmpeg") else {
        return Err("ffmpeg が見つかりません".to_string());
    };
    let out_str = out.to_str().ok_or("出力パスが無効です")?;
    let status = Command::new(&ffmpeg)
        .args([
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "0.5",
            "-i",
            &path,
            "-frames:v",
            "1",
            "-q:v",
            "4",
            out_str,
        ])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() || !out.is_file() {
        let _ = std::fs::remove_file(&out);
        return Err("動画サムネイルを作成できませんでした".to_string());
    }
    Ok(out.to_string_lossy().into_owned())
}

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

#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
async fn prepare_video_playback(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_video_sync(&app, path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_video_poster(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || capture_video_poster_sync(&app, path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_remote_info() -> remote_lan::RemoteInfo {
    remote_lan::remote_info()
}

#[tauri::command]
fn open_remote_page(url: String) -> Result<(), String> {
    remote_lan::open_url_in_browser(&url)
}

#[tauri::command]
fn allow_remote_firewall() -> Result<(), String> {
    remote_lan::allow_remote_firewall()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_monitors,
            move_output_to_monitor,
            path_exists,
            read_text_file,
            write_text_file,
            prepare_video_playback,
            capture_video_poster,
            get_remote_info,
            open_remote_page,
            allow_remote_firewall
        ])
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

            remote_lan::start_remote_lan(app.handle().clone());
            ble_remote::start_ble_remote(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
