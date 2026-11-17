"use client";
// A selected clip's quiet stretches (D410), folded away under the Inspector's task list. Picture and
// sound moved into the Lip sync and Dub tasks (task-menu design).
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useQuietWindows } from "@/hooks/queries/editor";
import { pieceSoundFile } from "@/lib/editor/playback";
import { quietSections } from "@/lib/editor/silence";
import { formatTime, pieceOffsets } from "@/lib/editor/timeline";
import type { Piece, SourceView } from "@/lib/editor/types";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

export function EditorClipQuiet({ piece, source }: { piece: Piece; source: SourceView }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const { seek, pause } = usePlayback();
  const offset = pieceOffsets(pieces)[pieces.findIndex((p) => p.id === piece.id)] ?? 0;
  const sound = pieceSoundFile(piece, source);
  const { data, isPending } = useQuietWindows(sound.facts?.audio ? sound.url : null);
  const quiet = data ? quietSections(data, piece.in, piece.out) : [];
  const summary = isPending && sound.facts?.audio ? "Listening…" : quiet.length ? `${quiet.length}` : "None";

  return (
    <Accordion className="border-t border-border">
      <AccordionItem value="quiet">
        <AccordionTrigger disabled={quiet.length === 0} className="text-[13px] font-semibold hover:no-underline">
          <span className="flex flex-1 justify-between pr-2">
            Quiet stretches <span className="font-normal text-muted-foreground">{summary}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {quiet.map(([a, b]) => (
              <Button
                key={a}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs tabular-nums"
                onClick={() => {
                  pause();
                  seek(offset + (a - piece.in) + 0.001);
                }}
              >
                {formatTime(a - piece.in)} – {formatTime(b - piece.in)}
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Shaded on the Audio lane. Nothing is cut automatically. Right-click one there to split around it.</span>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
