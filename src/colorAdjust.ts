import type { ColorAdjustSettings } from "./types";

const FILTER_ID = "swipe-color-matrix";
const MATRIX_NODE_ID = "swipe-color-matrix-values";

let lastMatrixKey = "";

export const defaultColorAdjust = (): ColorAdjustSettings => ({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  red: 100,
  green: 100,
  blue: 100,
});

export function mergeColorAdjust(
  partial?: Partial<ColorAdjustSettings> | null,
): ColorAdjustSettings {
  return { ...defaultColorAdjust(), ...partial };
}

export function isDefaultColorAdjust(adj: ColorAdjustSettings): boolean {
  const d = defaultColorAdjust();
  return (
    adj.brightness === d.brightness &&
    adj.contrast === d.contrast &&
    adj.saturation === d.saturation &&
    adj.red === d.red &&
    adj.green === d.green &&
    adj.blue === d.blue
  );
}

function ensureColorMatrixSvg(): void {
  if (document.getElementById(FILTER_ID)) {
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  svg.innerHTML = `<defs><filter id="${FILTER_ID}" color-interpolation-filters="sRGB"><feColorMatrix id="${MATRIX_NODE_ID}" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter></defs>`;
  document.body.appendChild(svg);
}

export function buildCanvasFilter(adj: ColorAdjustSettings): string {
  const parts: string[] = [];
  if (adj.brightness !== 100) {
    parts.push(`brightness(${adj.brightness}%)`);
  }
  if (adj.contrast !== 100) {
    parts.push(`contrast(${adj.contrast}%)`);
  }
  if (adj.saturation !== 100) {
    parts.push(`saturate(${adj.saturation}%)`);
  }
  if (adj.red !== 100 || adj.green !== 100 || adj.blue !== 100) {
    const matrixKey = `${adj.red},${adj.green},${adj.blue}`;
    if (matrixKey !== lastMatrixKey) {
      ensureColorMatrixSvg();
      const r = adj.red / 100;
      const g = adj.green / 100;
      const b = adj.blue / 100;
      const node = document.getElementById(MATRIX_NODE_ID);
      node?.setAttribute(
        "values",
        `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`,
      );
      lastMatrixKey = matrixKey;
    }
    parts.push(`url(#${FILTER_ID})`);
  }
  return parts.length ? parts.join(" ") : "none";
}

export function withColorAdjust(
  ctx: CanvasRenderingContext2D,
  adj: ColorAdjustSettings,
  draw: () => void,
): void {
  const filter = buildCanvasFilter(adj);
  if (filter === "none") {
    draw();
    return;
  }
  ctx.save();
  ctx.filter = filter;
  draw();
  ctx.restore();
}
