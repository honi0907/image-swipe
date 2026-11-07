import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForAppUpdates(): Promise<void> {
  if (!import.meta.env.PROD) {
    return;
  }
  try {
    const update = await check();
    if (!update) {
      return;
    }
    const ok = await ask(
      `バージョン ${update.version} が利用可能です。今すぐ更新しますか？`,
      { title: "画像スワイプの更新", kind: "info" },
    );
    if (!ok) {
      return;
    }
    await update.downloadAndInstall();
    await relaunch();
  } catch {
    /* オフラインや初回リリース前は無視 */
  }
}
