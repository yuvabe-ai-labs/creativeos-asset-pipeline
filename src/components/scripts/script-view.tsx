import type { ReactNode } from "react";
import type { Script } from "@/lib/scripts/schema";
import type { TimedShot } from "@/lib/scripts/timeline";
import { ScriptContextCard } from "./script-context-card";
import { ScriptCastList } from "./script-cast-list";
import { ScriptShotList } from "./script-shot-list";
import type { ShotState } from "./script-shot-row";

/** Spec 1 §4 — the one script view. Read-only here; Generate, Visualise and Client review
 *  (specs 2 to 4) put their work around it rather than drawing the script their own way.
 *  The optional props are how they do it; left out, the view is exactly spec 1's. */
export function ScriptView({ script, avatarFaces, compact = false, cast, shotAside, shotState }: {
  script: Script;
  avatarFaces: Record<string, string | null>;
  /** Stacked shot rows for a narrow pane (Visualise's left pane), instead of the table. */
  compact?: boolean;
  /** Replaces the read-only cast list; `null` leaves it out (Visualise shows the cast in its
   *  Visuals pane). */
  cast?: ReactNode | null;
  /** Drawn beside each shot (Visualise: the shot's panel status). */
  shotAside?: (timed: TimedShot) => ReactNode;
  /** Each shot's click target and drawing state (Visualise: open its panel; shimmer while drawing). */
  shotState?: (timed: TimedShot) => ShotState;
}) {
  return (
    <div className={compact ? "flex flex-col gap-5" : "flex flex-col gap-8"}>
      <ScriptContextCard doc={script.doc} stage={script.stage} />
      {cast === undefined ? <ScriptCastList cast={script.doc.cast} avatarFaces={avatarFaces} /> : cast}
      <ScriptShotList shots={script.doc.shots} cast={script.doc.cast} compact={compact} aside={shotAside} shotState={shotState} />
    </div>
  );
}
