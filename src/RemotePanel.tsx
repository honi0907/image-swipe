import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import {
  BLE_DEVICE_NAME_PREFIX,
  REMOTE_PUBLIC_PAGE_URL,
  REMOTE_PUBLIC_RELEASE_URL,
} from "./remoteCue";

type RemoteInfo = {
  lanUrl: string;
  alternateLanUrls: string[];
  lanReady: boolean;
  lanSelfCheck: boolean;
  httpListening: boolean;
  bleAdvertising: boolean;
  bleError: string | null;
};

export function RemotePanel() {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [qrPublic, setQrPublic] = useState<string | null>(null);
  const [qrLan, setQrLan] = useState<string | null>(null);
  const [fwHint, setFwHint] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void invoke<RemoteInfo>("get_remote_info").then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(REMOTE_PUBLIC_PAGE_URL, {
      margin: 2,
      width: 168,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (!cancelled) {
        setQrPublic(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!info?.lanUrl) {
      setQrLan(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(info.lanUrl, {
      margin: 2,
      width: 120,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) {
          setQrLan(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrLan(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [info?.lanUrl]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("コピーしました");
    } catch {
      setCopyHint("コピーできませんでした");
    }
    window.setTimeout(() => setCopyHint(null), 2000);
  };

  const onOpenOnPc = () => {
    void invoke("open_remote_page", { url: REMOTE_PUBLIC_PAGE_URL });
  };

  const onAllowFirewall = () => {
    void invoke("allow_remote_firewall")
      .then(() => setFwHint("ファイアウォール規則を追加しました"))
      .catch((e: unknown) =>
        setFwHint(typeof e === "string" ? e : "ファイアウォール規則を追加できませんでした"),
      );
    window.setTimeout(() => setFwHint(null), 4000);
  };

  let bleLabel = "準備中…";
  if (info) {
    if (info.bleAdvertising) {
      bleLabel = `Bluetooth: ${BLE_DEVICE_NAME_PREFIX}`;
    } else if (info.bleError) {
      bleLabel = "Bluetooth 利用不可";
    } else {
      bleLabel = "Bluetooth 起動中…";
    }
  }

  const lanBlocked =
    info && info.lanReady && info.httpListening && !info.lanSelfCheck;

  return (
    <div className="remote-panel" title={info?.bleError ?? undefined}>
      <p className="remote-panel-lead">
        <strong>スマホ用 QR</strong> は GitHub Pages の HTTPS です。404 のときは下の
        <strong>リリース用 URL</strong> を試すか、main を push したあと GitHub Pages
        の配信を 1〜2 分待ってください。
      </p>
      <div className="remote-panel-qr-block remote-panel-qr-primary">
        <span className="remote-panel-qr-title">スマホ用 QR（推奨）</span>
        {qrPublic ? (
          <img
            className="remote-panel-qr"
            src={qrPublic}
            width={168}
            height={168}
            alt="スマホ用 HTTPS リモートの QR コード"
          />
        ) : (
          <div className="remote-panel-qr-placeholder" aria-hidden>
            QR
          </div>
        )}
        <button
          type="button"
          className="remote-panel-link"
          onClick={() => copyText(REMOTE_PUBLIC_PAGE_URL)}
        >
          {REMOTE_PUBLIC_PAGE_URL}
        </button>
        <button
          type="button"
          className="remote-panel-link remote-panel-alt-link"
          onClick={() => copyText(REMOTE_PUBLIC_RELEASE_URL)}
        >
          リリース用: {REMOTE_PUBLIC_RELEASE_URL}
        </button>
      </div>
      <div className="remote-panel-qr-block remote-panel-qr-secondary">
        <span className="remote-panel-qr-title">同一 Wi‑Fi 用（LAN・任意）</span>
        {qrLan ? (
          <img
            className="remote-panel-qr remote-panel-qr-small"
            src={qrLan}
            width={120}
            height={120}
            alt="LAN リモート URL の QR コード"
          />
        ) : (
          <div className="remote-panel-qr-placeholder remote-panel-qr-small" aria-hidden>
            LAN
          </div>
        )}
        {info?.lanUrl ? (
          <button type="button" className="remote-panel-link" onClick={() => copyText(info.lanUrl)}>
            {info.lanUrl}
          </button>
        ) : (
          <span className="remote-panel-muted">URL を取得中…</span>
        )}
      </div>
      {lanBlocked && (
        <p className="remote-panel-warn">
          PC 上では LAN URL が開きますが、スマホからは届いていない可能性があります（ファイアウォール・
          Wi‑Fi の端末隔離）。上のスマホ用 QR を使うか、下のボタンで受信許可を試してください。
        </p>
      )}
      <button type="button" className="remote-panel-action" onClick={onAllowFirewall}>
        スマホから LAN に繋がるようファイアウォール許可
      </button>
      <button type="button" className="remote-panel-action" onClick={onOpenOnPc}>
        PC のブラウザでスマホ用ページを開く
      </button>
      {info && info.alternateLanUrls.length > 0 && (
        <p>
          <button
            type="button"
            className="remote-panel-link"
            onClick={() => copyText(info.alternateLanUrls.join("\n"))}
          >
            別の LAN URL をコピー（{info.alternateLanUrls.length} 件）
          </button>
        </p>
      )}
      <ul className="remote-panel-checklist">
        <li>Bluetooth 接続で一覧が空 → ページの「一覧から接続」で PC を選択（Windows は名前が出ないことがあります）</li>
        <li>LAN が使えない会場でも Bluetooth だけで送出できます</li>
        <li>LAN を使う場合のみ PC とスマホを同一 Wi‑Fi に</li>
      </ul>
      <p className="remote-panel-ble">{bleLabel}</p>
      {info?.bleError && <p className="remote-panel-ble-detail">{info.bleError}</p>}
      {fwHint && <p className="remote-panel-copy">{fwHint}</p>}
      {copyHint && <p className="remote-panel-copy">{copyHint}</p>}
    </div>
  );
}
