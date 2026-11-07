import type { Cell } from "./types";

export const PALETTE_SIZE_OPTIONS = [50, 40, 30, 20, 10] as const;
export type PaletteSize = (typeof PALETTE_SIZE_OPTIONS)[number];
export const PALETTE_COLS = 10;

export function paletteRows(size: PaletteSize): number {
  return size / PALETTE_COLS;
}

export function isPaletteSize(n: number): n is PaletteSize {
  return (PALETTE_SIZE_OPTIONS as readonly number[]).includes(n);
}

const emptyCell = (): Cell => ({ path: null, override: null });

export function normalizeCells(
  cells: Cell[],
  size: PaletteSize,
): Cell[] {
  const next = cells.slice(0, size).map((c) => ({
    path: c.path ?? null,
    override: c.override ?? null,
  }));
  while (next.length < size) {
    next.push(emptyCell());
  }
  return next;
}

export function countMaterialBeyond(cells: Cell[], size: PaletteSize): number {
  let n = 0;
  for (let i = size; i < cells.length; i++) {
    if (cells[i]?.path) {
      n++;
    }
  }
  return n;
}

export function hasMaterialBeyond(cells: Cell[], size: PaletteSize): boolean {
  return countMaterialBeyond(cells, size) > 0;
}

export function buildTrimWarning(
  size: PaletteSize,
  beyondCount: number,
): string {
  return (
    `コマ ${size + 1} 以降に素材が ${beyondCount} 件あります。\n` +
    `パレットを ${size} コマにすると、はみ出した部分の素材は削除されます。\n\n` +
    `よろしいですか？`
  );
}
