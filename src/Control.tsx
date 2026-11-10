import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { confirm } from "@tauri-apps/plugin-dialog";
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
import { FileMenuBar } from "./FileMenuBar";
import { PaletteContextMenu } from "./PaletteContextMenu";
import {
  pickSaveProjectPath,
  reportProjectError,
  scanMissingPaths,
  writeProjectFile,
} from "./projectFile";
import {
  assignDroppedImages,
  createEmptyShow,
  findNextSpaceIndex,
  getEffectiveSettings,
  loadShow,
  movePaletteCell,
  saveShow,
} from "./show";
import {
  dragDropPositionToClient,
  paletteIndexAtPoint,
} from "./paletteDrop";
import { isVideoPath, MEDIA_EXT } from "./media";
import { PaletteVideoThumb } from "./PaletteVideoThumb";
import { thumbFromPath } from "./thumbs";
import {
  emitStatic,
  emitTransition,
  fileSrc,
  PROGRAM_READY,
  runStaticOnCanvas,
  runTransitionOnCanvas,
} from "./transitionBridge";
import { ColorAdjustPanel } from "./ColorAdjustPanel";
import { redrawStaticIfCached } from "./draw";
import { CellSwipeMeta } from "./CellSwipeMeta";
import { ensureOverride as ensureOverrideUi, SettingsPanel } from "./SettingsPanel";
import { UpdatePanel } from "./UpdatePanel";
import { updateUiOpen } from "./updater";
import {
  REMOTE_CUE_EVENT,
  type RemoteCuePayload,
} from "./remoteCue";
import "./Control.css";

type MonitorDto = {
  index: number;
  name: string;
};

/** pointerup 直後に合成されるクリックを1回だけ捨てる（次の意図的なクリックはそのまま通す） */
function absorbSpuriousPaletteClickAfterDrag(): void {
  const handler = (e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof Element) || !target.closest(".palette-cell")) {
      return;
    }
    window.clearTimeout(timer);
    document.removeEventListener("click", handler, true);
    e.preventDefault();
    e.stopPropagation();
  };
  const timer = window.setTimeout(() => {
    document.removeEventListener("click", handler, true);
  }, 800);
  document.addEventListener("click", handler, true);
}

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
  const paletteDropTargetRef = useRef<number | null>(null);
  const [paletteDropTarget, setPaletteDropTarget] = useState<number | null>(
    null,
  );
  const [fileDropHover, setFileDropHover] = useState<number | null>(null);
  const [paletteDraggingFrom, setPaletteDraggingFrom] = useState<number | null>(
    null,
  );
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [missingPaths, setMissingPaths] = useState<Record<number, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    index: number;
  } | null>(null);
  const missingPathsRef = useRef(missingPaths);
  missingPathsRef.current = missingPaths;

  showRef.current = show;

  const persist = useCallback((next: PersistedShow) => {
    setShow(next);
    saveShow(next);
  }, []);

  const cellsPathKey = show.cells.map((c) => c.path ?? "").join("|");

  const refreshThumbs = useCallback(async (state: PersistedShow) => {
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      if (!cell?.path) {
        setThumbs((prev) => {
          if (!(i in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[i];
          return next;
        });
        continue;
      }
      const pathAtStart = cell.path;
      try {
        const url = await thumbFromPath(cell.path);
        setThumbs((prev) => {
          if (showRef.current.cells[i]?.path !== pathAtStart) {
            return prev;
          }
          return { ...prev, [i]: url };
        });
      } catch {
        setThumbs((prev) => ({ ...prev, [i]: fileSrc(pathAtStart) }));
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshThumbs(showRef.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cellsPathKey, refreshThumbs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    void scanMissingPaths(show).then((m) => {
      if (!cancelled) {
        setMissingPaths(m);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cellsPathKey, show]);

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
      void runStaticOnCanvas(canvas, path, s.colorAdjust);
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const previewColorRaf = useRef(0);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(previewColorRaf.current);
    };
  }, []);

  const handleColorLive = useCallback(
    (colorAdjust: typeof show.colorAdjust) => {
      showRef.current = { ...showRef.current, colorAdjust };
      cancelAnimationFrame(previewColorRaf.current);
      previewColorRaf.current = requestAnimationFrame(() => {
        const s = showRef.current;
        const path =
          s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
        void emitStatic({ path, colorAdjust });
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        const painted = redrawStaticIfCached(
          canvas,
          path,
          fileSrc,
          colorAdjust,
        );
        if (!painted) {
          void runStaticOnCanvas(canvas, path, colorAdjust);
        }
      });
    },
    [],
  );

  const handleColorCommit = useCallback(
    (colorAdjust: typeof show.colorAdjust) => {
      showRef.current = { ...showRef.current, colorAdjust };
      const s = showRef.current;
      const path =
        s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
      void emitStatic({ path, colorAdjust });
      persist({ ...s, colorAdjust });
    },
    [persist],
  );

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
      persist({ ...s, selectedIndex: index });
      const fromPath =
        s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
      const settings = getEffectiveSettings(cell, s.globalSettings);
      const startedAt = Date.now();
      const payload: TransitionPayload = {
        fromPath,
        toPath: cell.path,
        settings,
        colorAdjust: s.colorAdjust,
        startedAt,
      };
      try {
        await emitTransition(payload);
        const canvas = canvasRef.current;
        if (canvas) {
          await runTransitionOnCanvas(canvas, payload);
          if (cell.path && isVideoPath(cell.path)) {
            await runStaticOnCanvas(canvas, cell.path, s.colorAdjust);
          }
        }
        persist({ ...showRef.current, currentIndex: index, selectedIndex: index });
      } catch (error) {
        console.error("playToIndex failed", error);
      }
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

  const triggerSelectAt = useCallback(
    (index: number) => {
      const s = showRef.current;
      if (index < 0 || index >= s.cells.length) {
        return;
      }
      persist({ ...s, selectedIndex: index });
    },
    [persist],
  );

  const triggerCueAt = useCallback(
    (index: number) => {
      const s = showRef.current;
      const cell = s.cells[index];
      if (cell?.path && !missingPathsRef.current[index]) {
        playToIndex(index);
      } else {
        triggerSelectAt(index);
      }
    },
    [playToIndex, triggerSelectAt],
  );

  const triggerNextCue = useCallback(() => {
    const s = showRef.current;
    const from = s.currentIndex >= 0 ? s.currentIndex : -1;
    const next = findNextSpaceIndex(s, from, missingPathsRef.current);
    if (next !== null) {
      playToIndex(next);
    }
  }, [playToIndex]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<RemoteCuePayload>(REMOTE_CUE_EVENT, (event) => {
      const payload = event.payload;
      if (payload.kind === "next") {
        triggerNextCue();
        return;
      }
      if (payload.index === undefined) {
        return;
      }
      if (payload.kind === "goto") {
        triggerCueAt(payload.index);
      } else if (payload.kind === "select") {
        triggerSelectAt(payload.index);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [triggerCueAt, triggerNextCue, triggerSelectAt]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    void (async () => {
      unsubs.push(
        await listen(PROGRAM_READY, async () => {
          const s = showRef.current;
          const path =
            s.currentIndex >= 0 ? s.cells[s.currentIndex]?.path ?? null : null;
          await emitStatic({ path, colorAdjust: s.colorAdjust });
          const canvas = canvasRef.current;
          if (canvas) {
            await runStaticOnCanvas(canvas, path, s.colorAdjust);
          }
        }),
      );
    })();

    const webview = getCurrentWebview();
    const dropUnsub = webview.onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (payload.type === "leave") {
        setFileDropHover(null);
        return;
      }
      if (payload.type === "enter" || payload.type === "over") {
        const { x, y } = await dragDropPositionToClient(payload.position);
        setFileDropHover(paletteIndexAtPoint(x, y));
        return;
      }
      if (payload.type !== "drop") {
        return;
      }
      setFileDropHover(null);
      const paths = payload.paths.filter((p) => MEDIA_EXT.test(p));
      if (paths.length === 0) {
        return;
      }
      const { x, y } = await dragDropPositionToClient(payload.position);
      const hit = paletteIndexAtPoint(x, y);
      const idx = hit ?? showRef.current.selectedIndex;
      const cells = assignDroppedImages(showRef.current.cells, idx, paths);
      persist({ ...showRef.current, cells, selectedIndex: idx });
    });

    return () => {
      unsubs.forEach((u) => u());
      void dropUnsub.then((f) => f());
    };
  }, [persist]);

  const clearCellAt = useCallback(
    (index: number) => {
      const s = showRef.current;
      if (index < 0 || index >= s.cells.length) {
        return;
      }
      const cells = s.cells.map((c, idx) =>
        idx === index ? { path: null, override: null } : { ...c },
      );
      let currentIndex = s.currentIndex;
      if (currentIndex === index) {
        currentIndex = -1;
        void emitStatic({ path: null, colorAdjust: s.colorAdjust });
        const canvas = canvasRef.current;
        if (canvas) {
          void runStaticOnCanvas(canvas, null, s.colorAdjust);
        }
      }
      persist({ ...s, cells, currentIndex, selectedIndex: index });
    },
    [persist],
  );

  const clearSelected = useCallback(() => {
    clearCellAt(showRef.current.selectedIndex);
  }, [clearCellAt]);

  const resetToNewShow = useCallback(() => {
    const next = createEmptyShow(showRef.current.paletteSize);
    setProjectPath(null);
    persist(next);
    void emitStatic({ path: null, colorAdjust: next.colorAdjust });
    const canvas = canvasRef.current;
    if (canvas) {
      void runStaticOnCanvas(canvas, null, next.colorAdjust);
    }
  }, [persist]);

  const handleNewProject = useCallback(async () => {
    const ok = await confirm(
      "現在のパレットと設定はすべて破棄されます。新規作成しますか？",
      { title: "新規作成", kind: "warning" },
    );
    if (ok) {
      resetToNewShow();
    }
  }, [resetToNewShow]);

  const handleSaveAs = useCallback(async () => {
    try {
      const path = await pickSaveProjectPath(projectPath);
      if (!path) {
        return;
      }
      await writeProjectFile(path, showRef.current);
      setProjectPath(path);
    } catch (e) {
      await reportProjectError(e);
    }
  }, [projectPath]);

  const handleOverwriteSave = useCallback(async () => {
    if (!projectPath) {
      await handleSaveAs();
      return;
    }
    try {
      await writeProjectFile(projectPath, showRef.current);
    } catch (e) {
      await reportProjectError(e);
    }
  }, [projectPath, handleSaveAs]);

  useEffect(() => {
    const blocksTypingShortcuts = (target: EventTarget | null) => {
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return true;
      }
      if (target instanceof HTMLInputElement) {
        const { type } = target;
        return type !== "checkbox" && type !== "radio";
      }
      return false;
    };

    /** テキスト入力中以外は Space でコマ送りを優先（右メニューの select / range 含む） */
    const blocksSpaceForPalette = (target: EventTarget | null) => {
      if (target instanceof HTMLTextAreaElement) {
        return true;
      }
      if (target instanceof HTMLInputElement) {
        const { type } = target;
        return (
          type === "text" ||
          type === "search" ||
          type === "password" ||
          type === "email" ||
          type === "url" ||
          type === "tel" ||
          type === "number"
        );
      }
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (updateUiOpen.current) {
        return;
      }
      if (e.code === "Delete" || e.code === "Backspace") {
        if (blocksTypingShortcuts(e.target)) {
          return;
        }
        e.preventDefault();
        clearSelected();
        return;
      }
      if (e.ctrlKey && e.code === "KeyS") {
        if (blocksTypingShortcuts(e.target)) {
          return;
        }
        e.preventDefault();
        void handleOverwriteSave();
        return;
      }
      if (e.code !== "Space" || e.repeat) {
        return;
      }
      if (blocksSpaceForPalette(e.target)) {
        return;
      }
      e.preventDefault();
      triggerNextCue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerNextCue, clearSelected, handleOverwriteSave]);

  const onCellClick = (index: number) => {
    triggerCueAt(index);
  };

  const onCellContextMenu = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    persist({ ...show, selectedIndex: index });
    setContextMenu({ x: e.clientX, y: e.clientY, index });
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
      if (drag?.active) {
        absorbSpuriousPaletteClickAfterDrag();
        if (targetIndex !== null && targetIndex !== drag.from) {
          relocateCell(drag.from, targetIndex);
        }
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
        const hit = paletteIndexAtPoint(e.clientX, e.clientY);
        paletteDropTargetRef.current = hit;
        setPaletteDropTarget(hit);
      }
    };
    const onUp = (e: PointerEvent) => {
      let target = paletteDropTargetRef.current;
      if (paletteDrag.current?.active) {
        const hit = paletteIndexAtPoint(e.clientX, e.clientY);
        if (hit !== null) {
          target = hit;
        }
      }
      finishPaletteDrag(target);
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
      void emitStatic({ path: null, colorAdjust: show.colorAdjust });
      const canvas = canvasRef.current;
      if (canvas) {
        void runStaticOnCanvas(canvas, null, show.colorAdjust);
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
      <header className="control-menubar-wrap">
        <FileMenuBar
          projectPath={projectPath}
          onNew={() => void handleNewProject()}
          onSaveAs={() => void handleSaveAs()}
          onOverwriteSave={() => void handleOverwriteSave()}
        />
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
              if (
                (paletteDropTarget === index &&
                  paletteDraggingFrom !== null) ||
                fileDropHover === index
              ) {
                classNames.push("drop-target");
              }
              const missing = cell.path && missingPaths[index];
              if (cell.path && !missing) {
                classNames.push("draggable");
              }
              if (missing) {
                classNames.push("missing-media");
              }
              return (
                <div
                  key={index}
                  data-palette-index={index}
                  className={classNames.join(" ")}
                  title={
                    missing && cell.path
                      ? `素材が見つかりません: ${cell.path}`
                      : undefined
                  }
                  onClick={() => onCellClick(index)}
                  onContextMenu={(e) => onCellContextMenu(index, e)}
                  onPointerDown={(e) => onCellPointerDown(index, e)}
                  onPointerEnter={() => onCellPointerEnter(index)}
                >
                  <span className="cell-num">{index + 1}</span>
                  <div className="cell-thumb-area">
                    {missing ? (
                      <span className="cell-missing">
                        素材なし
                        <span className="cell-missing-sub">再ドロップで上書き</span>
                      </span>
                    ) : cell.path ? (
                      isVideoPath(cell.path) ? (
                        <>
                          <PaletteVideoThumb
                            path={cell.path}
                            poster={thumbs[index]}
                            livePreview={index === show.currentIndex}
                          />
                          <span className="cell-video-badge" aria-hidden>
                            VIDEO
                          </span>
                        </>
                      ) : (
                        <img
                          className="cell-thumb"
                          src={thumbs[index] ?? fileSrc(cell.path)}
                          alt=""
                          draggable={false}
                        />
                      )
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
            選択コマを削除 (Delete / Backspace)
          </button>
          </div>
        </div>

        <aside className="control-aside">
          <SettingsPanel
            title="全体のスワイプ設定"
            collapseId="swipe-global"
            settings={show.globalSettings}
            hint="方向＝今の画像が出ていく向き"
            onChange={(globalSettings) => persist({ ...show, globalSettings })}
          />
          <SettingsPanel
            title={`コマ ${show.selectedIndex + 1} の個別設定`}
            collapseId="swipe-cell"
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
          <ColorAdjustPanel
            value={show.colorAdjust}
            onLiveChange={handleColorLive}
            onCommit={handleColorCommit}
          />
        </aside>
      </div>

      {contextMenu && (
        <PaletteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          cellIndex={contextMenu.index}
          onDelete={clearCellAt}
          onClose={() => setContextMenu(null)}
        />
      )}

      <footer className="control-footer">
        <label className="footer-check">
          <input
            type="checkbox"
            checked={show.skipEmptyOnSpace}
            onChange={(e) =>
              persist({ ...show, skipEmptyOnSpace: e.target.checked })
            }
            onKeyDown={(e) => {
              if (e.code === "Space" || e.code === "Enter") {
                e.preventDefault();
              }
            }}
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
