import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { fileAssetSrc, isVideoPath, loadImageElement } from "./media";

const MAX = 160;

export async function thumbFromPath(path: string): Promise<string> {
  try {
    if (isVideoPath(path)) {
      const posterPath = await invoke<string>("capture_video_poster", { path });
      return fileAssetSrc(posterPath);
    }
    const src = convertFileSrc(path);
    const img = await loadImageElement(src);
    return rasterizeToJpegUrl(img, src);
  } catch {
    return fileAssetSrc(path);
  }
}

async function rasterizeToJpegUrl(
  source: HTMLImageElement,
  fallbackSrc: string,
): Promise<string> {
  const scale = Math.min(
    1,
    MAX / Math.max(source.naturalWidth, source.naturalHeight),
  );
  const w = Math.max(1, Math.round(source.naturalWidth * scale));
  const h = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return fallbackSrc;
  }
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob) {
    return fallbackSrc;
  }
  return URL.createObjectURL(blob);
}
