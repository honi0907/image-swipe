import {
  defaultColorAdjust,
  isDefaultColorAdjust,
  withColorAdjust,
} from "./colorAdjust";
import {
  type DrawableSource,
  getCachedImage,
  isDrawableReady,
  isVideoPath,
  loadDrawable,
  mediaDimensions,
  pauseInactiveVideos,
  ensureVideoPlaying,
  videoCacheKey,
} from "./media";
import type {
  ColorAdjustSettings,
  Direction,
  Easing,
  SwipeKind,
  SwipeSettings,
} from "./types";

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

function paintStatic(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  media: DrawableSource | null,
  colorAdjust: ColorAdjustSettings,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (!media) {
    return;
  }
  drawLetterbox(ctx, media, w, h, 0, 0, colorAdjust);
}

/** 画像キャッシュがあれば再読み込みせず色だけ更新（動画ループ中は次フレームで色反映） */
export function redrawStaticIfCached(
  canvas: HTMLCanvasElement,
  path: string | null,
  src: (path: string) => string,
  colorAdjust: ColorAdjustSettings,
  audible = false,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (!path) {
    paintStatic(ctx, w, h, null, colorAdjust);
    return true;
  }
  if (isVideoPath(path)) {
    if (
      staticLoopPath === path &&
      staticLoopAudible === audible &&
      staticLoopRaf !== 0
    ) {
      staticLoopColorAdjust = colorAdjust;
      return true;
    }
    return false;
  }
  const key = src(path);
  const cached = getCachedImage(key);
  if (!cached) {
    return false;
  }
  paintStatic(ctx, w, h, cached, colorAdjust);
  return true;
}

function fitRect(
  media: DrawableSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): { x: number; y: number; w: number; h: number } {
  const { w: mw, h: mh } = mediaDimensions(media);
  const ir = mw / mh;
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
  media: DrawableSource,
  dw: number,
  dh: number,
  offsetX = 0,
  offsetY = 0,
  colorAdjust: ColorAdjustSettings = defaultColorAdjust(),
) {
  const r = fitRect(media, 0, 0, dw, dh);
  const paint = () => {
    ctx.drawImage(media, r.x + offsetX, r.y + offsetY, r.w, r.h);
  };
  if (isDefaultColorAdjust(colorAdjust)) {
    paint();
  } else {
    withColorAdjust(ctx, colorAdjust, paint);
  }
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
  fromMedia: DrawableSource | null,
  progress: number,
  settings: SwipeSettings,
  colorAdjust: ColorAdjustSettings,
) {
  const kind: SwipeKind = settings.kind;
  const s = dirSign(settings.direction);

  if (kind === "cut" || progress >= 1 || !fromMedia) {
    return;
  }

  if (kind === "fade") {
    ctx.globalAlpha = 1 - progress;
    drawLetterbox(ctx, fromMedia, w, h, 0, 0, colorAdjust);
    ctx.globalAlpha = 1;
    return;
  }

  if (kind === "slide" || kind === "push") {
    const ox = s.x * progress * w;
    const oy = s.y * progress * h;
    drawLetterbox(ctx, fromMedia, w, h, ox, oy, colorAdjust);
    return;
  }

  if (kind === "wipe") {
    ctx.save();
    clipFromWipe(ctx, w, h, 1 - progress, settings.direction);
    drawLetterbox(ctx, fromMedia, w, h, 0, 0, colorAdjust);
    ctx.restore();
  }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fromMedia: DrawableSource | null,
  toMedia: DrawableSource | null,
  progress: number,
  settings: SwipeSettings,
  colorAdjust: ColorAdjustSettings,
) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const kind: SwipeKind = settings.kind;

  if (!toMedia) {
    if (kind === "cut") {
      return;
    }
    drawFrameToBlack(ctx, w, h, fromMedia, progress, settings, colorAdjust);
    return;
  }

  const s = dirSign(settings.direction);

  if (kind === "cut") {
    drawLetterbox(ctx, toMedia, w, h, 0, 0, colorAdjust);
    return;
  }

  if (kind === "fade") {
    if (fromMedia && progress < 1) {
      ctx.globalAlpha = 1 - progress;
      drawLetterbox(ctx, fromMedia, w, h, 0, 0, colorAdjust);
    }
    ctx.globalAlpha = fromMedia ? progress : 1;
    drawLetterbox(ctx, toMedia, w, h, 0, 0, colorAdjust);
    ctx.globalAlpha = 1;
    return;
  }

  if (fromMedia) {
    if (kind === "slide") {
      drawLetterbox(ctx, fromMedia, w, h, 0, 0, colorAdjust);
    } else if (kind === "push") {
      const ox = s.x * progress * w;
      const oy = s.y * progress * h;
      drawLetterbox(ctx, fromMedia, w, h, ox, oy, colorAdjust);
    } else if (kind === "wipe") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
      drawLetterbox(ctx, fromMedia, w, h, 0, 0, colorAdjust);
      ctx.restore();
    }
  }

  ctx.save();
  if (kind === "wipe") {
    clipWipe(ctx, w, h, progress, settings.direction);
    drawLetterbox(ctx, toMedia, w, h, 0, 0, colorAdjust);
    ctx.restore();
    if (settings.edgeBlur > 0) {
      drawWipeSoftEdge(ctx, w, h, progress, settings.direction, settings.edgeBlur);
    }
    return;
  }

  if (kind === "slide") {
    const toOx = -s.x * (1 - progress) * w;
    const toOy = -s.y * (1 - progress) * h;
    drawLetterbox(ctx, toMedia, w, h, toOx, toOy, colorAdjust);
  } else if (kind === "push") {
    const toOx = s.x * (progress - 1) * w;
    const toOy = s.y * (progress - 1) * h;
    drawLetterbox(ctx, toMedia, w, h, toOx, toOy, colorAdjust);
  }
  ctx.restore();
}

let activeRaf = 0;
let staticLoopRaf = 0;
let staticLoopPath: string | null = null;
let staticLoopColorAdjust: ColorAdjustSettings = defaultColorAdjust();
let staticLoopAudible = false;

function cancelStaticLoop() {
  cancelAnimationFrame(staticLoopRaf);
  staticLoopRaf = 0;
  staticLoopPath = null;
}

function stopAllAnimation() {
  cancelAnimationFrame(activeRaf);
  activeRaf = 0;
  cancelStaticLoop();
}

function startStaticVideoLoop(
  canvas: HTMLCanvasElement,
  path: string,
  media: HTMLVideoElement,
  colorAdjust: ColorAdjustSettings,
  audible: boolean,
) {
  staticLoopPath = path;
  staticLoopColorAdjust = colorAdjust;
  staticLoopAudible = audible;

  const tick = () => {
    if (staticLoopPath !== path) {
      return;
    }
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
    if (!isDrawableReady(media)) {
      staticLoopRaf = requestAnimationFrame(tick);
      return;
    }
    paintStatic(ctx, w, h, media, staticLoopColorAdjust);
    staticLoopRaf = requestAnimationFrame(tick);
  };
  staticLoopRaf = requestAnimationFrame(tick);
}

export async function playTransition(
  canvas: HTMLCanvasElement,
  fromPath: string | null,
  toPath: string | null,
  settings: SwipeSettings,
  startedAt: number,
  src: (path: string) => string,
  colorAdjust: ColorAdjustSettings = defaultColorAdjust(),
  audible = false,
): Promise<void> {
  stopAllAnimation();
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

  const activeKeys = new Set<string>();
  if (fromPath) {
    activeKeys.add(videoCacheKey(fromPath, audible));
  }
  if (toPath) {
    activeKeys.add(videoCacheKey(toPath, audible));
  }
  pauseInactiveVideos(activeKeys);

  let fromMedia: Awaited<ReturnType<typeof loadDrawable>> | null = null;
  let toMedia: Awaited<ReturnType<typeof loadDrawable>> | null = null;
  try {
    fromMedia = fromPath
      ? await loadDrawable(fromPath, src(fromPath), audible)
      : null;
    toMedia = toPath ? await loadDrawable(toPath, src(toPath), audible) : null;
  } catch (error) {
    console.error("transition video load failed", error);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (fromMedia instanceof HTMLVideoElement) {
    await ensureVideoPlaying(fromMedia, audible);
  }
  if (toMedia instanceof HTMLVideoElement) {
    await ensureVideoPlaying(toMedia, audible);
  }

  if (settings.kind === "cut") {
    drawFrame(ctx, w, h, fromMedia, toMedia, 1, settings, colorAdjust);
    if (fromPath && isVideoPath(fromPath)) {
      if (fromMedia instanceof HTMLVideoElement) {
        fromMedia.pause();
      }
    }
    return;
  }

  const durationMs = settings.durationSec * 1000;

  return new Promise((resolve) => {
    const tick = () => {
      const raw = (Date.now() - startedAt) / durationMs;
      const t = easeT(Math.min(1, raw), settings.easing);
      drawFrame(ctx, w, h, fromMedia, toMedia, t, settings, colorAdjust);
      if (raw >= 1) {
        if (fromPath && isVideoPath(fromPath)) {
          if (fromMedia instanceof HTMLVideoElement) {
            fromMedia.pause();
          }
        }
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
  colorAdjust: ColorAdjustSettings = defaultColorAdjust(),
  audible = false,
): Promise<void> {
  stopAllAnimation();
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

  if (!path) {
    pauseInactiveVideos(new Set());
    paintStatic(ctx, w, h, null, colorAdjust);
    return;
  }

  const url = src(path);
  const activeKeys = new Set([videoCacheKey(path, audible)]);
  pauseInactiveVideos(activeKeys);

  if (isVideoPath(path) && /\.(mov|m4v)$/i.test(path)) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d7deea";
    ctx.font = "16px sans-serif";
    ctx.fillText("MOV を再生用に変換しています…", 24, 40);
  }

  let media: Awaited<ReturnType<typeof loadDrawable>> | null = null;
  try {
    media = await loadDrawable(path, url, audible);
  } catch (error) {
    console.error("static video load failed", error);
    paintStatic(ctx, w, h, null, colorAdjust);
    return;
  }

  if (media instanceof HTMLVideoElement) {
    await ensureVideoPlaying(media, audible);
    startStaticVideoLoop(canvas, path, media, colorAdjust, audible);
    return;
  }

  paintStatic(ctx, w, h, media, colorAdjust);
}
