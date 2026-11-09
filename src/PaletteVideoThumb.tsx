import { useEffect, useState } from "react";
import { fileAssetSrc, resolvePlaybackPath } from "./media";

type Props = {
  path: string;
  poster?: string;
  livePreview?: boolean;
};

export function PaletteVideoThumb({ path, poster, livePreview }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!livePreview) {
      return;
    }
    let cancelled = false;
    void resolvePlaybackPath(path).then((playPath) => {
      if (!cancelled) {
        setSrc(fileAssetSrc(playPath));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, livePreview]);

  if (!livePreview) {
    if (poster) {
      return (
        <img className="cell-thumb" src={poster} alt="" draggable={false} />
      );
    }
    return <span className="cell-video-placeholder">VIDEO</span>;
  }

  if (!src) {
    if (poster) {
      return (
        <img className="cell-thumb" src={poster} alt="" draggable={false} />
      );
    }
    return <span className="cell-video-placeholder">読込中…</span>;
  }

  return (
    <video
      className="cell-thumb cell-thumb-video"
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      autoPlay
      draggable={false}
    />
  );
}
