import type { Direction, Easing, SwipeKind, SwipeSettings } from "./types";

const KIND_LABEL: Record<SwipeKind, string> = {
  cut: "cut",
  slide: "slide",
  push: "push",
  wipe: "wipe",
  fade: "fade",
};

const DIR_ARROW: Record<Direction, string> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
};

const EASE_SHORT: Record<Easing, string> = {
  linear: "lin",
  "ease-in": "in",
  "ease-out": "out",
  "ease-in-out": "io",
};

const EASE_LABEL: Record<Easing, string> = {
  linear: "リニア",
  "ease-in": "ゆっくり始まる",
  "ease-out": "ゆっくり終わる",
  "ease-in-out": "両端ゆっくり",
};

const KIND_TITLE_JA: Record<SwipeKind, string> = {
  cut: "カット",
  slide: "スライド",
  push: "プッシュ",
  wipe: "ワイプ",
  fade: "フェード",
};

function buildTitle(s: SwipeSettings, custom: boolean): string {
  const dir =
    s.kind === "fade" || s.kind === "cut"
      ? ""
      : ` / ${DIR_ARROW[s.direction]} ${s.direction}`;
  const blur =
    s.kind === "wipe" && s.edgeBlur > 0 ? ` / ぼかし ${s.edgeBlur}%` : "";
  const who = custom ? "個別" : "全体";
  return `${who}: ${KIND_TITLE_JA[s.kind]}${dir} / ${s.durationSec.toFixed(2)}秒 / ${EASE_LABEL[s.easing]}${blur}`;
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
        <span className="cell-glyph cell-glyph-kind" aria-label={KIND_LABEL[settings.kind]}>
          {KIND_LABEL[settings.kind]}
        </span>
        {!fade && !cut && (
          <span
            className="cell-glyph cell-glyph-dir"
            aria-label={settings.direction}
          >
            {DIR_ARROW[settings.direction]}
          </span>
        )}
        {custom && (
          <span className="cell-glyph cell-glyph-custom" title="個別設定">
            own
          </span>
        )}
      </div>
      <div className="cell-meta-row cell-meta-secondary">
        <span className="cell-glyph cell-glyph-time">
          {cut ? "cut" : `${settings.durationSec.toFixed(1)}s`}
        </span>
        {!cut && (
          <span className="cell-glyph cell-glyph-ease" aria-label={settings.easing}>
            {EASE_SHORT[settings.easing]}
          </span>
        )}
        {settings.kind === "wipe" && settings.edgeBlur > 0 && (
          <span className="cell-glyph cell-glyph-blur">blur</span>
        )}
      </div>
    </div>
  );
}
