import { useEffect, useRef, useState } from "react";

type Props = {
  projectPath: string | null;
  onNew: () => void;
  onSaveAs: () => void;
  onOverwriteSave: () => void;
};

export function FileMenuBar({
  projectPath,
  onNew,
  onSaveAs,
  onOverwriteSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const fileName = projectPath
    ? projectPath.replace(/^.*[\\/]/, "")
    : null;

  return (
    <nav className="menu-bar" ref={barRef} aria-label="メインメニュー">
      <div className="menu-root">
        <button
          type="button"
          className={`menu-top${open ? " active" : ""}`}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          ファイル
        </button>
        {open && (
          <div className="menu-dropdown" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
            >
              新規作成…
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onSaveAs();
                setOpen(false);
              }}
            >
              保存…
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!projectPath}
              title={
                projectPath ? undefined : "先に「保存…」でファイルを指定してください"
              }
              onClick={() => {
                onOverwriteSave();
                setOpen(false);
              }}
            >
              上書き保存
            </button>
          </div>
        )}
      </div>
      {fileName && <span className="menu-doc-name">{fileName}</span>}
    </nav>
  );
}
