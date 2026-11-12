"use client";
// The Lip sync task for a clip (D406–D408): locked until the clip has a dub, then matches the
// presenter's mouth to it, and chooses which picture the clip shows.
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lipSyncCredits } from "@/lib/dubbing/cost";
import { setPicture } from "@/lib/editor/pieces";
import type { Piece, SourceView } from "@/lib/editor/types";
import { ClipDubNotices, useClipDub } from "./editor-dub-task";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorStore } from "./editor-store-provider";
import { useEditorUi } from "./editor-ui-context";

export function EditorLipTask({
  piece,
  source,
}: {
  piece: Piece;
  source: SourceView;
}) {
  const {
    dub,
    editable,
    running,
    hasDub,
    hasLip,
    seconds,
    lang,
    note,
    error,
    why,
  } = useClipDub(piece, source);
  const sources = useEditorStore((s) => s.sources);
  const apply = useEditorStore((s) => s.apply);
  const ui = useEditorUi();

  return (
    <div className="flex flex-col gap-3">
      <ClipDubNotices note={note} error={error} />
      {running === "lipsync" ? (
        <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
          Matching the mouth to the {lang ?? ""} dub.
        </p>
      ) : (
        <>
          <p className="m-0 text-xs text-muted-foreground">
            {hasDub
              ? `Matches the presenter's mouth to the ${lang ?? ""} dub.`
              : "Dub the clip first. Lip sync matches the mouth to the dub."}
          </p>
          {hasDub ? (
            <Button
              size="sm"
              variant={hasLip ? "outline" : "default"}
              disabled={Boolean(why)}
              title={why}
              onClick={() => void dub.startLipSync(source.nodeId)}
              className="self-start"
            >
              {hasLip ? "Lip sync again" : "Lip sync"}
              <span className="font-normal opacity-75">
                · {lipSyncCredits(seconds)} credits
              </span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => ui.openTask("dub", piece.id)}
            >
              Dub this clip first
            </Button>
          )}
        </>
      )}

      {hasLip && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[13px] font-semibold">Picture</span>
          <EditorChoiceToggle
            label="Picture"
            value={piece.picture}
            disabled={!editable}
            options={[
              { value: "original", label: "Original picture", available: true },
              { value: "lipSynced", label: "Lip-synced", available: true },
            ]}
            onChange={(c) => apply((d) => setPicture(d, piece.id, c, sources))}
          />
          <span className="text-xs text-muted-foreground">
            In Premiere, the one not chosen stays in the sequence on its own
            track, switched off.
          </span>
        </div>
      )}
    </div>
  );
}
