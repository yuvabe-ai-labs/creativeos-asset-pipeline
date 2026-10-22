// The Rough Cut Editor's data (D388–D394). The edit is one JSON document per Editor node, saved
// in `editor_edits` (D391). Times in it are SECONDS of a piece's source; frames are only ever
// computed by sequence-plan.ts, on export.
import * as z from "zod";
import { CAPTION_FONT_KEYS, type CaptionFontKey } from "./caption-fonts";
import { CaptionStyleSchema, DEFAULT_CAPTION_STYLE, MAX_SIZE, MIN_SIZE, type CaptionStyle } from "./caption-style";

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

/** A word's time inside its caption's piece, in SOURCE seconds like Caption.at (D397). */
export type CaptionWord = { text: string; at: number; duration: number };

/** at: SOURCE seconds in its piece's source. The look is the reel's (D396). */
export type Caption = {
  id: string;
  pieceId: string;
  at: number;
  duration: number;
  text: string;
  /** Present for auto captions, and once a line is retimed or split (D397). */
  words?: CaptionWord[];
  /** Written by Auto captions (D399). */
  auto?: true;
  /** Changed by the user since; Auto captions never rewrites it (D399). */
  edited?: true;
  /** The sound URL its words came from (D401). */
  from?: string;
};

export type EditDoc = {
  v: 2;
  shape: ReelShape;
  sources: EditSource[];
  pieces: Piece[];
  captions: Caption[];
  captionStyle: CaptionStyle;
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

const WordSchema = z.object({ text: z.string().min(1).max(100), at: seconds, duration: z.number().finite().min(0) });

const CaptionSchema = z.object({
  id: z.string().min(1),
  pieceId: z.string().min(1),
  at: seconds,
  duration: z.number().finite().min(0.2),
  text: z.string().max(500),
  words: z.array(WordSchema).max(200).optional(),
  auto: z.literal(true).optional(),
  edited: z.literal(true).optional(),
  from: z.string().max(2048).optional(),
});

const docBase = {
  shape: z.enum(REEL_SHAPES),
  sources: z.array(z.object({ nodeId: z.string().min(1), edgeId: z.string().min(1), versionId: z.string().min(1) })).max(500),
  pieces: z.array(PieceSchema).max(500),
};

const V2Schema = z.object({ v: z.literal(2), ...docBase, captions: z.array(CaptionSchema).max(1000), captionStyle: CaptionStyleSchema });

// v1 (before D396): each caption carried its own look. The first caption's look becomes the reel's.
const V1CaptionSchema = CaptionSchema.extend({
  x: unit,
  y: unit,
  font: z.enum(CAPTION_FONT_KEYS as [CaptionFontKey, ...CaptionFontKey[]]),
  size: z.number().finite().min(8).max(400),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const V1Schema = z.object({ v: z.literal(1), ...docBase, captions: z.array(V1CaptionSchema).max(1000) }).transform((d): EditDoc => {
  const first = d.captions[0];
  const captionStyle: CaptionStyle = first
    ? {
        ...DEFAULT_CAPTION_STYLE,
        font: first.font,
        size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, first.size)),
        color: first.color.toLowerCase(),
        x: first.x,
        y: first.y,
      }
    : DEFAULT_CAPTION_STYLE;
  const captions = d.captions.map(({ x: _x, y: _y, font: _f, size: _s, color: _c, ...c }) => c);
  return { v: 2, shape: d.shape, sources: d.sources, pieces: d.pieces, captions, captionStyle };
});

/** Reads v1 and v2 edits; always returns v2 (D396). */
export const EditDocSchema = z.union([V2Schema, V1Schema]) as unknown as z.ZodType<EditDoc>;

/** What the server measured in a file's header (D392). */
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

/** Why a node can't generate (D390): it feeds the Editor, or it feeds a dub that does. */
export type GenerationLock = "editor" | "dub";
