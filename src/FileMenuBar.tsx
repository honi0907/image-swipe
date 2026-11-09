import { useEffect, useRef, useState } from "react";
import { RemotePanel } from "./RemotePanel";

type Props = {
  projectPath: string | null;
  onNew: () => void;
  onSaveAs: () => void;
  onOverwriteSave: () => void;
};

type OpenMenu = "file" | "remote" | null;

export function FileMenuBar({
  projectPath,
  onNew,
  onSaveAs,
  onOverwriteSave,
}: Props) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const fileName = projectPath
    ? projectPath.replace(/^.*[\\/]/, "")
    : null;

  const toggle = (menu: Exclude<OpenMenu, null>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  return (
    <nav className="menu-bar" ref={barRef} aria-label="メインメニュー">
      <div className="menu-bar-tabs">
        <div className="menu-root">
          <button
            type="button"
            className={`menu-top${openMenu === "file" ? " active" : ""}`}
            aria-expanded={openMenu === "file"}
            aria-haspopup="menu"
            onClick={() => toggle("file")}
          >
            ファイル
          </button>
          {openMenu === "file" && (
            <div className="menu-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onNew();
                  setOpenMenu(null);
                }}
              >
                新規作成…
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSaveAs();
                  setOpenMenu(null);
                }}
              >
                保存…
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!projectPath}
                title={
                  projectPath
                    ? undefined
                    : "先に「保存…」でファイルを指定してください"
                }
                onClick={() => {
                  onOverwriteSave();
                  setOpenMenu(null);
                }}
              >
                上書き保存
              </button>
            </div>
          )}
        </div>
        <div className="menu-root">
          <button
            type="button"
            className={`menu-top${openMenu === "remote" ? " active" : ""}`}
            aria-expanded={openMenu === "remote"}
            aria-haspopup="dialog"
            onClick={() => toggle("remote")}
          >
            リモート
          </button>
          {openMenu === "remote" && (
            <div className="menu-dropdown menu-dropdown-remote" role="dialog">
              <RemotePanel />
            </div>
          )}
        </div>
      </div>
      {fileName && <span className="menu-doc-name">{fileName}</span>}
    </nav>
  );
}
