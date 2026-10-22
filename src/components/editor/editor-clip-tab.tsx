"use client";
// A selected clip's own settings (D405): trims, the picture and sound it plays, its quiet stretches.
import { Button } from "@/components/ui/button";
import { useQuietWindows } from "@/hooks/queries/editor";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { pieceSoundFile } from "@/lib/editor/playback";
import { setPicture, setSound } from "@/lib/editor/pieces";
import { quietSections } from "@/lib/editor/silence";
import { formatTime, pieceOffsets } from "@/lib/editor/timeline";
import type { Piece, SourceView } from "@/lib/editor/types";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { useEditorUi } from "./editor-ui-context";

function TrimBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">{formatTime(value)}</div>
    </div>
  );
}

export function EditorClipTab({ piece, source }: { piece: Piece; source: SourceView }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const sources = useEditorStore((s) => s.sources);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { seek, pause } = usePlayback();
  const ui = useEditorUi();
  const offset = pieceOffsets(pieces)[pieces.findIndex((p) => p.id === piece.id)] ?? 0;
  const language = source.language ? dubLanguageLabel(source.language) : null;
  const sound = pieceSoundFile(piece, source);
  const { data, isPending } = useQuietWindows(sound.facts?.audio ? sound.url : null);
  const quiet = data ? quietSections(data, piece.in, piece.out) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <TrimBox label="In" value={piece.in} />
          <TrimBox label="Out" value={piece.out} />
          <TrimBox label="Length" value={piece.out - piece.in} />
        </div>
        <span className="text-xs text-muted-foreground">Drag the clip&apos;s edges on the timeline to trim. It snaps to the playhead and to other clips.</span>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
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
          onChange={(c) => apply((d) => setSound(d, piece.id, c, sources))}
        />
        {!source.files.dubAudio && (
          <Button variant="link" size="sm" className="h-auto self-start p-0 text-xs" onClick={() => ui.setInspectorTab("dub")}>
            Dub this clip
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="flex justify-between text-[13px] font-semibold">
          Quiet stretches <span className="font-normal text-muted-foreground">{isPending && sound.facts?.audio ? "Listening…" : quiet.length ? "shaded on the Audio lane" : "none"}</span>
        </span>
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
        <span className="text-xs text-muted-foreground">Shown for review. Nothing is cut automatically. Right-click one on the Audio lane to split around it.</span>
      </div>
    </div>
  );
}
