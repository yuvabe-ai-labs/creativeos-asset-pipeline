"use client";

import { useScriptEdit } from "@/components/scripts/script-edit-context";
import { ScriptText } from "@/components/scripts/script-text";
import { spokenLine } from "@/lib/scripts/utils";

// D465 — a storyboard panel's shot, written under its frame as on a classic storyboard sheet:
// the number, beat and time, then the action, then the spoken line. Shared by the team's tile
// and the client's. D489 — with `shotId` under a ScriptEditProvider (the team's board at
// Visualise) the beat, action and line are typed in place; otherwise they are plain text.
export function PanelTileCaption({ shotId, label, beat, time, visual, vo }: {
  shotId?: string;
  label: string;
  beat: string;
  time: string;
  visual: string;
  vo: string;
}) {
  const editing = useScriptEdit() !== null && shotId !== undefined;
  const field = (name: string) => `shots.${shotId}.${name}`;
  return (
    <figcaption className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-medium text-foreground">{label}</span>
          {editing
            ? <span className="min-w-0 text-eyebrow"><ScriptText path={field("beat")} value={beat} multiline={false} placeholder="Add a beat" /></span>
            : beat && <span className="truncate text-eyebrow">{beat}</span>}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{time}</span>
      </span>
      {/* Written in full, never clamped: the shot and its line are what the reviewer is here to
          read, and an ellipsis hid the half they needed. */}
      <span className="text-sm text-foreground">
        {editing ? <ScriptText path={field("visual")} value={visual} /> : visual}
      </span>
      {editing ? (
        <span className="text-sm text-muted-foreground">
          {/* The line as typed: quotes added here would double any the line already has. */}
          <ScriptText path={field("vo")} value={vo} placeholder="Add a spoken line" />
        </span>
      ) : (
        vo && <span className="text-sm text-muted-foreground">{spokenLine(vo)}</span>
      )}
    </figcaption>
  );
}
