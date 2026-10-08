import type { Script } from "@/lib/scripts/schema";
import { ScriptContextCard } from "./script-context-card";
import { ScriptCastList } from "./script-cast-list";
import { ScriptShotList } from "./script-shot-list";
import type { ScriptViewSlots } from "./script-view-slots";

/** Spec 1 §4 — the one script view. Read-only here; Generate, Visualise and Client review
 *  (specs 2 to 4) put their work around it rather than drawing the script their own way. It reads
 *  only the doc and the stage, so the client's page can pass a frozen version (spec 4). */
export function ScriptView({
  script,
  avatarFaces,
  slots,
}: {
  script: Pick<Script, "doc" | "stage">;
  avatarFaces: Record<string, string | null>;
  slots?: ScriptViewSlots;
}) {
  return (
    <div className="flex flex-col gap-8">
      <ScriptContextCard doc={script.doc} stage={script.stage} after={slots?.context} />
      <ScriptCastList cast={script.doc.cast} avatarFaces={avatarFaces} renderExtra={slots?.castMember} />
      <ScriptShotList shots={script.doc.shots} cast={script.doc.cast} renderAfter={slots?.shot} />
    </div>
  );
}
