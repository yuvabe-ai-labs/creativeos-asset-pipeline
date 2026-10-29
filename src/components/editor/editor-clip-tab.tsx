"use client";
// A selected clip's own settings (D405): the picture and sound it plays, its quiet stretches.
// Trims are done on the timeline; the quiet stretches fold away (D410).
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useQuietWindows } from "@/hooks/queries/editor";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { pieceSoundFile } from "@/lib/editor/playback";
import { setPicture } from "@/lib/editor/pieces";
import { quietSections } from "@/lib/editor/silence";
import { formatTime, pieceOffsets } from "@/lib/editor/timeline";
import type { Piece, SourceView } from "@/lib/editor/types";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { useEditorUi } from "./editor-ui-context";

export function EditorClipTab({ piece, source }: { piece: Piece; source: SourceView }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const sources = useEditorStore((s) => s.sources);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { switchSound } = useAutoCaptionsContext();
  const { seek, pause } = usePlayback();
  const ui = useEditorUi();
  const offset = pieceOffsets(pieces)[pieces.findIndex((p) => p.id === piece.id)] ?? 0;
  const language = source.language ? dubLanguageLabel(source.language) : null;
  const sound = pieceSoundFile(piece, source);
  const { data, isPending } = useQuietWindows(sound.facts?.audio ? sound.url : null);
  const quiet = data ? quietSections(data, piece.in, piece.out) : [];
  const quietSummary = isPending && sound.facts?.audio ? "Listening…" : quiet.length ? `${quiet.length}` : "None";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Picture</span>
        <EditorChoiceToggle
          label="Picture"
          value={piece.picture}
          disabled={!editable}
          options={[
            { value: "original", label: "Original", available: true },
            { value: "lipSynced", label: "Lip-synced", available: Boolean(source.files.lipSynced) },
          ]}
          onChange={(c) => apply((d) => setPicture(d, piece.id, c, sources))}
        />
        <span className="text-[13px] font-semibold">Sound</span>
        <EditorChoiceToggle
          label="Sound"
          value={piece.sound}
          disabled={!editable}
          options={[
            { value: "original", label: "Original", available: true },
            { value: "dubbed", label: `Dubbed${language ? ` · ${language}` : ""}`, available: Boolean(source.files.dubAudio) },
          ]}
          onChange={(c) => switchSound(piece.id, c)}
        />
        {!source.files.dubAudio && (
          <Button variant="link" size="sm" className="h-auto self-start p-0 text-xs" onClick={() => ui.setInspectorTab("dub")}>
            Dub this clip
          </Button>
        )}
      </div>

      <Accordion className="border-t border-border">
        <AccordionItem value="quiet">
          <AccordionTrigger disabled={quiet.length === 0} className="text-[13px] font-semibold hover:no-underline">
            <span className="flex flex-1 justify-between pr-2">
              Quiet stretches <span className="font-normal text-muted-foreground">{quietSummary}</span>
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
    </div>
  );
}
