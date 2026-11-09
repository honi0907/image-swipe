use std::sync::Mutex;

use ble_peripheral_rust::{
    gatt::{
        characteristic::Characteristic,
        peripheral_event::{
            PeripheralEvent, RequestResponse, WriteRequestResponse,
        },
        properties::{AttributePermission, CharacteristicProperty},
        service::Service,
    },
    Peripheral, PeripheralImpl,
};
use tauri::AppHandle;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::remote_cue::emit_remote_cue_bytes;

pub const BLE_DEVICE_NAME: &str = "image-swipe-remote";

const SERVICE_UUID: &str = "6e6f0001-7e82-4e5f-8e2e-0e8e8e8e8e8e";
const CHAR_UUID: &str = "6e6f0002-7e82-4e5f-8e2e-0e8e8e8e8e8e";

struct BleState {
    advertising: bool,
    error: Option<String>,
}

static BLE_STATE: Mutex<BleState> = Mutex::new(BleState {
    advertising: false,
    error: None,
});

pub fn ble_status() -> (bool, Option<String>) {
    BLE_STATE
        .lock()
        .map(|s| (s.advertising, s.error.clone()))
        .unwrap_or((false, None))
}

fn set_ble_advertising(advertising: bool) {
    if let Ok(mut s) = BLE_STATE.lock() {
        s.advertising = advertising;
        if advertising {
            s.error = None;
        }
    }
}

fn set_ble_error(message: String) {
    if let Ok(mut s) = BLE_STATE.lock() {
        s.advertising = false;
        s.error = Some(message);
    }
}

pub fn start_ble_remote(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_ble(app).await {
            let msg = format!("{e}");
            eprintln!("BLE リモート: {msg}");
            set_ble_error(msg);
        }
    });
}

async fn run_ble(app: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let service_uuid = Uuid::parse_str(SERVICE_UUID)?;
    let char_uuid = Uuid::parse_str(CHAR_UUID)?;

    let service = Service {
        uuid: service_uuid,
        primary: true,
        characteristics: vec![Characteristic {
            uuid: char_uuid,
            properties: vec![CharacteristicProperty::Write],
            permissions: vec![AttributePermission::Writeable],
            value: None,
            descriptors: vec![],
        }],
    };

    let (sender_tx, mut receiver_rx) = mpsc::channel::<PeripheralEvent>(64);
    let mut peripheral = Peripheral::new(sender_tx).await?;

    let app_events = app.clone();
    tokio::spawn(async move {
        while let Some(event) = receiver_rx.recv().await {
            if let PeripheralEvent::WriteRequest {
                value,
                responder,
                ..
            } = event
            {
                emit_remote_cue_bytes(&app_events, &value);
                let _ = responder.send(WriteRequestResponse {
                    response: RequestResponse::Success,
                });
            }
        }
    });

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    while std::time::Instant::now() < deadline {
        if peripheral.is_powered().await? {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    if !peripheral.is_powered().await? {
        return Err("Bluetooth がオフか利用できません".into());
    }

    peripheral.add_service(&service).await?;
    peripheral
        .start_advertising(BLE_DEVICE_NAME, &[service_uuid])
        .await?;
    set_ble_advertising(true);
    eprintln!("BLE 広告開始: {BLE_DEVICE_NAME}");

    std::future::pending::<()>().await;
    Ok(())
}
