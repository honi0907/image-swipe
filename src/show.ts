import {
  normalizeCells,
  type PaletteSize,
  PALETTE_COLS,
} from "./palette";
import { mergeColorAdjust } from "./colorAdjust";
import type { Cell, CellOverride, PersistedShow, SwipeSettings } from "./types";

const STORAGE_KEY = "swipe-show-v2";
const STORAGE_KEY_V1 = "swipe-show-v1";

export const defaultSwipeSettings = (): SwipeSettings => ({
  kind: "slide",
  direction: "left",
  durationSec: 0.6,
  easing: "ease-out",
  edgeBlur: 20,
});

export function createEmptyShow(
  paletteSize: PaletteSize = 50,
): PersistedShow {
  return {
    paletteSize,
    cells: normalizeCells([], paletteSize),
    globalSettings: defaultSwipeSettings(),
    colorAdjust: mergeColorAdjust(),
    skipEmptyOnSpace: false,
    currentIndex: -1,
    selectedIndex: 0,
  };
}

export function cloneCell(c: Cell): Cell {
  return {
    path: c.path,
    override: c.override
      ? {
          enabled: c.override.enabled,
          settings: { ...c.override.settings },
        }
      : null,
  };
}

export function movePaletteCell(
  cells: Cell[],
  from: number,
  to: number,
): Cell[] {
  if (from === to) {
    return cells.map(cloneCell);
  }
  const next = cells.map(cloneCell);
  const src = next[from];
  const dst = next[to];
  const srcHas = !!src.path;
  const dstHas = !!dst.path;
  if (!srcHas) {
    return next;
  }
  if (dstHas) {
    next[from] = cloneCell(dst);
    next[to] = cloneCell(src);
  } else {
    next[to] = cloneCell(src);
    next[from] = { path: null, override: null };
  }
  return next;
}

export function findNextSpaceIndex(
  show: PersistedShow,
  fromIndex: number,
  blocked: Record<number, boolean> = {},
): number | null {
  const n = show.cells.length;
  if (show.skipEmptyOnSpace) {
    return findNextImageIndex(show, fromIndex, blocked);
  }
  if (fromIndex < 0) {
    return 0;
  }
  return (fromIndex + 1) % n;
}

export function indexToRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / PALETTE_COLS), col: index % PALETTE_COLS };
}

export function rowColToIndex(row: number, col: number): number {
  return row * PALETTE_COLS + col;
}

export function getEffectiveSettings(
  cell: Cell,
  global: SwipeSettings,
): SwipeSettings {
  if (cell.override?.enabled) {
    return cell.override.settings;
  }
  return global;
}

export function findNextImageIndex(
  show: PersistedShow,
  fromIndex: number,
  blocked: Record<number, boolean> = {},
): number | null {
  const n = show.cells.length;
  for (let step = 1; step <= n; step++) {
    const i = (fromIndex + step) % n;
    if (show.cells[i]?.path && !blocked[i]) {
      return i;
    }
  }
  return null;
}

export function fillCellsFromIndex(
  cells: Cell[],
  startIndex: number,
  paths: string[],
): Cell[] {
  const next = cells.map((c) => ({ ...c }));
  let slot = startIndex;
  for (const path of paths) {
    while (slot < next.length && next[slot].path) {
      slot++;
    }
    if (slot >= next.length) {
      break;
    }
    next[slot] = { ...next[slot], path };
    slot++;
  }
  return next;
}

export const PROJECT_FORMAT_VERSION = 1 as const;

export function parsePersisted(raw: string): PersistedShow {
    const parsed = JSON.parse(raw) as PersistedShow;
    const paletteSize = parsed.paletteSize ?? 50;
    if (!parsed.cells?.length) {
      return createEmptyShow(paletteSize);
    }
    const cells = normalizeCells(parsed.cells, paletteSize);
    let currentIndex = parsed.currentIndex ?? -1;
    let selectedIndex = parsed.selectedIndex ?? 0;
    if (currentIndex >= paletteSize) {
      currentIndex = -1;
    }
    if (selectedIndex >= paletteSize) {
      selectedIndex = 0;
    }
    return {
      ...createEmptyShow(paletteSize),
      ...parsed,
      paletteSize,
      cells,
      currentIndex,
      selectedIndex,
      globalSettings: { ...defaultSwipeSettings(), ...parsed.globalSettings },
      colorAdjust: mergeColorAdjust(parsed.colorAdjust),
      skipEmptyOnSpace: parsed.skipEmptyOnSpace ?? false,
    };
}

export function loadShow(): PersistedShow {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) {
      return createEmptyShow();
    }
    const show = parsePersisted(raw);
    if (!localStorage.getItem(STORAGE_KEY)) {
      saveShow(show);
    }
    return show;
  } catch {
    return createEmptyShow();
  }
}

export function saveShow(show: PersistedShow): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(show));
}

export function showToProjectJson(show: PersistedShow): string {
  return JSON.stringify(
    { formatVersion: PROJECT_FORMAT_VERSION, ...show },
    null,
    2,
  );
}

export function parseProjectJson(raw: string): PersistedShow {
  const parsed = JSON.parse(raw) as PersistedShow & {
    formatVersion?: number;
  };
  if (parsed.formatVersion !== undefined && parsed.formatVersion > PROJECT_FORMAT_VERSION) {
    throw new Error("このファイルは新しすぎるバージョンです");
  }
  return parsePersisted(JSON.stringify(parsed));
}

export function assignDroppedImages(
  cells: Cell[],
  startIndex: number,
  paths: string[],
): Cell[] {
  if (paths.length === 0) {
    return cells.map(cloneCell);
  }
  const next = cells.map(cloneCell);
  let slot = startIndex;
  for (const path of paths) {
    if (slot >= next.length) {
      break;
    }
    next[slot] = { ...next[slot], path };
    slot++;
  }
  return next;
}

export function cloneOverride(o: CellOverride | null): CellOverride | null {
  if (!o) {
    return null;
  }
  return {
    enabled: o.enabled,
    settings: { ...o.settings },
  };
}
