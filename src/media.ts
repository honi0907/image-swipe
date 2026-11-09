import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export const MEDIA_EXT =
  /\.(jpe?g|png|webp|gif|bmp|mp4|webm|mov|m4v)$/i;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

export type DrawableSource = HTMLImageElement | HTMLVideoElement;

export function isVideoPath(path: string): boolean {
  return VIDEO_EXT.test(path);
}

export function videoMimeFromPath(path: string): string {
  const ext = path.split(/[/\\]/).pop()?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "m4v":
      return "video/mp4";
    default:
      return "video/mp4";
  }
}

export function fileAssetSrc(path: string): string {
  return convertFileSrc(path);
}

const preparedPathBySource = new Map<string, string>();

export async function resolvePlaybackPath(path: string): Promise<string> {
  if (!/\.(mov|m4v)$/i.test(path)) {
    return path;
  }
  const hit = preparedPathBySource.get(path);
  if (hit) {
    return hit;
  }
  const prepared = await invoke<string>("prepare_video_playback", { path });
  preparedPathBySource.set(path, prepared);
  return prepared;
}

export function videoCacheKey(path: string, audible: boolean): string {
  return `${audible ? "a" : "m"}:path:${path}`;
}

export function mediaDimensions(el: DrawableSource): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) {
    const w = el.videoWidth;
    const h = el.videoHeight;
    return { w: w > 0 ? w : 1, h: h > 0 ? h : 1 };
  }
  return {
    w: el.naturalWidth > 0 ? el.naturalWidth : 1,
    h: el.naturalHeight > 0 ? el.naturalHeight : 1,
  };
}

export function isDrawableReady(el: DrawableSource): boolean {
  if (el instanceof HTMLVideoElement) {
    return (
      el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0
    );
  }
  return el.complete && el.naturalWidth > 0;
}

const videoByKey = new Map<string, HTMLVideoElement>();

let videoLoadTail: Promise<void> = Promise.resolve();

function enqueueVideoLoad<T>(fn: () => Promise<T>): Promise<T> {
  const run = videoLoadTail.then(fn, fn);
  videoLoadTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function pauseInactiveVideos(activeKeys: ReadonlySet<string>): void {
  for (const [key, video] of videoByKey) {
    if (!activeKeys.has(key)) {
      video.pause();
    }
  }
}

export async function ensureVideoPlaying(
  video: HTMLVideoElement,
  audible: boolean,
): Promise<void> {
  video.muted = !audible;
  if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }
  try {
    await video.play();
  } catch {
    if (audible) {
      video.muted = true;
      try {
        await video.play();
      } catch {
        /* 再生不可 */
      }
    }
  }
}

function videoDecodeErrorMessage(path: string, video: HTMLVideoElement): string {
  const code = video.error?.code;
  const base =
    code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      ? "この動画形式は Windows の WebView で再生できません"
      : "動画を読み込めません";
  return `${base}（H.264 の MP4/MOV を推奨。HEVC/ProRes は非対応のことがあります）: ${path}`;
}

function videoLoadTimeoutMs(path: string): number {
  return /\.(mov|m4v)$/i.test(path) ? 45_000 : 20_000;
}

export function attachVideoSource(
  video: HTMLVideoElement,
  src: string,
  path: string,
): void {
  video.removeAttribute("src");
  while (video.firstChild) {
    video.removeChild(video.firstChild);
  }
  const ext = path.split(/[/\\]/).pop()?.split(".").pop()?.toLowerCase();
  if (ext === "mov" || ext === "m4v") {
    video.src = src;
  } else {
    const source = document.createElement("source");
    source.src = src;
    source.type = videoMimeFromPath(path);
    video.appendChild(source);
  }
  video.load();
}

export async function waitForVideoDecode(
  video: HTMLVideoElement,
  path: string,
  timeoutMs: number,
): Promise<void> {
  const tryReady = (): boolean => {
    return (
      video.videoWidth > 0 &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    );
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finishOk = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const finishErr = (err: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(err);
    };

    const onProgress = () => {
      if (tryReady()) {
        finishOk();
      }
    };
    const onErr = () => {
      finishErr(new Error(videoDecodeErrorMessage(path, video)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onProgress);
      video.removeEventListener("loadeddata", onProgress);
      video.removeEventListener("canplay", onProgress);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("error", onErr);
    };

    const timer = window.setTimeout(() => {
      if (tryReady()) {
        finishOk();
        return;
      }
      finishErr(
        new Error(
          `${videoDecodeErrorMessage(path, video)}（読み込みがタイムアウトしました）`,
        ),
      );
    }, timeoutMs);

    video.addEventListener("loadedmetadata", onProgress);
    video.addEventListener("loadeddata", onProgress);
    video.addEventListener("canplay", onProgress);
    video.addEventListener("progress", onProgress);
    video.addEventListener("error", onErr);
    void video.play().catch(() => undefined);
    onProgress();
  });
}

async function openVideoElement(
  sourcePath: string,
  playPath: string,
  assetSrc: string,
  audible: boolean,
): Promise<HTMLVideoElement> {
  const key = videoCacheKey(sourcePath, audible);
  const cached = videoByKey.get(key);
  if (cached && isDrawableReady(cached)) {
    await ensureVideoPlaying(cached, audible);
    return cached;
  }

  const video = document.createElement("video");
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.muted = true;

  attachVideoSource(video, assetSrc, playPath);
  await waitForVideoDecode(video, sourcePath, videoLoadTimeoutMs(sourcePath));

  videoByKey.set(key, video);
  await ensureVideoPlaying(video, audible);
  return video;
}

async function loadVideoElement(
  sourcePath: string,
  audible: boolean,
): Promise<HTMLVideoElement> {
  const playPath = await resolvePlaybackPath(sourcePath);
  return openVideoElement(
    sourcePath,
    playPath,
    fileAssetSrc(playPath),
    audible,
  );
}

const imageBySrc = new Map<string, HTMLImageElement>();

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const cached = imageBySrc.get(src);
    if (cached && isDrawableReady(cached)) {
      resolve(cached);
      return;
    }
    const img = new Image();
    img.onload = () => {
      imageBySrc.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`画像を読み込めません: ${src}`));
    img.src = src;
  });
}

export async function loadDrawable(
  path: string,
  _src: string,
  audible: boolean,
): Promise<DrawableSource> {
  if (isVideoPath(path)) {
    return enqueueVideoLoad(() => loadVideoElement(path, audible));
  }
  return loadImageElement(fileAssetSrc(path));
}

export function getCachedImage(src: string): HTMLImageElement | undefined {
  const img = imageBySrc.get(src);
  if (img && isDrawableReady(img)) {
    return img;
  }
  return undefined;
}

export function getCachedVideo(
  path: string,
  audible: boolean,
): HTMLVideoElement | undefined {
  const video = videoByKey.get(videoCacheKey(path, audible));
  if (video && isDrawableReady(video)) {
    return video;
  }
  return undefined;
}
