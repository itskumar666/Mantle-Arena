"use client";

/**
 * Lightweight SVG line chart for the sandbox — equity curves over time.
 * No chart library: keeps the bundle small and the styling fully ours.
 *
 * Renders one polyline per series, auto-scaled to the combined min/max.
 */

export interface ChartSeries {
  label: string;
  /** Hex or rgb color. */
  color: string;
  values: number[];
  /** Thicker + on top when true (the user's bot). */
  emphasized?: boolean;
}

export function LineChart({
  series,
  height = 240,
  baseline,
}: {
  series: ChartSeries[];
  height?: number;
  /** Optional horizontal reference line (e.g. starting balance). */
  baseline?: number;
}) {
  const width = 640;
  const padX = 8;
  const padY = 12;

  const all = series.flatMap((s) => s.values);
  if (all.length === 0) return <div className="h-[240px]" />;

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (baseline !== undefined) {
    min = Math.min(min, baseline);
    max = Math.max(max, baseline);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;

  const maxLen = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => padX + (i / Math.max(1, maxLen - 1)) * (width - 2 * padX);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (height - 2 * padY);

  const toPath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  // Draw emphasized series last so they sit on top.
  const ordered = [...series].sort((a, b) => Number(a.emphasized) - Number(b.emphasized));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {baseline !== undefined && (
        <line
          x1={padX}
          x2={width - padX}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      )}
      {ordered.map((s) => (
        <polyline
          key={s.label}
          points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={s.emphasized ? 2.5 : 1.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={s.emphasized ? 1 : 0.55}
        />
      ))}
    </svg>
  );
}
