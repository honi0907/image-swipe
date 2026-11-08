import { invoke } from "@tauri-apps/api/core";
import { message, save } from "@tauri-apps/plugin-dialog";
import type { PersistedShow } from "./types";
import { parseProjectJson, showToProjectJson } from "./show";

export async function scanMissingPaths(
  show: PersistedShow,
): Promise<Record<number, boolean>> {
  const missing: Record<number, boolean> = {};
  await Promise.all(
    show.cells.map(async (cell, i) => {
      if (!cell.path) {
        return;
      }
      const ok = await invoke<boolean>("path_exists", { path: cell.path });
      if (!ok) {
        missing[i] = true;
      }
    }),
  );
  return missing;
}

export async function writeProjectFile(
  path: string,
  show: PersistedShow,
): Promise<void> {
  const json = showToProjectJson(show);
  await invoke("write_text_file", { path, contents: json });
}

export async function readProjectFile(path: string): Promise<PersistedShow> {
  const raw = await invoke<string>("read_text_file", { path });
  return parseProjectJson(raw);
}

export async function pickSaveProjectPath(
  defaultPath?: string | null,
): Promise<string | null> {
  const picked = await save({
    title: "プロジェクトを保存",
    defaultPath: defaultPath ?? undefined,
    filters: [{ name: "画像スワイプ", extensions: ["json"] }],
  });
  if (!picked) {
    return null;
  }
  return picked.toLowerCase().endsWith(".json") ? picked : `${picked}.json`;
}

export async function reportProjectError(err: unknown): Promise<void> {
  const text = err instanceof Error ? err.message : String(err);
  await message(text, { title: "ファイル", kind: "error" });
}
