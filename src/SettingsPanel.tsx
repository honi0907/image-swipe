import type { CellOverride, Direction, Easing, SwipeKind, SwipeSettings } from "./types";

const KIND_LABELS: Record<SwipeKind, string> = {
  cut: "カット（瞬間切替）",
  slide: "スライド（下固定・上から被せ）",
  push: "プッシュ（2枚とも動く）",
  wipe: "ワイプ",
  fade: "フェード",
};

const KIND_HINTS: Partial<Record<SwipeKind, string>> = {
  cut: "アニメなしで次の画像に切り替えます。",
  slide: "今の画像は動かず、次の画像だけが入ってきます（覆いかぶせる感じ）。",
  push: "今の画像も次の画像も一緒に動きます（押し出す感じ）。",
};

const DIR_LABELS: Record<Direction, string> = {
  left: "左",
  right: "右",
  up: "上",
  down: "下",
};

const EASE_LABELS: Record<Easing, string> = {
  linear: "リニア",
  "ease-in": "ゆっくり始まる",
  "ease-out": "ゆっくり終わる",
  "ease-in-out": "両端ゆっくり",
};

interface Props {
  title: string;
  settings: SwipeSettings;
  onChange: (s: SwipeSettings) => void;
  overrideMode?: { enabled: boolean; onToggle: (v: boolean) => void };
  hint?: string;
}

export function SettingsPanel({
  title,
  settings,
  onChange,
  overrideMode,
  hint,
}: Props) {
  const fade = settings.kind === "fade";
  const cut = settings.kind === "cut";
  const noDirection = fade || cut;
  const noMotion = fade || cut;

  return (
    <section className="settings-panel">
      <header className="settings-head">
        <h2>{title}</h2>
        {overrideMode && (
          <label className="override-toggle">
            <input
              type="checkbox"
              checked={overrideMode.enabled}
              onChange={(e) => overrideMode.onToggle(e.target.checked)}
            />
            個別設定を使う
          </label>
        )}
      </header>
      {hint && <p className="settings-hint">{hint}</p>}

      <div
        className={
          overrideMode && !overrideMode.enabled ? "settings-grid muted" : "settings-grid"
        }
      >
        <label>
          種類
          <select
            value={settings.kind}
            onChange={(e) => {
              const kind = e.target.value as SwipeKind;
              onChange({
                ...settings,
                kind,
                durationSec: kind === "cut" ? 0 : settings.durationSec || 0.6,
              });
            }}
            disabled={overrideMode !== undefined && !overrideMode.enabled}
          >
            {(Object.keys(KIND_LABELS) as SwipeKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {KIND_HINTS[settings.kind] && (
          <p className="settings-kind-hint">{KIND_HINTS[settings.kind]}</p>
        )}

        <label>
          方向
          <select
            value={settings.direction}
            onChange={(e) =>
              onChange({ ...settings, direction: e.target.value as Direction })
            }
            disabled={noDirection || (overrideMode !== undefined && !overrideMode.enabled)}
          >
            {(Object.keys(DIR_LABELS) as Direction[]).map((d) => (
              <option key={d} value={d}>
                {DIR_LABELS[d]}
              </option>
            ))}
          </select>
        </label>

        <label>
          速度（秒）
          <input
            type="range"
            min={0.15}
            max={2.5}
            step={0.05}
            value={settings.durationSec}
            onChange={(e) =>
              onChange({ ...settings, durationSec: Number(e.target.value) })
            }
            disabled={noMotion || (overrideMode !== undefined && !overrideMode.enabled)}
          />
          <span className="range-val">
            {cut ? "—" : settings.durationSec.toFixed(2)}
          </span>
        </label>

        <label>
          イージング
          <select
            value={settings.easing}
            onChange={(e) =>
              onChange({ ...settings, easing: e.target.value as Easing })
            }
            disabled={noMotion || (overrideMode !== undefined && !overrideMode.enabled)}
          >
            {(Object.keys(EASE_LABELS) as Easing[]).map((e) => (
              <option key={e} value={e}>
                {EASE_LABELS[e]}
              </option>
            ))}
          </select>
        </label>

        <label>
          境界のぼかし（%）
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.edgeBlur}
            onChange={(e) =>
              onChange({ ...settings, edgeBlur: Number(e.target.value) })
            }
            disabled={
              fade ||
              settings.kind !== "wipe" ||
              (overrideMode !== undefined && !overrideMode.enabled)
            }
          />
          <span className="range-val">{settings.edgeBlur}</span>
        </label>
      </div>
    </section>
  );
}

export function ensureOverride(o: CellOverride | null): CellOverride {
  return (
    o ?? {
      enabled: false,
      settings: {
        kind: "slide",
        direction: "left",
        durationSec: 0.6,
        easing: "ease-out",
        edgeBlur: 20,
      },
    }
  );
}
