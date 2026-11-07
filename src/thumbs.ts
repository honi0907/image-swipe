import { convertFileSrc } from "@tauri-apps/api/core";

const MAX = 160;

export async function thumbFromPath(path: string): Promise<string> {
  const src = convertFileSrc(path);
  try {
    const img = await loadImg(src);
    const scale = Math.min(
      1,
      MAX / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return src;
    }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) {
      return src;
    }
    return URL.createObjectURL(blob);
  } catch {
    return src;
  }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
