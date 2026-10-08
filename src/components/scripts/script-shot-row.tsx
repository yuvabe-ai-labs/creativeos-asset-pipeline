import type { CastMember } from "@/lib/scripts/schema";
import { formatRange, type TimedShot } from "@/lib/scripts/timeline";
import { useScriptEdit } from "./script-edit-context";
import { ScriptText } from "./script-text";

/** Shared with the column header in ScriptShotList so the two always line up. */
export const SHOT_GRID = "md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]";

// Rendered inside the client ScriptShotList, so it may read the edit context (spec 2).
export function ScriptShotRow({ timed, cast }: { timed: TimedShot; cast: CastMember[] }) {
  const { shot } = timed;
  const editing = useScriptEdit() !== null;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  return (
    <li className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 ${SHOT_GRID}`}>
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
        {editing && (
          <>
            <ScriptText path={`shots.${shot.id}.beat`} value={shot.beat} multiline={false} placeholder="Beat" className="text-xs uppercase tracking-wide" />
            <span className="text-xs"><ScriptText path={`shots.${shot.id}.lengthSeconds`} value={String(shot.lengthSeconds)} multiline={false} />s</span>
          </>
        )}
      </span>
      <span className="text-sm"><ScriptText path={`shots.${shot.id}.visual`} value={shot.visual} /></span>
      <span className="text-sm text-muted-foreground"><ScriptText path={`shots.${shot.id}.vo`} value={shot.vo} /></span>
      <span className="text-sm font-medium"><ScriptText path={`shots.${shot.id}.onScreenText`} value={shot.onScreenText} /></span>
      <span className="text-xs text-muted-foreground">{names.length > 0 ? names.join(", ") : "Nobody (B-roll)"}</span>
    </li>
  );
}
