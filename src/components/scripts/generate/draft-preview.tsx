import { Loader2 } from "lucide-react";
import { ScriptView } from "@/components/scripts/script-view";
import { previewDoc, type PartialDraft } from "@/lib/scripts/copilot/partial-draft";

/** The first draft as it streams in (D337, refined): the same script view, read-only, filling shot
 *  by shot. Replaced by the saved, editable script when the copilot finishes. */
export function DraftPreview({ draft }: { draft: PartialDraft }) {
  const doc = previewDoc(draft);
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden />
        Writing the first draft: {doc.shots.length} shot{doc.shots.length === 1 ? "" : "s"} so far. You can edit it once it&apos;s done.
      </div>
      <div className="opacity-90">
        <ScriptView
          script={{ stage: "generate", doc }}
          avatarFaces={{}}
        />
      </div>
    </div>
  );
}
