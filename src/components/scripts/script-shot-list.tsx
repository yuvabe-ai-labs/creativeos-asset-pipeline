"use client";

import { useId, useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { CastMember, Shot } from "@/lib/scripts/schema";
import { formatRange, groupByBeat, timeShots, type TimedShot } from "@/lib/scripts/timeline";
import { SHOT_GRID, ScriptShotRow, type ShotState } from "./script-shot-row";

const COLUMNS = ["Time", "Visual", "VO", "On-screen text", "On screen"];

export function ScriptShotList({ shots, cast, compact = false, aside, shotState, renderAfter }: {
  shots: Shot[];
  cast: CastMember[];
  /** Stacked rows for a narrow pane (Visualise), with no column header. */
  compact?: boolean;
  /** Drawn beside each compact row (Visualise: the panel status). */
  aside?: (t: TimedShot) => ReactNode;
  /** Each compact row's click target and drawing state (Visualise). */
  shotState?: (t: TimedShot) => ShotState;
  /** Drawn under each row, full width (spec 4: the shot's comments). */
  renderAfter?: (shot: Shot) => ReactNode;
}) {
  const [grouped, setGrouped] = useState(true);
  const switchId = useId();
  const timed = timeShots(shots);
  const row = (t: TimedShot) => (
    <ScriptShotRow
      key={t.shot.id}
      timed={t}
      cast={cast}
      compact={compact}
      aside={aside ? aside(t) : undefined}
      state={shotState?.(t)}
      after={renderAfter?.(t.shot)}
    />
  );

  return (
    <section aria-label="Shots" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-eyebrow">Shots</h2>
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={grouped} onCheckedChange={setGrouped} />
          <Label htmlFor={switchId}>Group by beat</Label>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {!compact && (
          <div className={`hidden gap-3 border-b border-border bg-muted/50 px-4 py-2 md:grid ${SHOT_GRID}`}>
            {COLUMNS.map((c) => <span key={c} className="text-eyebrow">{c}</span>)}
          </div>
        )}
        {grouped ? (
          groupByBeat(timed).map((g, i) => (
            <div key={`${g.beat}-${i}`} className="border-t border-border first:border-t-0">
              {/* Hierarchy from weight and colour, not size: the beat reads as the group's heading. */}
              <div className="flex items-baseline justify-between border-b border-border bg-muted px-4 py-2.5">
                <span className="text-eyebrow font-semibold text-foreground">{g.beat || "No beat"}</span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{formatRange(g.start, g.end)}</span>
              </div>
              <ul>{g.shots.map(row)}</ul>
            </div>
          ))
        ) : (
          <ul>{timed.map(row)}</ul>
        )}
      </div>
    </section>
  );
}
