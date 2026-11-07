import { useCallback, useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  appVersion,
  downloadInstall,
  findUpdate,
  updateUiOpen,
} from "./updater";

type Phase = "hidden" | "prompt" | "downloading" | "installing" | "note";

export function UpdatePanel() {
  const [version, setVersion] = useState("…");
  const [phase, setPhase] = useState<Phase>("hidden");
  const [nextVersion, setNextVersion] = useState("");
  const [note, setNote] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [pending, setPending] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);

  const open = phase !== "hidden";
  updateUiOpen.current = open;

  const look = useCallback(async (fromStartup: boolean) => {
    setBusy(true);
    try {
      const update = await findUpdate();
      if (!update) {
        if (!fromStartup) {
          setNote("最新バージョンです");
          setPhase("note");
        }
        return;
      }
      setPending(update);
      setNextVersion(update.version);
      setPhase("prompt");
    } catch {
      if (!fromStartup) {
        setNote("更新を確認できませんでした");
        setPhase("note");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void appVersion().then(setVersion);
    void look(true);
  }, [look]);

  const install = async () => {
    if (!pending) {
      return;
    }
    setPhase("downloading");
    setPercent(0);
    try {
      await downloadInstall(pending, (value) => {
        setPercent(value);
        if (value === 100) {
          setPhase("installing");
        }
      });
    } catch {
      setNote("更新に失敗しました");
      setPhase("note");
    }
  };

  const close = () => {
    void pending?.close();
    setPending(null);
    setPhase("hidden");
  };

  return (
    <>
      <span className="footer-version">v{version}</span>
      <button
        type="button"
        className="btn-ghost footer-update"
        disabled={busy || phase === "downloading" || phase === "installing"}
        onClick={() => void look(false)}
      >
        更新を確認
      </button>
      {open && (
        <div className="update-backdrop" role="dialog" aria-modal="true">
          <div className="update-card">
            {phase === "prompt" && (
              <>
                <h2>更新があります</h2>
                <p>
                  v{version} → v{nextVersion}
                </p>
                <p>OK でインストーラをダウンロードして更新します。</p>
                <div className="update-actions">
                  <button type="button" className="btn-ghost" onClick={close}>
                    あとで
                  </button>
                  <button type="button" className="btn-update-ok" onClick={() => void install()}>
                    OK
                  </button>
                </div>
              </>
            )}
            {phase === "downloading" && (
              <>
                <h2>ダウンロード中</h2>
                <p className="update-percent">
                  {percent === null ? "…" : `${percent}%`}
                </p>
                <div className="update-bar">
                  <div
                    className="update-bar-fill"
                    style={{ width: `${percent ?? 8}%` }}
                  />
                </div>
              </>
            )}
            {phase === "installing" && (
              <>
                <h2>インストール中</h2>
                <p>完了後に自動で再起動します。</p>
              </>
            )}
            {phase === "note" && (
              <>
                <h2>更新</h2>
                <p>{note}</p>
                <div className="update-actions">
                  <button type="button" className="btn-update-ok" onClick={close}>
                    閉じる
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
