import type { Direction, Easing, SwipeKind, SwipeSettings } from "./types";

export function easeT(t: number, easing: Easing): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "linear":
      return x;
    case "ease-in":
      return x * x;
    case "ease-out":
      return x * (2 - x);
    case "ease-in-out":
      return x < 0.5 ? 2 * x * x : -1 + (4 - 2 * x) * x;
    default: {
      const _exhaustive: never = easing;
      return _exhaustive;
    }
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
    img.src = src;
  });
}

function fitRect(
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): { x: number; y: number; w: number; h: number } {
  const ir = img.naturalWidth / img.naturalHeight;
  const cr = dw / dh;
  if (ir > cr) {
    const w = dw;
    const h = dw / ir;
    return { x: dx, y: dy + (dh - h) / 2, w, h };
  }
  const h = dh;
  const w = dh * ir;
  return { x: dx + (dw - w) / 2, y: dy, w, h };
}

export function drawLetterbox(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dw: number,
  dh: number,
  offsetX = 0,
  offsetY = 0,
) {
  const r = fitRect(img, 0, 0, dw, dh);
  ctx.drawImage(img, r.x + offsetX, r.y + offsetY, r.w, r.h);
}

function dirSign(d: Direction): { x: number; y: number } {
  switch (d) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    default: {
      const _exhaustive: never = d;
      return _exhaustive;
    }
  }
}

function drawWipeSoftEdge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  progress: number,
  direction: Direction,
  blurPct: number,
) {
  const band = Math.max(4, (blurPct / 100) * Math.min(w, h) * 0.15);
  const s = dirSign(direction);
  let start = 0;
  let end = 0;
  if (s.x !== 0) {
    const edge = (progress * w * s.x + w) / 2 + (s.x < 0 ? w - progress * w : 0);
    const boundary = progress * w * (s.x > 0 ? 1 : 0) + (s.x < 0 ? w * (1 - progress) : 0);
    const b = s.x > 0 ? boundary : boundary;
    const x = b;
    start = x - band / 2;
    end = x + band / 2;
    const g = ctx.createLinearGradient(start, 0, end, 0);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.max(0, start), 0, Math.min(w, band), h);
    void edge;
  } else {
    const boundary = progress * h * (s.y > 0 ? 1 : 0) + (s.y < 0 ? h * (1 - progress) : 0);
    const y = boundary;
    start = y - band / 2;
    end = y + band / 2;
    const g = ctx.createLinearGradient(0, start, 0, end);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.max(0, start), w, Math.min(h, band));
  }
}

function clipWipe(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  progress: number,
  direction: Direction,
) {
  const s = dirSign(direction);
  ctx.beginPath();
  if (direction === "right") {
    ctx.rect(0, 0, w * progress, h);
  } else if (direction === "left") {
    ctx.rect(w * (1 - progress), 0, w * progress, h);
  } else if (direction === "down") {
    ctx.rect(0, 0, w, h * progress);
  } else {
    ctx.rect(0, h * (1 - progress), w, h * progress);
  }
  ctx.clip();
  void s;
}

function clipFromWipe(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  visible: number,
  direction: Direction,
) {
  const v = Math.min(1, Math.max(0, visible));
  ctx.beginPath();
  if (direction === "right") {
    ctx.rect(0, 0, w * v, h);
  } else if (direction === "left") {
    ctx.rect(w * (1 - v), 0, w * v, h);
  } else if (direction === "down") {
    ctx.rect(0, 0, w, h * v);
  } else {
    ctx.rect(0, h * (1 - v), w, h * v);
  }
  ctx.clip();
}

function drawFrameToBlack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fromImg: HTMLImageElement | null,
  progress: number,
  settings: SwipeSettings,
) {
  const kind: SwipeKind = settings.kind;
  const s = dirSign(settings.direction);

  if (kind === "cut" || progress >= 1 || !fromImg) {
    return;
  }

  if (kind === "fade") {
    ctx.globalAlpha = 1 - progress;
    drawLetterbox(ctx, fromImg, w, h);
    ctx.globalAlpha = 1;
    return;
  }

  if (kind === "slide" || kind === "push") {
    const ox = s.x * progress * w;
    const oy = s.y * progress * h;
    drawLetterbox(ctx, fromImg, w, h, ox, oy);
    return;
  }

  if (kind === "wipe") {
    ctx.save();
    clipFromWipe(ctx, w, h, 1 - progress, settings.direction);
    drawLetterbox(ctx, fromImg, w, h);
    ctx.restore();
  }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fromImg: HTMLImageElement | null,
  toImg: HTMLImageElement | null,
  progress: number,
  settings: SwipeSettings,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const kind: SwipeKind = settings.kind;

  if (!toImg) {
    if (kind === "cut") {
      return;
    }
    drawFrameToBlack(ctx, w, h, fromImg, progress, settings);
    return;
  }

  const s = dirSign(settings.direction);

  if (kind === "cut") {
    drawLetterbox(ctx, toImg, w, h);
    return;
  }

  if (kind === "fade") {
    if (fromImg && progress < 1) {
      ctx.globalAlpha = 1 - progress;
      drawLetterbox(ctx, fromImg, w, h);
    }
    ctx.globalAlpha = fromImg ? progress : 1;
    drawLetterbox(ctx, toImg, w, h);
    ctx.globalAlpha = 1;
    return;
  }

  if (fromImg) {
    if (kind === "slide") {
      drawLetterbox(ctx, fromImg, w, h);
    } else if (kind === "push") {
      const ox = s.x * progress * w;
      const oy = s.y * progress * h;
      drawLetterbox(ctx, fromImg, w, h, ox, oy);
    } else if (kind === "wipe") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      drawLetterbox(ctx, fromImg, w, h);
      ctx.restore();
    }
  }

  ctx.save();
  if (kind === "wipe") {
    clipWipe(ctx, w, h, progress, settings.direction);
    drawLetterbox(ctx, toImg, w, h);
    ctx.restore();
    if (settings.edgeBlur > 0) {
      drawWipeSoftEdge(ctx, w, h, progress, settings.direction, settings.edgeBlur);
    }
    return;
  }

  if (kind === "slide") {
    const toOx = -s.x * (1 - progress) * w;
    const toOy = -s.y * (1 - progress) * h;
    drawLetterbox(ctx, toImg, w, h, toOx, toOy);
  } else if (kind === "push") {
    const toOx = s.x * (progress - 1) * w;
    const toOy = s.y * (progress - 1) * h;
    drawLetterbox(ctx, toImg, w, h, toOx, toOy);
  }
  ctx.restore();
}

let activeRaf = 0;

export async function playTransition(
  canvas: HTMLCanvasElement,
  fromPath: string | null,
  toPath: string | null,
  settings: SwipeSettings,
  startedAt: number,
  src: (path: string) => string,
): Promise<void> {
  cancelAnimationFrame(activeRaf);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  const fromImg = fromPath ? await loadImage(src(fromPath)) : null;
  const toImg = toPath ? await loadImage(src(toPath)) : null;

  if (settings.kind === "cut") {
    drawFrame(ctx, w, h, fromImg, toImg, 1, settings);
    return;
  }

  const durationMs = settings.durationSec * 1000;

  return new Promise((resolve) => {
    const tick = () => {
      const raw = (Date.now() - startedAt) / durationMs;
      const t = easeT(Math.min(1, raw), settings.easing);
      drawFrame(ctx, w, h, fromImg, toImg, t, settings);
      if (raw >= 1) {
        resolve();
        return;
      }
      activeRaf = requestAnimationFrame(tick);
    };
    activeRaf = requestAnimationFrame(tick);
  });
}

export async function drawStatic(
  canvas: HTMLCanvasElement,
  path: string | null,
  src: (path: string) => string,
): Promise<void> {
  cancelAnimationFrame(activeRaf);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (!path) {
    return;
  }
  const img = await loadImage(src(path));
  drawLetterbox(ctx, img, w, h);
}
