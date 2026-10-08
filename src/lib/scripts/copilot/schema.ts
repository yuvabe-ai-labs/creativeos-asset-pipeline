import { z } from "zod";
import { shotSchema, type ScriptDoc } from "../schema";
import type { ScriptStage } from "../constants";
import { angleOutputSchema, cardOutputSchema, editOpSchema } from "./output";

// Spec 2 — what the copilot keeps with a script: its working brief, the reel's notes, and the
// conversation. Validated on every read (rows.ts); a value that fails reads as empty.

export const PIECE_KEYS = ["format", "occasion", "lead", "narrative"] as const;
export type PieceKey = (typeof PIECE_KEYS)[number];

/** status null: not settled yet. "given": the person said it. "skipped": the person left it to
 *  the copilot. "proposed": the copilot filled it (shown as "proposed" on the card). */
export const pieceSchema = z.object({
  value: z.string(),
  status: z.enum(["given", "skipped", "proposed"]).nullable(),
});
export type Piece = z.infer<typeof pieceSchema>;

export const angleSchema = angleOutputSchema;
export type Angle = z.infer<typeof angleSchema>;

export const confirmationCardSchema = cardOutputSchema;
export type ConfirmationCard = z.infer<typeof confirmationCardSchema>;

export const briefSchema = z.object({
  phase: z.enum(["pieces", "confirm", "written"]),
  reelNumber: z.number().int().positive().nullable(),
  format: pieceSchema,
  occasion: pieceSchema,
  postDate: z.string(),
  lead: pieceSchema,
  leadAvatarId: z.string().nullable(),
  narrative: pieceSchema,
  angles: z.array(angleSchema),
  card: confirmationCardSchema.nullable(),
});
export type Brief = z.infer<typeof briefSchema>;

const unset = (): Piece => ({ value: "", status: null });
export const EMPTY_BRIEF: Brief = {
  phase: "pieces", reelNumber: null, format: unset(), occasion: unset(), postDate: "",
  lead: unset(), leadAvatarId: null, narrative: unset(), angles: [], card: null,
};

/** The reel's own notes (spec 2 §4.2): the confirmed brief as editable text, and the items the
 *  person must confirm before Final (a proposed date, an occasion custom). */
export const scriptNotesSchema = z.object({
  brief: z.string().max(8000),
  confirmations: z.array(z.object({
    id: z.string().min(1).max(16),
    text: z.string().max(500),
    confirmed: z.boolean(),
  })),
});
export type ScriptNotes = z.infer<typeof scriptNotesSchema>;
export const EMPTY_NOTES: ScriptNotes = { brief: "", confirmations: [] };

export const proposalCardSchema = z.object({
  kind: z.literal("proposal"),
  status: z.enum(["pending", "accepted", "rejected", "stale"]),
  summary: z.string(),
  ops: z.array(editOpSchema),
  before: z.array(shotSchema),
  after: z.array(shotSchema),
});
export type ProposalCard = z.infer<typeof proposalCardSchema>;

export const messageCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("angles"), angles: z.array(angleSchema) }),
  z.object({
    kind: z.literal("research"),
    signals: z.array(z.object({ id: z.string(), name: z.string() })),
    perAngle: z.array(z.object({ angleId: z.string(), signalIds: z.array(z.string()), note: z.string() })),
  }),
  z.object({ kind: z.literal("confirmation"), card: confirmationCardSchema }),
  proposalCardSchema,
]);
export type MessageCard = z.infer<typeof messageCardSchema>;

export type ScriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  card: MessageCard | null;
  createdAt: string;
};

/** One thing standing between the script and Final (spec 2 §8). `path` points at the field to
 *  fix when there is one (fields.ts). */
export type OpenItem = { id: string; label: string; question: string; path: string | null };

/** A client avatar the copilot may cast: saved (ready) and not archived. */
export type CopilotAvatar = { id: string; name: string; story: string; front: string | null };

export type GenerateScript = {
  id: string;
  clientId: string;
  stage: ScriptStage;
  /** null until the first draft is written (only possible at Generate). */
  doc: ScriptDoc | null;
  brief: Brief;
  notes: ScriptNotes;
  docVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ScriptPatch = { doc?: ScriptDoc; brief?: Brief; notes?: ScriptNotes };

/** Everything the Generate workspace shows, returned by every Generate route. */
export type GenerateState = {
  script: GenerateScript;
  messages: ScriptMessage[];
  openItems: OpenItem[];
  avatars: CopilotAvatar[];
};

/** A script with no draft yet, as the library lists it. */
export type UnwrittenScript = { id: string; title: string; updatedAt: string };
