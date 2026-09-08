"use client";

// One-series follower trend. Inline SVG on purpose (D238): a charting dependency
// for a single line would be the heaviest thing on the page.
export function PerformanceChart({
  series,
}: {
  series: { capturedAt: string; followers: number }[];
}) {
  const W = 720;
  const H = 150;
  const PAD = { l: 36, r: 40, t: 12, b: 20 };

  if (series.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        The follower trend appears after a couple of daily snapshots.
      </p>
    );
  }

  const values = series.map((s) => s.followers);
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;
  const x = (i: number) => PAD.l + (i / (series.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const line = series
    .map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s.followers).toFixed(1)}`)
    .join(" ");
  const last = series[series.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full text-primary"
      role="img"
      aria-label={`Follower count, ${series[0].followers} to ${last.followers}`}
    >
      <path
        d={`${line} L${x(series.length - 1)} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`}
        fill="currentColor"
        opacity={0.06}
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(series.length - 1)}
        cy={y(last.followers)}
        r={4}
        fill="currentColor"
        stroke="var(--card)"
        strokeWidth={2}
      />
      <text
        x={x(series.length - 1) + 8}
        y={y(last.followers) + 4}
        className="fill-current text-[11px] font-semibold tabular-nums"
      >
        {last.followers}
      </text>
    </svg>
  );
}
