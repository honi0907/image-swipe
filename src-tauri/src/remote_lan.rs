use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::process::Command;
use std::time::Duration;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::AppHandle;

use crate::ble_remote::ble_status;
use crate::remote_cue::{emit_remote_cue, emit_remote_cue_bytes, parse_cue_json};

pub const REMOTE_HTTP_PORT: u16 = 17342;

const REMOTE_HTML: &str = include_str!("../../public/remote.html");
const REMOTE_SW: &str = include_str!("../../public/remote-sw.js");
const REMOTE_MANIFEST: &str = include_str!("../../public/remote-manifest.webmanifest");

static LAN_URL: Mutex<Option<String>> = Mutex::new(None);
static HTTP_LISTENING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub lan_url: String,
    pub alternate_lan_urls: Vec<String>,
    /// スマホから到達可能な private IP が取れたか（127.0.0.1 だけでは false）
    pub lan_ready: bool,
    /// PC 自身から LAN IP:ポートへ TCP できるか（ファイアウォール等の目安）
    pub lan_self_check: bool,
    pub http_listening: bool,
    pub ble_advertising: bool,
    pub ble_error: Option<String>,
}

pub const REMOTE_PUBLIC_PAGE_URL: &str =
    "https://honi0907.github.io/image-swipe/remote.html";

fn iface_is_virtual(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("vethernet")
        || n.contains("virtual")
        || n.contains("hyper-v")
        || n.contains("vmware")
        || n.contains("docker")
        || n.contains("wsl")
        || n.contains("tailscale")
        || n.contains("wireguard")
        || n.contains("loopback")
}

fn iface_prefers_wifi(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("wi-fi")
        || n.contains("wifi")
        || n.contains("wlan")
        || n.contains("wireless")
        || n.contains("802.11")
}

fn pick_lan_ipv4() -> Option<Ipv4Addr> {
    let list = local_ip_address::list_afinet_netifas().ok()?;
    let mut wifi: Vec<Ipv4Addr> = Vec::new();
    let mut other: Vec<Ipv4Addr> = Vec::new();
    for (name, ip) in list {
        let std::net::IpAddr::V4(v4) = ip else {
            continue;
        };
        if v4.is_loopback() || !v4.is_private() {
            continue;
        }
        if iface_is_virtual(&name) {
            continue;
        }
        if iface_prefers_wifi(&name) {
            wifi.push(v4);
        } else {
            other.push(v4);
        }
    }
    wifi.first().or(other.first()).copied()
}

fn all_lan_urls() -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(primary) = pick_lan_ipv4() {
        urls.push(format!("http://{primary}:{REMOTE_HTTP_PORT}/"));
    }
    if let Ok(list) = local_ip_address::list_afinet_netifas() {
        for (name, ip) in list {
            let std::net::IpAddr::V4(v4) = ip else {
                continue;
            };
            if v4.is_loopback() || !v4.is_private() || iface_is_virtual(&name) {
                continue;
            }
            let url = format!("http://{v4}:{REMOTE_HTTP_PORT}/");
            if !urls.contains(&url) {
                urls.push(url);
            }
        }
    }
    if urls.is_empty() {
        urls.push(format!("http://127.0.0.1:{REMOTE_HTTP_PORT}/"));
    }
    urls
}

fn tcp_port_open(ip: Ipv4Addr) -> bool {
    let addr = SocketAddr::from((ip, REMOTE_HTTP_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(900)).is_ok()
}

fn compute_lan_url() -> String {
    all_lan_urls()
        .into_iter()
        .next()
        .unwrap_or_else(|| format!("http://127.0.0.1:{REMOTE_HTTP_PORT}/"))
}

pub fn remote_info() -> RemoteInfo {
    let candidates = all_lan_urls();
    let lan_url = candidates.first().cloned().unwrap_or_else(compute_lan_url);
    let alternate_lan_urls: Vec<String> = candidates
        .into_iter()
        .filter(|u| u != &lan_url)
        .collect();
    let lan_ready = !lan_url.contains("127.0.0.1");
    let lan_self_check = pick_lan_ipv4()
        .map(tcp_port_open)
        .unwrap_or_else(|| tcp_port_open(Ipv4Addr::LOCALHOST));
    if let Ok(mut guard) = LAN_URL.lock() {
        *guard = Some(lan_url.clone());
    }
    let (ble_advertising, ble_error) = ble_status();
    RemoteInfo {
        lan_url,
        alternate_lan_urls,
        lan_ready,
        lan_self_check,
        http_listening: HTTP_LISTENING.load(Ordering::Relaxed),
        ble_advertising,
        ble_error,
    }
}

fn cors(response: rouille::Response) -> rouille::Response {
    response
        .with_additional_header("Access-Control-Allow-Origin", "*")
        .with_additional_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .with_additional_header("Access-Control-Allow-Headers", "Content-Type")
}

#[cfg(target_os = "windows")]
fn ensure_firewall_rule() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let rule = format!("image-swipe-remote-tcp-{REMOTE_HTTP_PORT}");
    let ps = format!(
        "New-NetFirewallRule -DisplayName '{rule}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort {REMOTE_HTTP_PORT} -Profile Any -ErrorAction SilentlyContinue"
    );
    let ps_out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let _ = Command::new("netsh")
        .args([
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={rule}"),
            "dir=in",
            "action=allow",
            "protocol=TCP",
            &format!("localport={REMOTE_HTTP_PORT}"),
            "profile=any",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    ps_out.map(|o| o.status.success()).unwrap_or(false)
}

#[cfg(not(target_os = "windows"))]
fn ensure_firewall_rule() -> bool {
    false
}

pub fn allow_remote_firewall() -> Result<(), String> {
    if ensure_firewall_rule() {
        Ok(())
    } else {
        Err(
            "ファイアウォール規則を自動追加できませんでした。Windows セキュリティから TCP 17342 の受信を許可してください。"
                .into(),
        )
    }
}

pub fn start_remote_lan(app: AppHandle) {
    let _ = ensure_firewall_rule();
    let url = compute_lan_url();
    if let Ok(mut guard) = LAN_URL.lock() {
        *guard = Some(url.clone());
    }

    std::thread::spawn(move || {
        let addr = format!("0.0.0.0:{REMOTE_HTTP_PORT}");
        eprintln!("リモート操作ページ: {url}");
        let Ok(server) = rouille::Server::new(&addr, move |request| {
            if request.method() == "OPTIONS" {
                return cors(rouille::Response::empty_204());
            }

            if request.method() == "GET" && request.url() == "/" {
                return cors(rouille::Response::html(REMOTE_HTML));
            }

            if request.method() == "GET" && request.url() == "/sw.js" {
                return cors(
                    rouille::Response::text(REMOTE_SW).with_additional_header(
                        "Content-Type",
                        "application/javascript; charset=utf-8",
                    ),
                );
            }

            if request.method() == "GET" && request.url() == "/manifest.webmanifest" {
                return cors(
                    rouille::Response::text(REMOTE_MANIFEST).with_additional_header(
                        "Content-Type",
                        "application/manifest+json; charset=utf-8",
                    ),
                );
            }

            if request.method() == "GET" && request.url() == "/info" {
                let body = serde_json::to_string(&remote_info()).unwrap_or_else(|_| "{}".into());
                return cors(
                    rouille::Response::text(body)
                        .with_additional_header("Content-Type", "application/json; charset=utf-8"),
                );
            }

            if request.method() == "POST" && request.url() == "/cue" {
                let Some(mut data) = request.data() else {
                    return cors(rouille::Response::text("no body").with_status_code(400));
                };
                let mut bytes = Vec::new();
                if std::io::Read::read_to_end(&mut data, &mut bytes).is_err() {
                    return cors(rouille::Response::text("read error").with_status_code(400));
                }
                if let Ok(text) = std::str::from_utf8(&bytes) {
                    if let Some(payload) = parse_cue_json(text.trim()) {
                        emit_remote_cue(&app, payload);
                        return cors(rouille::Response::text("ok"));
                    }
                }
                emit_remote_cue_bytes(&app, &bytes);
                return cors(rouille::Response::text("ok"));
            }

            cors(rouille::Response::empty_404())
        }) else {
            HTTP_LISTENING.store(false, Ordering::Relaxed);
            eprintln!("リモート HTTP サーバー: ポート {REMOTE_HTTP_PORT} を開けませんでした");
            return;
        };
        HTTP_LISTENING.store(true, Ordering::Relaxed);
        server.run();
        HTTP_LISTENING.store(false, Ordering::Relaxed);
    });
}

#[cfg(target_os = "windows")]
pub fn open_url_in_browser(url: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn open_url_in_browser(url: &str) -> Result<(), String> {
    let _ = url;
    Err("この OS では未対応です".into())
}
