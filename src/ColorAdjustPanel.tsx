import { useEffect, useRef, useState } from "react";
import type { ColorAdjustSettings } from "./types";
import { defaultColorAdjust } from "./colorAdjust";
import { RangeField } from "./RangeField";

type Props = {
  value: ColorAdjustSettings;
  onLiveChange: (next: ColorAdjustSettings) => void;
  onCommit: (next: ColorAdjustSettings) => void;
};

const SLIDERS: Array<{
  key: keyof ColorAdjustSettings;
  label: string;
  accent: string;
}> = [
  { key: "brightness", label: "明るさ", accent: "#f0d060" },
  { key: "contrast", label: "コントラスト", accent: "#e0e4ef" },
  { key: "saturation", label: "彩度", accent: "#6fe0a8" },
  { key: "red", label: "R", accent: "#ff6b6b" },
  { key: "green", label: "G", accent: "#6bff8a" },
  { key: "blue", label: "B", accent: "#6babff" },
];

export function ColorAdjustPanel({ value, onLiveChange, onCommit }: Props) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  useEffect(() => {
    setDraft(value);
    draftRef.current = value;
  }, [value]);

  const patch = (next: ColorAdjustSettings) => {
    draftRef.current = next;
    setDraft(next);
    onLiveChange(next);
  };
  const reset = () => {
    const next = defaultColorAdjust();
    patch(next);
    onCommit(next);
  };

  return (
    <section className="color-adjust-panel" aria-label="色調整">
      <header className="color-adjust-head">
        <h2 className="color-adjust-title">色調整</h2>
        <span className="color-adjust-hint">出力に反映</span>
        <button type="button" className="btn-ghost btn-compact" onClick={reset}>
          リセット
        </button>
      </header>
      <div className="color-adjust-grid">
        {SLIDERS.map(({ key, label, accent }) => (
          <RangeField
            key={key}
            label={label}
            value={draft[key]}
            min={0}
            max={200}
            step={1}
            unit="%"
            accent={accent}
            onChange={(n) => patch({ ...draft, [key]: n })}
            onChangeEnd={() => onCommit(draftRef.current)}
          />
        ))}
      </div>
    </section>
  );
}
