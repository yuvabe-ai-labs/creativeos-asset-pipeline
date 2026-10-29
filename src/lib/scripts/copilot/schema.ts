import { z } from "zod";
import { scriptDocSchema, shotSchema, type ScriptDoc } from "../schema";
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

/** An angle saved before the copilot went brand-neutral had `mealMoment` and `proofEmphasis`; it is
 *  read as `productMoment` and `proof`, so a brief in progress is not reset (a brief that fails
 *  validation reads as empty, rows.ts). */
export function upgradeAngle(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const a = raw as Record<string, unknown>;
  return {
    ...a,
    productMoment: a.productMoment ?? a.mealMoment,
    proof: a.proof ?? a.proofEmphasis,
  };
}

// Stored shapes: the model-facing schemas stay strict (OpenAI strict output allows no defaults or
// preprocessing); what is read back upgrades older shapes.
export const angleSchema = z.preprocess(upgradeAngle, angleOutputSchema);
export type Angle = z.infer<typeof angleSchema>;

// The card call's suggestions belong to its message, not to the card.
export const confirmationCardSchema = cardOutputSchema.omit({ suggestions: true }).extend({ beats: z.array(z.string()).default([]) });
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
  /** The draft came from a pasted script (paste-a-script spec), so the copilot asks who plays whom. */
  imported: z.boolean().default(false),
});
export type Brief = z.infer<typeof briefSchema>;

const unset = (): Piece => ({ value: "", status: null });
export const EMPTY_BRIEF: Brief = {
  phase: "pieces", reelNumber: null, format: unset(), occasion: unset(), postDate: "",
  lead: unset(), leadAvatarId: null, narrative: unset(), angles: [], card: null, imported: false,
};

/** The reel's own notes (spec 2 §4.2): the confirmed brief as editable text, and the items the
 *  person must confirm before Final (a proposed date, an occasion custom). */
export const scriptNotesSchema = z.object({
  brief: z.string().max(8000),
  confirmations: z.array(z.object({
    id: z.string().min(1).max(16),
    text: z.string().max(500),
    confirmed: z.boolean(),
    /** A guess's fields (paste-a-script §4.3), as fields.ts paths: changing any of them settles it.
     *  Absent on items to confirm from the card, which only a tick or the copilot settles. */
    paths: z.array(z.string().max(120)).max(200).optional(),
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

/** Paste-a-script spec §3 — a whole script pasted over a draft. It is read first (§8 Q1), so the card
 *  can say what it holds and accepting is instant; it keeps the read script until the person decides. */
export const importCardSchema = z.object({
  kind: z.literal("import"),
  status: z.enum(["pending", "accepted", "rejected"]),
  /** "Reel 07 · 9 shots · 50s" */
  summary: z.string(),
  /** The draft it would replace: "13 shots · 62s". */
  replacing: z.string(),
  doc: scriptDocSchema,
  notes: scriptNotesSchema,
  /** The import's reply, posted when the person accepts. */
  reply: z.string(),
});
export type ImportCard = z.infer<typeof importCardSchema>;

export const messageCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("angles"), angles: z.array(angleSchema) }),
  z.object({
    kind: z.literal("research"),
    signals: z.array(z.object({ id: z.string(), name: z.string() })),
    perAngle: z.array(z.object({ angleId: z.string(), signalIds: z.array(z.string()) })),
  }),
  z.object({ kind: z.literal("confirmation"), card: confirmationCardSchema }),
  proposalCardSchema,
  importCardSchema,
]);
export type MessageCard = z.infer<typeof messageCardSchema>;

export type ScriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  card: MessageCard | null;
  /** The copilot's brand-aware chips for what the person might send next (brand-neutral spec §3.1);
   *  [] on the person's messages and on replies written before chips were saved. */
  suggestions: string[];
  createdAt: string;
};

/** One thing standing between the script and Final (spec 2 §8). `path` points at the field to
 *  fix when there is one (fields.ts). */
export type OpenItem = { id: string; label: string; question: string; path: string | null };

/** A client avatar the copilot may cast: saved (ready) and not archived. `specific` when its front
 *  is an uploaded photo of a real person (a founder), not a generated face. */
export type CopilotAvatar = { id: string; name: string; story: string; front: string | null; specific: boolean };

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
  /** The formats in the client's finished scripts, offered as chips when the copilot asks the
   *  format. Empty once there is a draft: nothing asks the format after that. */
  formats: string[];
};

/** A script with no draft yet, as the library lists it. */
export type UnwrittenScript = { id: string; title: string; updatedAt: string };
