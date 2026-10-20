// The Rough Cut Editor's data (D387–D393). The edit is one JSON document per Editor node, saved
// in `editor_edits` (D390). Times in it are SECONDS of a piece's source; frames are only ever
// computed by sequence-plan.ts, on export.
import * as z from "zod";
import { CAPTION_FONT_KEYS, type CaptionFontKey } from "./caption-fonts";

export const REEL_SHAPES = ["9:16", "16:9"] as const;
export type ReelShape = (typeof REEL_SHAPES)[number];

export type PictureChoice = "original" | "lipSynced";
export type SoundChoice = "original" | "dubbed";

/** A connected source as the edit last saw it. A new edge id means it was reconnected. */
export type EditSource = { nodeId: string; edgeId: string; versionId: string };

/** in/out: SOURCE seconds, out exclusive, snapped to the picture file's frame grid. */
export type Piece = {
  id: string;
  sourceNodeId: string;
  in: number;
  out: number;
  picture: PictureChoice;
  sound: SoundChoice;
};

/** at: SOURCE seconds in its piece's source; size: px on a 1080 short edge; x/y: centre, 0–1. */
export type Caption = {
  id: string;
  pieceId: string;
  at: number;
  duration: number;
  text: string;
  x: number;
  y: number;
  font: CaptionFontKey;
  size: number;
  color: string;
};

export type EditDoc = {
  v: 1;
  shape: ReelShape;
  sources: EditSource[];
  pieces: Piece[];
  captions: Caption[];
};

const seconds = z.number().finite().min(0);
const unit = z.number().finite().min(0).max(1);

const PieceSchema = z
  .object({
    id: z.string().min(1),
    sourceNodeId: z.string().min(1),
    in: seconds,
    out: seconds,
    picture: z.enum(["original", "lipSynced"]),
    sound: z.enum(["original", "dubbed"]),
  })
  .refine((p) => p.out > p.in, { message: "A piece must end after it starts." });

const CaptionSchema = z.object({
  id: z.string().min(1),
  pieceId: z.string().min(1),
  at: seconds,
  duration: z.number().finite().min(0.2),
  text: z.string().max(500),
  x: unit,
  y: unit,
  font: z.enum(CAPTION_FONT_KEYS as [CaptionFontKey, ...CaptionFontKey[]]),
  size: z.number().finite().min(8).max(400),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export const EditDocSchema: z.ZodType<EditDoc> = z.object({
  v: z.literal(1),
  shape: z.enum(REEL_SHAPES),
  sources: z.array(z.object({ nodeId: z.string().min(1), edgeId: z.string().min(1), versionId: z.string().min(1) })).max(500),
  pieces: z.array(PieceSchema).max(500),
  captions: z.array(CaptionSchema).max(1000),
});

/** What the server measured in a file's header (D391). */
export type MediaFacts = {
  durationSeconds: number;
  video: { fps: number; frames: number; width: number; height: number } | null;
  audio: { channels: number; sampleRate: number } | null;
};

/** facts null: the file couldn't be read. */
export type MediaFile = { url: string; facts: MediaFacts | null };

export type SourceKind = "video-gen" | "dubbing";

export type SourceView = {
  nodeId: string;
  edgeId: string;
  kind: SourceKind;
  handle: string;
  title: string;
  versionId: string;
  shotOrder: number | null;
  shotLabel: string | null;
  language: string | null;
  files: { original: MediaFile; lipSynced: MediaFile | null; dubAudio: MediaFile | null };
};

export type EditorNoticeKind = "removed" | "trimmed" | "picture-fallback" | "sound-fallback" | "unreadable" | "no-take";
export type EditorNotice = { kind: EditorNoticeKind; sourceNodeId: string; message: string };

export type EditorState = {
  canvasId: string;
  editorNodeId: string;
  editorTitle: string;
  doc: EditDoc;
  /** True when reconciling changed the saved edit, so the editor saves it once on open. */
  changed: boolean;
  notices: EditorNotice[];
  sources: SourceView[];
};

/** Why a node can't generate (D389): it feeds the Editor, or it feeds a dub that does. */
export type GenerationLock = "editor" | "dub";
