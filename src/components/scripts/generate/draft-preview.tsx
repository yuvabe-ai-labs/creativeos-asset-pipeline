import { Loader2 } from "lucide-react";
import { ScriptView } from "@/components/scripts/script-view";
import { previewDoc, type PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import { DraftCastSkeleton } from "./draft-cast-skeleton";
import { DraftSkeleton } from "./draft-skeleton";

/** The first draft as it streams in (D337, refined): the same script view, read-only, filling shot
 *  by shot. Replaced by the saved, editable script when the copilot finishes. Until its first part
 *  arrives, the script's skeleton; then placeholder rows below the last shot while more are written (D366). */
export function DraftPreview({ draft }: { draft: PartialDraft }) {
  const doc = previewDoc(draft);
  const started = Object.keys(draft.header).length > 0 || draft.shots.length > 0;
  const shots = doc.shots.length;
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />
        {shots === 0
          ? "Writing the first draft. The shots appear here as they're written."
          : `Writing the first draft: ${shots} shot${shots === 1 ? "" : "s"} so far. You can edit it once it's done.`}
      </div>
      {started ? (
        <div className="opacity-90">
          <ScriptView
            script={{ stage: "generate", doc }}
            avatarFaces={{}}
            cast={doc.cast.length > 0 ? undefined : <DraftCastSkeleton />}
            pendingShots={shots === 0 ? 5 : 2}
          />
        </div>
      ) : (
        <DraftSkeleton />
      )}
    </div>
  );
}
