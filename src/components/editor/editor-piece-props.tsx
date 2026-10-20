"use client";
// A selected piece's properties (mockups "Editor, clip selected" and "…dubbed clip selected").
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { resolvePieceMedia } from "@/lib/editor/playback";
import { setPicture, setSound } from "@/lib/editor/pieces";
import { formatTime, pieceOffsets } from "@/lib/editor/timeline";
import type { Piece, SourceView } from "@/lib/editor/types";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { EditorQuietSections } from "./editor-quiet-sections";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

function TrimBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm tabular-nums">{formatTime(value)}</div>
    </div>
  );
}

export function EditorPieceProps({ piece, source }: { piece: Piece; source: SourceView }) {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { seek } = usePlayback();

  const index = doc.pieces.findIndex((p) => p.id === piece.id);
  const siblings = doc.pieces.filter((p) => p.sourceNodeId === piece.sourceNodeId);
  const nth = siblings.findIndex((p) => p.id === piece.id);
  const title = `${index + 1} · ${source.handle}${siblings.length > 1 ? `, ${ORDINALS[nth] ?? `#${nth + 1}`} piece` : ""}`;
  const video = (piece.picture === "lipSynced" && source.files.lipSynced ? source.files.lipSynced : source.files.original).facts?.video;
  const language = source.language ? dubLanguageLabel(source.language) : null;
  const dubbing = source.kind === "dubbing";
  const meta = dubbing
    ? `Dubbing node · current version${language ? ` · ${language}` : ""}`
    : `Current version${video ? ` · ${Math.round(video.fps * 100) / 100} fps · ${video.width}×${video.height}` : ""}`;
  const offset = pieceOffsets(doc.pieces)[index] ?? 0;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <span className="text-eyebrow text-muted-foreground">Clip</span>
        <span className="font-display text-lg font-semibold">{title}</span>
        <span className="text-[13px] text-muted-foreground">{meta}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Trim</span>
        <div className="grid grid-cols-3 gap-2">
          <TrimBox label="In" value={piece.in} />
          <TrimBox label="Out" value={piece.out} />
          <TrimBox label="Length" value={piece.out - piece.in} />
        </div>
        <span className="text-xs text-muted-foreground">Drag the clip&apos;s edges on the timeline to trim.</span>
      </div>

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
        <span className="text-xs text-muted-foreground">
          {source.files.lipSynced ? `Mouth matched to the ${language ?? ""} dub.`.replace("  ", " ") : "No lip-sync for this clip. Lip-sync comes from a Dubbing node."}
        </span>
      </div>

      {dubbing && (
        <div className="flex flex-col gap-2">
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
          <span className="text-xs text-muted-foreground">
            In Premiere the dub sits on its own tracks. The original sound goes too, switched off, so it can be brought back.
          </span>
        </div>
      )}

      <EditorQuietSections
        piece={piece}
        soundUrl={resolvePieceMedia(piece, source).soundUrl ?? source.files.original.url}
        onSeekSource={(s) => seek(offset + Math.max(0, s - piece.in))}
      />

      {dubbing && (
        <span className="text-xs text-muted-foreground">
          Switch this clip&apos;s version on the canvas and the reel follows. Your trims stay if they fit the new version.
        </span>
      )}
    </div>
  );
}
