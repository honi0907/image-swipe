use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const REMOTE_CUE_EVENT: &str = "remote://cue";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCuePayload {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<u16>,
}

pub fn parse_cue_bytes(data: &[u8]) -> Option<RemoteCuePayload> {
    if data.is_empty() {
        return None;
    }
    match data[0] {
        0x01 => Some(RemoteCuePayload {
            kind: "next".into(),
            index: None,
        }),
        0x02 if data.len() >= 3 => {
            let index = u16::from_le_bytes([data[1], data[2]]);
            Some(RemoteCuePayload {
                kind: "goto".into(),
                index: Some(index),
            })
        }
        0x03 if data.len() >= 3 => {
            let index = u16::from_le_bytes([data[1], data[2]]);
            Some(RemoteCuePayload {
                kind: "select".into(),
                index: Some(index),
            })
        }
        _ => None,
    }
}

pub fn parse_cue_json(body: &str) -> Option<RemoteCuePayload> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    let kind = v.get("kind")?.as_str()?;
    let index = v.get("index").and_then(|i| i.as_u64()).map(|n| n as u16);
    match kind {
        "next" => Some(RemoteCuePayload {
            kind: "next".into(),
            index: None,
        }),
        "goto" => index.map(|index| RemoteCuePayload {
            kind: "goto".into(),
            index: Some(index),
        }),
        "select" => index.map(|index| RemoteCuePayload {
            kind: "select".into(),
            index: Some(index),
        }),
        _ => None,
    }
}

pub fn emit_remote_cue(app: &AppHandle, payload: RemoteCuePayload) {
    let _ = app.emit(REMOTE_CUE_EVENT, payload);
}

pub fn emit_remote_cue_bytes(app: &AppHandle, data: &[u8]) {
    if let Some(payload) = parse_cue_bytes(data) {
        emit_remote_cue(app, payload);
    }
}
