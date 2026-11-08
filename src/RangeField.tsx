import type { CSSProperties } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onChangeEnd?: () => void;
  disabled?: boolean;
  unit?: string;
  accent?: string;
  format?: (value: number) => string;
};

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onChangeEnd,
  disabled,
  unit = "",
  accent = "#4d9aff",
  format,
}: Props) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const shown = format ? format(value) : `${value}${unit}`;
  const style = {
    "--range-pct": `${pct}%`,
    "--range-accent": accent,
  } as CSSProperties;

  return (
    <label
      className={`range-field${disabled ? " range-field-disabled" : ""}`}
      style={style}
    >
      <span className="range-field-head">
        <span className="range-field-label">{label}</span>
        <span className="range-val">{shown}</span>
      </span>
      <input
        type="range"
        className="range-cool"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onChangeEnd?.()}
        onBlur={() => onChangeEnd?.()}
      />
    </label>
  );
}
