import type { Script } from "@/lib/scripts/schema";
import { ScriptContextCard } from "./script-context-card";
import { ScriptCastList } from "./script-cast-list";
import { ScriptShotList } from "./script-shot-list";

/** Spec 1 §4 — the one script view. Read-only here; Generate, Visualise and Client review
 *  (specs 2 to 4) put their work around it rather than drawing the script their own way. */
export function ScriptView({ script, avatarFaces }: { script: Script; avatarFaces: Record<string, string | null> }) {
  return (
    <div className="flex flex-col gap-8">
      <ScriptContextCard doc={script.doc} stage={script.stage} />
      <ScriptCastList cast={script.doc.cast} avatarFaces={avatarFaces} />
      <ScriptShotList shots={script.doc.shots} cast={script.doc.cast} />
    </div>
  );
}
