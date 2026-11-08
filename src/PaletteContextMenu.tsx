import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  cellIndex: number;
  onDelete: (index: number) => void;
  onClose: () => void;
};

export function PaletteContextMenu({
  x,
  y,
  cellIndex,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="palette-context-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete(cellIndex);
          onClose();
        }}
      >
        コマを削除
      </button>
    </div>
  );
}
