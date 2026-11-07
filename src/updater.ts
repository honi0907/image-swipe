import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export const updateUiOpen = { current: false };

export async function appVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "dev";
  }
}

export async function findUpdate(): Promise<Update | null> {
  return check();
}

export async function downloadInstall(
  update: Update,
  onPercent: (percent: number | null) => void,
): Promise<void> {
  let total = 0;
  let got = 0;
  await update.downloadAndInstall(
    (event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        got = 0;
        onPercent(total > 0 ? 0 : null);
      } else if (event.event === "Progress") {
        got += event.data.chunkLength;
        onPercent(total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null);
      } else if (event.event === "Finished") {
        onPercent(100);
      }
    },
    { restartAfterInstall: true },
  );
  await relaunch();
}
