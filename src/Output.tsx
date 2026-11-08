import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { defaultColorAdjust } from "./colorAdjust";
import { redrawStaticIfCached } from "./draw";
import {
  fileSrc,
  PROGRAM_READY,
  runStaticOnCanvas,
  runTransitionOnCanvas,
} from "./transitionBridge";
import type { ColorAdjustSettings, StaticShowPayload, TransitionPayload } from "./types";
import "./Output.css";

export function Output() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const queue = useRef<Array<() => Promise<void>>>([]);
  const lastPath = useRef<string | null>(null);
  const lastColor = useRef<ColorAdjustSettings>(defaultColorAdjust());
  const staticRaf = useRef(0);
  const pendingStatic = useRef<StaticShowPayload | null>(null);

  const drain = async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    while (queue.current.length > 0) {
      const job = queue.current.shift();
      if (job) {
        await job();
      }
    }
    busy.current = false;
  };

  const enqueue = (job: () => Promise<void>) => {
    queue.current.push(job);
    void drain();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onResize = () => {
      const painted = redrawStaticIfCached(
        canvas,
        lastPath.current,
        fileSrc,
        lastColor.current,
      );
      if (!painted) {
        void runStaticOnCanvas(canvas, lastPath.current, lastColor.current);
      }
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => onResize());
    ro.observe(canvas);

    let unlistenTransition: (() => void) | undefined;
    let unlistenStatic: (() => void) | undefined;

    void (async () => {
      unlistenTransition = await listen<TransitionPayload>(
        "program://transition",
        (e) => {
          const payload = e.payload;
          enqueue(async () => {
            lastColor.current =
              payload.colorAdjust ?? defaultColorAdjust();
            await runTransitionOnCanvas(canvas, payload);
            lastPath.current = payload.toPath;
          });
        },
      );
      unlistenStatic = await listen<StaticShowPayload>(
        "program://static",
        (e) => {
          pendingStatic.current = e.payload;
          cancelAnimationFrame(staticRaf.current);
          staticRaf.current = requestAnimationFrame(() => {
            const payload = pendingStatic.current;
            if (!payload) {
              return;
            }
            lastPath.current = payload.path;
            lastColor.current =
              payload.colorAdjust ?? defaultColorAdjust();
            const path = payload.path;
            const color = lastColor.current;
            enqueue(async () => {
              const painted = redrawStaticIfCached(canvas, path, fileSrc, color);
              if (!painted) {
                await runStaticOnCanvas(canvas, path, color);
              }
            });
          });
        },
      );
      await emit(PROGRAM_READY, {});
    })();

    return () => {
      cancelAnimationFrame(staticRaf.current);
      unlistenTransition?.();
      unlistenStatic?.();
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="output-root">
      <canvas ref={canvasRef} className="output-canvas" />
    </div>
  );
}
