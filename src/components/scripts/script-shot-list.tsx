"use client";

import { useId, useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { CastMember, Shot } from "@/lib/scripts/schema";
import { formatRange, groupByBeat, timeShots } from "@/lib/scripts/timeline";
import { SHOT_GRID, ScriptShotRow } from "./script-shot-row";

const COLUMNS = ["Time", "Visual", "VO", "On-screen text", "On screen"];

export function ScriptShotList({
  shots,
  cast,
  renderAfter,
}: {
  shots: Shot[];
  cast: CastMember[];
  renderAfter?: (shot: Shot) => ReactNode;
}) {
  const [grouped, setGrouped] = useState(true);
  const switchId = useId();
  const timed = timeShots(shots);

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
        <div className={`hidden gap-3 border-b border-border bg-muted/50 px-4 py-2 md:grid ${SHOT_GRID}`}>
          {COLUMNS.map((c) => <span key={c} className="text-eyebrow">{c}</span>)}
        </div>
        {grouped ? (
          groupByBeat(timed).map((g, i) => (
            <div key={`${g.beat}-${i}`}>
              <div className="flex justify-between border-b border-border bg-muted/30 px-4 py-1.5">
                <span className="text-eyebrow">{g.beat || "No beat"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{formatRange(g.start, g.end)}</span>
              </div>
              <ul>{g.shots.map((t) => <ScriptShotRow key={t.shot.id} timed={t} cast={cast} after={renderAfter?.(t.shot)} />)}</ul>
            </div>
          ))
        ) : (
          <ul>{timed.map((t) => <ScriptShotRow key={t.shot.id} timed={t} cast={cast} after={renderAfter?.(t.shot)} />)}</ul>
        )}
      </div>
    </section>
  );
}
