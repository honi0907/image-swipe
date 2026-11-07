export type SwipeKind = "slide" | "push" | "wipe" | "fade" | "cut";
export type Direction = "left" | "right" | "up" | "down";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

import type { PaletteSize } from "./palette";
export type { PaletteSize };

export interface SwipeSettings {
  kind: SwipeKind;
  direction: Direction;
  durationSec: number;
  easing: Easing;
  edgeBlur: number;
}

export interface CellOverride {
  enabled: boolean;
  settings: SwipeSettings;
}

export interface Cell {
  path: string | null;
  override: CellOverride | null;
}

export interface PersistedShow {
  paletteSize: PaletteSize;
  cells: Cell[];
  globalSettings: SwipeSettings;
  skipEmptyOnSpace: boolean;
  currentIndex: number;
  selectedIndex: number;
}

export interface TransitionPayload {
  fromPath: string | null;
  toPath: string | null;
  settings: SwipeSettings;
  startedAt: number;
}

export interface StaticShowPayload {
  path: string | null;
}
