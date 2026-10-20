"use client";
// The time ruler above the lanes (mockup: a tick each second, labelled every other). Click or
// drag on it to scrub. Pointer handling ported from the rough-cut spike.

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const MIN_TICK_PX = 32;

const label = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function EditorTimelineRuler({ time, total, scale, width, onScrubStart, onScrub }: {
  time: number;
  total: number;
  scale: number;
  width: number;
  onScrubStart(): void;
  onScrub(t: number): void;
}) {
  const step = TICK_STEPS.find((s) => s * scale >= MIN_TICK_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  // Ticks run the full width, not just the cut, so the ruler reads as a fixed scale.
  const ticks = Array.from({ length: Math.floor(width / scale / step) + 1 }, (_, i) => i * step);
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(total, Math.max(0, (e.clientX - rect.left) / scale));
  };
  return (
    <div
      role="slider"
      aria-label="Scrub timeline"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={time}
      tabIndex={-1}
      style={{ width }}
      className="relative h-[22px] shrink-0 cursor-col-resize select-none border-b border-border"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrubStart();
        onScrub(at(e));
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onScrub(at(e));
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
    >
      {ticks.map((t, i) => (
        <span
          key={t}
          className={i % 2 === 0 ? "absolute top-0 h-full border-l border-border" : "absolute top-0 h-full border-l border-border/50"}
          style={{ left: t * scale }}
        >
          {i % 2 === 0 && <span className="pl-[3px] text-[10px] tabular-nums text-muted-foreground">{label(t)}</span>}
        </span>
      ))}
    </div>
  );
}
