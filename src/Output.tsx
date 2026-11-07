import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  PROGRAM_READY,
  runStaticOnCanvas,
  runTransitionOnCanvas,
} from "./transitionBridge";
import type { StaticShowPayload, TransitionPayload } from "./types";
import "./Output.css";

export function Output() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const queue = useRef<Array<() => Promise<void>>>([]);

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
      void runStaticOnCanvas(canvas, null);
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
            await runTransitionOnCanvas(canvas, payload);
          });
        },
      );
      unlistenStatic = await listen<StaticShowPayload>(
        "program://static",
        (e) => {
          enqueue(async () => {
            await runStaticOnCanvas(canvas, e.payload.path);
          });
        },
      );
      await emit(PROGRAM_READY, {});
    })();

    return () => {
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
