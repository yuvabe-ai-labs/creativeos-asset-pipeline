"use client";

import { useState } from "react";

// One-series follower trend. Inline SVG on purpose (D238): a charting dependency for a
// single line would be the heaviest thing on the page.
const W = 1000;
const H = 190;
const PAD = { l: 42, r: 48, t: 16, b: 26 };

/** Three labelled gridlines — low, middle, high — from the series' own range, so every
 *  label names a value the line actually reaches. */
function ticks(lo: number, hi: number): number[] {
  const mid = Math.round((lo + hi) / 2);
  return [...new Set([Math.ceil(lo), mid, Math.floor(hi)])];
}

export function PerformanceChart({
  series,
}: {
  series: { capturedAt: string; followers: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (series.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        The follower trend appears after a couple of daily snapshots.
      </p>
    );
  }

  const values = series.map((s) => s.followers);
  // Pad the range so a flat line sits mid-card instead of along an edge.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 2);
  const lo = min - span * 0.25;
  const hi = max + span * 0.25;

  const x = (i: number) => PAD.l + (i / (series.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const line = series
    .map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s.followers).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`;
  const last = series[series.length - 1];
  const active = hover !== null ? series[hover] : null;

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full text-primary"
        role="img"
        aria-label={`Follower count from ${series[0].followers} on ${fmt(series[0].capturedAt)} to ${last.followers} on ${fmt(last.capturedAt)}`}
        // Pointer-driven readout only where there is a real pointer — touch would
        // otherwise leave the tooltip stuck after the finger lifts.
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const ratio = (px - PAD.l) / (W - PAD.l - PAD.r);
          const i = Math.round(ratio * (series.length - 1));
          setHover(Math.max(0, Math.min(series.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks(lo, hi).map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
            <text
              x={PAD.l - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={11}
              className="fill-muted-foreground tabular-nums"
            >
              {v}
            </text>
          </g>
        ))}

        <path d={area} fill="currentColor" opacity={0.06} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 3"
            className="text-muted-foreground"
          />
        )}

        <circle
          cx={x(hover ?? series.length - 1)}
          cy={y((active ?? last).followers)}
          r={4.5}
          fill="currentColor"
          stroke="var(--card)"
          strokeWidth={2}
        />

        {!active && (
          <text
            x={x(series.length - 1) + 9}
            y={y(last.followers) + 4}
            fontSize={12}
            fontWeight={600}
            className="fill-current tabular-nums"
          >
            {last.followers}
          </text>
        )}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-2.5 py-1 text-xs shadow-card tabular-nums"
          style={{
            left: `${(x(hover ?? 0) / W) * 100}%`,
            top: `${(y(active.followers) / H) * 100}%`,
          }}
        >
          <span className="font-semibold">{active.followers}</span>{" "}
          <span className="text-muted-foreground">{fmt(active.capturedAt)}</span>
        </div>
      )}
    </div>
  );
}
