import { emit, listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { defaultColorAdjust } from "./colorAdjust";
import type { StaticShowPayload, TransitionPayload } from "./types";
import { drawStatic, playTransition } from "./draw";

export const PROGRAM_READY = "program://ready";
export const PROGRAM_TRANSITION = "program://transition";
export const PROGRAM_STATIC = "program://static";

export function fileSrc(path: string): string {
  return convertFileSrc(path);
}

export async function emitTransition(payload: TransitionPayload): Promise<void> {
  await emit(PROGRAM_TRANSITION, payload);
}

export async function emitStatic(payload: StaticShowPayload): Promise<void> {
  await emit(PROGRAM_STATIC, payload);
}

export function listenProgramEvents(
  onTransition: (p: TransitionPayload) => void,
  onStatic: (p: StaticShowPayload) => void,
): Promise<() => void> {
  const unsubs: Array<() => void> = [];
  return (async () => {
    unsubs.push(
      await listen<TransitionPayload>(PROGRAM_TRANSITION, (e) => {
        onTransition(e.payload);
      }),
    );
    unsubs.push(
      await listen<StaticShowPayload>(PROGRAM_STATIC, (e) => {
        onStatic(e.payload);
      }),
    );
    return () => unsubs.forEach((u) => u());
  })();
}

export async function runTransitionOnCanvas(
  canvas: HTMLCanvasElement,
  payload: TransitionPayload,
  audible = false,
): Promise<void> {
  await playTransition(
    canvas,
    payload.fromPath,
    payload.toPath,
    payload.settings,
    payload.startedAt,
    fileSrc,
    payload.colorAdjust ?? defaultColorAdjust(),
    audible,
  );
}

export async function runStaticOnCanvas(
  canvas: HTMLCanvasElement,
  path: string | null,
  colorAdjust = defaultColorAdjust(),
  audible = false,
): Promise<void> {
  await drawStatic(canvas, path, fileSrc, colorAdjust, audible);
}
