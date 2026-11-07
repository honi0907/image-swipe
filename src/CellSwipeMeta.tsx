import type { Direction, Easing, SwipeKind, SwipeSettings } from "./types";

const KIND_ICON: Record<SwipeKind, string> = {
  cut: "┊",
  slide: "▯⟨",
  push: "▯▸▯",
  wipe: "▌▐",
  fade: "◐",
};

const KIND_LABEL: Record<SwipeKind, string> = {
  cut: "カット",
  slide: "スライド",
  push: "プッシュ",
  wipe: "ワイプ",
  fade: "フェード",
};

const DIR_ICON: Record<Direction, string> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
};

const EASE_ICON: Record<Easing, string> = {
  linear: "─",
  "ease-in": "⌒",
  "ease-out": "⌓",
  "ease-in-out": "∿",
};

const EASE_LABEL: Record<Easing, string> = {
  linear: "リニア",
  "ease-in": "ゆっくり始まる",
  "ease-out": "ゆっくり終わる",
  "ease-in-out": "両端ゆっくり",
};

function buildTitle(s: SwipeSettings, custom: boolean): string {
  const dir =
    s.kind === "fade" || s.kind === "cut"
      ? ""
      : ` / ${DIR_ICON[s.direction]}${s.direction}`;
  const blur =
    s.kind === "wipe" && s.edgeBlur > 0 ? ` / ぼかし ${s.edgeBlur}%` : "";
  const who = custom ? "個別" : "全体";
  return `${who}: ${KIND_LABEL[s.kind]}${dir} / ${s.durationSec.toFixed(2)}秒 / ${EASE_LABEL[s.easing]}${blur}`;
}

interface Props {
  settings: SwipeSettings;
  custom: boolean;
}

export function CellSwipeMeta({ settings, custom }: Props) {
  const fade = settings.kind === "fade";
  const cut = settings.kind === "cut";
  return (
    <div className="cell-meta" title={buildTitle(settings, custom)}>
      <div className="cell-meta-row cell-meta-primary">
        <span className="cell-glyph cell-glyph-kind" aria-hidden="true">
          {KIND_ICON[settings.kind]}
        </span>
        {!fade && !cut && (
          <span className="cell-glyph cell-glyph-dir" aria-hidden="true">
            {DIR_ICON[settings.direction]}
          </span>
        )}
        {custom && (
          <span className="cell-glyph cell-glyph-custom" title="個別設定">
            ★
          </span>
        )}
      </div>
      <div className="cell-meta-row cell-meta-secondary">
        <span className="cell-glyph cell-glyph-time">
          {cut ? "CUT" : `${settings.durationSec.toFixed(1)}s`}
        </span>
        {!cut && (
          <span className="cell-glyph cell-glyph-ease" aria-hidden="true">
            {EASE_ICON[settings.easing]}
          </span>
        )}
        {settings.kind === "wipe" && settings.edgeBlur > 0 && (
          <span className="cell-glyph cell-glyph-blur" aria-hidden="true">
            ≋
          </span>
        )}
      </div>
    </div>
  );
}
