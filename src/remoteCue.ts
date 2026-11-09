import pkg from "../package.json";

/** Tauri / BLE / LAN と共有するリモートコマンド契約 */
export const REMOTE_CUE_EVENT = "remote://cue";

export type RemoteCueKind = "next" | "goto" | "select";

export type RemoteCuePayload = {
  kind: RemoteCueKind;
  index?: number;
};

/** Web Bluetooth 用（Rust GATT と同一） */
export const BLE_SERVICE_UUID = "6e6f0001-7e82-4e5f-8e2e-0e8e8e8e8e8e";
export const BLE_CHAR_UUID = "6e6f0002-7e82-4e5f-8e2e-0e8e8e8e8e8e";

export const BLE_DEVICE_NAME_PREFIX = "image-swipe-remote";

/** スマホ用 HTTPS（GitHub Pages）。同一 Wi‑Fi 不要・BLE 操作用 */
export const REMOTE_PUBLIC_PAGE_URL =
  "https://honi0907.github.io/image-swipe/remote.html";

/** Pages 未配信時の予備（リリースに同梱される remote.html） */
export const REMOTE_PUBLIC_RELEASE_URL = `https://github.com/honi0907/image-swipe/releases/download/v${pkg.version}/remote.html`;
