import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PersistedShow, TransitionPayload } from "./types";
import {
  buildTrimWarning,
  countMaterialBeyond,
  hasMaterialBeyond,
  isPaletteSize,
  normalizeCells,
  PALETTE_COLS,
  PALETTE_SIZE_OPTIONS,
  type PaletteSize,
} from "./palette";
import {
  fillCellsFromIndex,
  findNextSpaceIndex,
  getEffectiveSettings,
  loadShow,
  movePaletteCell,
  saveShow,
} from "./show";
import { thumbFromPath } from "./thumbs";
import {
  emitStatic,
  emitTransition,
  fileSrc,
  PROGRAM_READY,
  runStaticOnCanvas,
  runTransitionOnCanvas,
} from "./transitionBridge";
import { CellSwipeMeta } from "./CellSwipeMeta";
import { ensureOverride as ensureOverrideUi, SettingsPanel } from "./SettingsPanel";
import { UpdatePanel } from "./UpdatePanel";
import { updateUiOpen } from "./updater";
import "./Control.css";

type MonitorDto = {
  index: number;
  name: string;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;

export function Control() {
  const [show, setShow] = useState<PersistedShow>(() => loadShow());
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [monitors, setMonitors] = useState<MonitorDto[]>([]);
  const [outputMonitor, setOutputMonitor] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showRef = useRef(show);
  const busy = useRef(false);
  const transitionQueue = useRef<number[]>([]);
  const paletteDrag = useRef<{
    from: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressCellClick = useRef(false);
  const paletteDropTargetRef = useRef<number | null>(null);
  const [paletteDropTarget, setPaletteDropTarget] = useState<number | null>(
    null,
  );
  const [paletteDraggingFrom, setPaletteDraggingFrom] = useState<number | null>(
    null,
  );

  showRef.current = show;

  const persist = useCallback((next: PersistedShow) => {
    setShow(next);
    saveShow(next);
  }, []);

  const refreshThumbs = useCallback(async (state: PersistedShow) => {
    const next: Record<number, string> = {};
    await Promise.all(
      state.cells.map(async (cell, i) => {
        if (!cell.path) {
          return;
        }
        next[i] = await thumbFromPath(cell.path);
      }),
    );
    setThumbs(next);
  }, []);

  useEffect(() => {
    void refreshThumbs(show);
  }, [show.cells.map((c) => c.path).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) {
      return;
    }
    const ro = new ResizeObserver(() => {
      const s = showRef.current;
      const path =
        s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
      void runStaticOnCanvas(canvas, path);
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    void invoke<MonitorDto[]>("list_monitors").then((list) => {
      setMonitors(list);
      if (list.length > 1) {
        setOutputMonitor(1);
      } else {
        setOutputMonitor(0);
      }
    });
  }, []);

  const runTransitionTo = useCallback(
    async (index: number) => {
      const s = showRef.current;
      const cell = s.cells[index];
      if (!cell) {
        return;
      }
      const fromPath =
        s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
      const settings = getEffectiveSettings(cell, s.globalSettings);
      const startedAt = Date.now();
      const payload: TransitionPayload = {
        fromPath,
        toPath: cell.path,
        settings,
        startedAt,
      };
      await emitTransition(payload);
      const canvas = canvasRef.current;
      if (canvas) {
        await runTransitionOnCanvas(canvas, payload);
      }
      persist({ ...s, currentIndex: index, selectedIndex: index });
    },
    [persist],
  );

  const drainQueue = useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    try {
      while (transitionQueue.current.length > 0) {
        const index = transitionQueue.current.shift()!;
        await runTransitionTo(index);
      }
    } finally {
      busy.current = false;
      if (transitionQueue.current.length > 0) {
        void drainQueue();
      }
    }
  }, [runTransitionTo]);

  const playToIndex = useCallback(
    (index: number) => {
      transitionQueue.current.push(index);
      void drainQueue();
    },
    [drainQueue],
  );

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    void (async () => {
      unsubs.push(
        await listen(PROGRAM_READY, async () => {
          const s = showRef.current;
          const path =
            s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
          await emitStatic({ path });
          const canvas = canvasRef.current;
          if (canvas) {
            await runStaticOnCanvas(canvas, path);
          }
        }),
      );
    })();

    const win = getCurrentWindow();
    const dropUnsub = win.onDragDropEvent((event) => {
      if (event.payload.type !== "drop") {
        return;
      }
      const paths = event.payload.paths.filter((p) => IMAGE_EXT.test(p));
      if (paths.length === 0) {
        return;
      }
      const idx = showRef.current.selectedIndex;
      const cells = fillCellsFromIndex(showRef.current.cells, idx, paths);
      persist({ ...showRef.current, cells });
    });

    return () => {
      unsubs.forEach((u) => u());
      void dropUnsub.then((f) => f());
    };
  }, [persist]);

  const clearSelected = useCallback(() => {
    const s = showRef.current;
    const i = s.selectedIndex;
    const cells = s.cells.map((c, idx) =>
      idx === i ? { path: null, override: null } : { ...c },
    );
    let currentIndex = s.currentIndex;
    if (currentIndex === i) {
      currentIndex = -1;
      void emitStatic({ path: null });
      const canvas = canvasRef.current;
      if (canvas) {
        void runStaticOnCanvas(canvas, null);
      }
    }
    persist({ ...s, cells, currentIndex });
  }, [persist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (updateUiOpen.current) {
        return;
      }
      if (e.code === "Delete") {
        clearSelected();
        return;
      }
      if (e.code !== "Space" || e.repeat) {
        return;
      }
      e.preventDefault();
      const s = showRef.current;
      const from = s.currentIndex >= 0 ? s.currentIndex : -1;
      const next = findNextSpaceIndex(s, from);
      if (next !== null) {
        void playToIndex(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playToIndex, clearSelected]);

  const onCellClick = (index: number) => {
    if (suppressCellClick.current) {
      suppressCellClick.current = false;
      return;
    }
    const cell = show.cells[index];
    if (cell.path) {
      void playToIndex(index);
    } else {
      persist({ ...show, selectedIndex: index });
    }
  };

  const onCellPointerDown = (index: number, e: React.PointerEvent) => {
    if (!show.cells[index]?.path || e.button !== 0) {
      return;
    }
    e.preventDefault();
    paletteDrag.current = {
      from: index,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  };

  const onCellPointerEnter = (index: number) => {
    if (paletteDrag.current) {
      paletteDropTargetRef.current = index;
      setPaletteDropTarget(index);
    }
  };

  const relocateCell = useCallback(
    (from: number, to: number) => {
      const s = showRef.current;
      const cells = movePaletteCell(s.cells, from, to);
      let currentIndex = s.currentIndex;
      if (currentIndex === from) {
        currentIndex = to;
      } else if (currentIndex === to) {
        currentIndex = from;
      }
      persist({ ...s, cells, currentIndex, selectedIndex: to });
    },
    [persist],
  );

  const finishPaletteDrag = useCallback(
    (targetIndex: number | null) => {
      const drag = paletteDrag.current;
      paletteDrag.current = null;
      setPaletteDraggingFrom(null);
      paletteDropTargetRef.current = null;
      setPaletteDropTarget(null);
      document.body.classList.remove("palette-dragging");
      window.getSelection()?.removeAllRanges();
      if (drag?.active && targetIndex !== null && targetIndex !== drag.from) {
        suppressCellClick.current = true;
        relocateCell(drag.from, targetIndex);
      }
    },
    [relocateCell],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = paletteDrag.current;
      if (!drag) {
        return;
      }
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.active && Math.hypot(dx, dy) > 6) {
        drag.active = true;
        setPaletteDraggingFrom(drag.from);
        document.body.classList.add("palette-dragging");
        window.getSelection()?.removeAllRanges();
      }
      if (drag.active) {
        e.preventDefault();
      }
    };
    const onUp = () => {
      finishPaletteDrag(paletteDropTargetRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [finishPaletteDrag]);

  useEffect(() => {
    const blockSelect = (e: Event) => {
      if (paletteDrag.current) {
        e.preventDefault();
      }
    };
    document.addEventListener("selectstart", blockSelect);
    return () => document.removeEventListener("selectstart", blockSelect);
  }, []);

  const selected = show.cells[show.selectedIndex];
  const cellOverride = ensureOverrideUi(selected?.override ?? null);
  const changePaletteSize = (nextSize: PaletteSize) => {
    if (nextSize === show.paletteSize) {
      return;
    }
    let cells = show.cells;
    if (nextSize < show.paletteSize && hasMaterialBeyond(cells, nextSize)) {
      const beyond = countMaterialBeyond(cells, nextSize);
      const ok = window.confirm(buildTrimWarning(nextSize, beyond));
      if (!ok) {
        return;
      }
    }
    cells = normalizeCells(cells, nextSize);
    let currentIndex = show.currentIndex;
    let selectedIndex = show.selectedIndex;
    if (currentIndex >= nextSize) {
      currentIndex = -1;
      void emitStatic({ path: null });
      const canvas = canvasRef.current;
      if (canvas) {
        void runStaticOnCanvas(canvas, null);
      }
    }
    if (selectedIndex >= nextSize) {
      selectedIndex = nextSize - 1;
    }
    persist({
      ...show,
      paletteSize: nextSize,
      cells,
      currentIndex,
      selectedIndex,
    });
  };

  return (
    <div className="control-root">
      <header className="control-header">
        <h1>画像スワイプ</h1>
        <p className="control-lead">
          コマへ画像をドロップ · クリックまたは Space で出力 · 方向は「今の画像が出ていく向き」
        </p>
      </header>

      <div className="control-main">
        <div className="control-left">
          <div className="preview-wrap">
            <span className="preview-label">プレビュー</span>
            <div className="preview-stage">
              <canvas ref={canvasRef} className="preview-canvas" />
            </div>
          </div>

          <div className="palette-wrap">
          <div
            className="palette-grid"
            style={{
              gridTemplateColumns: `repeat(${PALETTE_COLS}, minmax(0, 1fr))`,
            }}
          >
            {show.cells.map((cell, index) => {
              const swipe = getEffectiveSettings(cell, show.globalSettings);
              const custom = cell.override?.enabled === true;
              const classNames = ["palette-cell"];
              if (index === show.selectedIndex) {
                classNames.push("selected");
              }
              if (index === show.currentIndex) {
                classNames.push("live");
              }
              if (show.skipEmptyOnSpace && !cell.path) {
                classNames.push("skip-empty");
              }
              if (paletteDraggingFrom === index) {
                classNames.push("dragging");
              }
              if (paletteDropTarget === index && paletteDraggingFrom !== null) {
                classNames.push("drop-target");
              }
              if (cell.path) {
                classNames.push("draggable");
              }
              return (
                <div
                  key={index}
                  className={classNames.join(" ")}
                  onClick={() => onCellClick(index)}
                  onPointerDown={(e) => onCellPointerDown(index, e)}
                  onPointerEnter={() => onCellPointerEnter(index)}
                >
                  <span className="cell-num">{index + 1}</span>
                  <div className="cell-thumb-area">
                    {cell.path ? (
                      <img
                        className="cell-thumb"
                        src={thumbs[index] ?? fileSrc(cell.path)}
                        alt=""
                        draggable={false}
                      />
                    ) : (
                      <span className="cell-empty">空</span>
                    )}
                  </div>
                  <CellSwipeMeta settings={swipe} custom={custom} />
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-ghost" onClick={clearSelected}>
            選択コマを空にする (Delete)
          </button>
          </div>
        </div>

        <aside className="control-aside">
          <SettingsPanel
            title="全体のスワイプ設定"
            settings={show.globalSettings}
            hint="方向＝今の画像が出ていく向き"
            onChange={(globalSettings) => persist({ ...show, globalSettings })}
          />
          <SettingsPanel
            title={`コマ ${show.selectedIndex + 1} の個別設定`}
            settings={cellOverride.settings}
            overrideMode={{
              enabled: cellOverride.enabled,
              onToggle: (enabled) => {
                const cells = show.cells.map((c, i) =>
                  i === show.selectedIndex
                    ? {
                        ...c,
                        override: {
                          ...ensureOverrideUi(c.override),
                          enabled,
                          settings: cellOverride.settings,
                        },
                      }
                    : c,
                );
                persist({ ...show, cells });
              },
            }}
            onChange={(settings) => {
              const cells = show.cells.map((c, i) =>
                i === show.selectedIndex
                  ? {
                      ...c,
                      override: { enabled: true, settings },
                    }
                  : c,
              );
              persist({ ...show, cells });
            }}
          />
        </aside>
      </div>

      <footer className="control-footer">
        <label className="footer-check">
          <input
            type="checkbox"
            checked={show.skipEmptyOnSpace}
            onChange={(e) =>
              persist({ ...show, skipEmptyOnSpace: e.target.checked })
            }
          />
          Spaceで空コマをスキップ
        </label>
        <label>
          パレット
          <select
            value={show.paletteSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (isPaletteSize(n)) {
                changePaletteSize(n);
              }
            }}
          >
            {PALETTE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} コマ（{n / PALETTE_COLS} 行）
              </option>
            ))}
          </select>
        </label>
        <label>
          出力先モニタ
          <select
            value={outputMonitor}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setOutputMonitor(idx);
              void invoke("move_output_to_monitor", { index: idx });
            }}
          >
            {monitors.map((m) => (
              <option key={m.index} value={m.index}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <UpdatePanel />
        <span className="footer-status">
          出力中:{" "}
          {show.currentIndex >= 0 ? `コマ ${show.currentIndex + 1}` : "なし"}
        </span>
      </footer>
    </div>
  );
}
