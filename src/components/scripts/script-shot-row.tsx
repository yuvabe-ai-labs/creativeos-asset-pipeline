import type { ReactNode } from "react";
import type { CastMember } from "@/lib/scripts/schema";
import { formatRange, type TimedShot } from "@/lib/scripts/timeline";

/** Shared with the column header in ScriptShotList so the two always line up. */
export const SHOT_GRID = "md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]";

export function ScriptShotRow({ timed, cast, compact = false, aside }: {
  timed: TimedShot;
  cast: CastMember[];
  /** Stacked, for a narrow pane (Visualise). */
  compact?: boolean;
  /** Beside a compact row (Visualise: the panel status). */
  aside?: ReactNode;
}) {
  const { shot } = timed;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  const who = names.length > 0 ? names.join(", ") : "Nobody (B-roll)";
  if (compact) {
    return (
      <li className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
        <span className="flex w-12 shrink-0 flex-col text-sm tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">S{timed.index + 1}</span>
          {formatRange(timed.start, timed.end)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm">{shot.visual}</span>
          {shot.vo && <span className="text-sm text-muted-foreground">{shot.vo}</span>}
          {shot.onScreenText && <span className="text-sm font-medium">{shot.onScreenText}</span>}
          <span className="text-xs text-muted-foreground">{who}</span>
        </div>
        {aside !== undefined && <div className="shrink-0">{aside}</div>}
      </li>
    );
  }
  return (
    <li className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 ${SHOT_GRID}`}>
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
      </span>
      <span className="text-sm">{shot.visual}</span>
      <span className="text-sm text-muted-foreground">{shot.vo}</span>
      <span className="text-sm font-medium">{shot.onScreenText}</span>
      <span className="text-xs text-muted-foreground">{who}</span>
    </li>
  );
}
