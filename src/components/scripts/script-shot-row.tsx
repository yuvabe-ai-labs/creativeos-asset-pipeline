import type { ReactNode } from "react";
import { shotAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";
import { formatRange, type TimedShot } from "@/lib/scripts/timeline";

/** Shared with the column header in ScriptShotList so the two always line up. */
export const SHOT_GRID = "md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]";

export function ScriptShotRow({ timed, cast, after }: { timed: TimedShot; cast: CastMember[]; after?: ReactNode }) {
  const { shot } = timed;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  return (
    <li id={shotAnchor(shot.id)} className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 has-[[data-part-commented]]:bg-client/5 ${SHOT_GRID}`}>
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
      </span>
      <span className="text-sm">{shot.visual}</span>
      <span className="text-sm text-muted-foreground">{shot.vo}</span>
      <span className="text-sm font-medium">{shot.onScreenText}</span>
      <span className="text-xs text-muted-foreground">{names.length > 0 ? names.join(", ") : "Nobody (B-roll)"}</span>
      {after ? <div className="md:col-span-5">{after}</div> : null}
    </li>
  );
}
