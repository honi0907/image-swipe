import type { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

function indexFromCellEl(el: Element | null | undefined): number | null {
  if (!(el instanceof HTMLElement)) {
    return null;
  }
  const raw = el.getAttribute("data-palette-index");
  if (raw === null) {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** ビューポート座標 → パレットコマ index（見つからなければ null） */
export function paletteIndexAtPoint(clientX: number, clientY: number): number | null {
  const cells = document.querySelectorAll<HTMLElement>("[data-palette-index]");
  for (const el of cells) {
    const r = el.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return indexFromCellEl(el);
    }
  }
  return indexFromCellEl(
    document.elementFromPoint(clientX, clientY)?.closest("[data-palette-index]"),
  );
}

/** Tauri の D&D 座標（webview 左上基準）を client 座標へ */
export async function dragDropPositionToClient(
  position: PhysicalPosition,
): Promise<{ x: number; y: number }> {
  const scale = await getCurrentWindow().scaleFactor();
  const logical = position.toLogical(scale);
  return { x: logical.x, y: logical.y };
}
