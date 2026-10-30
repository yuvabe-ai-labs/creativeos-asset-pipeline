import { z } from "zod";

// What the model returns from each copilot call. Bare types only (every field required, nulls
// explicit) so the same schema works as OpenAI strict output and as Gemini's responseJsonSchema.
// Code normalises the result into the stored shapes; nothing here is saved as returned.

export const shotFieldsSchema = z.object({
  beat: z.string(),
  lengthSeconds: z.number(),
  visual: z.string(),
  vo: z.string(),
  onScreenText: z.string(),
  /** Cast member ids (edits) or cast keys (the first draft) of who is on screen; empty = B-roll. */
  onScreen: z.array(z.string()),
  /** D447 — product ids (edits) or keys (the first draft) this shot shows; empty when none. */
  products: z.array(z.string()),
  /** D447 — the location id (edits) or key (the first draft) it is set in; "" when none. */
  location: z.string(),
});
export type ShotFields = z.infer<typeof shotFieldsSchema>;

/** D447 — a product the script shows, and a place its shots happen in. Never with images. */
const productOutputSchema = z.object({ key: z.string(), name: z.string() });
const locationOutputSchema = z.object({ key: z.string(), name: z.string(), description: z.string() });

export const draftOutputSchema = z.object({
  header: z.object({
    title: z.string(), format: z.string(), region: z.string(), postDate: z.string(),
    theme: z.string(), aspect: z.string(), targetLength: z.string(), production: z.string(),
  }),
  context: z.object({
    purpose: z.string(), settingAndCamera: z.string(), disclaimers: z.string(),
    watchOuts: z.array(z.string()),
  }),
  cast: z.array(z.object({
    key: z.string(), name: z.string(), description: z.string(),
    avatarId: z.string().nullable(), isLead: z.boolean(),
  })),
  shots: z.array(shotFieldsSchema),
  products: z.array(productOutputSchema),
  locations: z.array(locationOutputSchema),
  summary: z.string(),
  /** Edits the person might ask for next, for this brand (brand-neutral spec §3.1). */
  suggestions: z.array(z.string()),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

/** Paste-a-script spec §4 — the model's reading of a pasted script. The header, context, cast and
 *  shots come before `kept`, in the first draft's order, so partial-draft.ts streams it into the pane
 *  the same way. `lengthSeconds` is 0 where the paste has no timing: code estimates it (import.ts). */
export const importOutputSchema = z.object({
  readable: z.boolean(),
  problem: z.string(),
  reelNumber: z.number().int().nullable(),
  header: draftOutputSchema.shape.header,
  context: draftOutputSchema.shape.context,
  cast: z.array(z.object({ key: z.string(), name: z.string(), description: z.string(), isLead: z.boolean() })),
  shots: z.array(shotFieldsSchema),
  products: z.array(productOutputSchema),
  locations: z.array(locationOutputSchema),
  kept: z.array(z.object({ name: z.string(), text: z.string() })),
  guessed: z.object({ beats: z.boolean(), lead: z.boolean() }),
  summary: z.string(),
});
export type ImportOutput = z.infer<typeof importOutputSchema>;

const pieceAnswer = { action: z.enum(["given", "skip", "none"]), value: z.string() };
export const extractionSchema = z.object({
  format: z.object(pieceAnswer),
  occasion: z.object({ ...pieceAnswer, postDate: z.string() }),
  lead: z.object({ ...pieceAnswer, avatarId: z.string().nullable() }),
  narrative: z.object({ ...pieceAnswer, angleId: z.string().nullable() }),
  skipAll: z.boolean(),
  reelNumber: z.number().int().nullable(),
  confirm: z.boolean(),
  cardChange: z.string(),
  ack: z.string(),
  suggestions: z.array(z.string()),
});
export type Extraction = z.infer<typeof extractionSchema>;

export const angleOutputSchema = z.object({
  id: z.string(),
  hook: z.string(),
  situation: z.string(),
  /** Where the client's product or service shows up in the situation. */
  productMoment: z.string(),
  supportingCast: z.string(),
  /** The proof the angle leans on, from the client's KB. */
  proof: z.string(),
  /** "" unless the format's review beat fits the brand. */
  reviewTheme: z.string(),
  format: z.string(),
  occasion: z.string(),
  postDate: z.string(),
  lead: z.string(),
  leadAvatarId: z.string().nullable(),
  signalIds: z.array(z.string()),
  fromSignals: z.string(),
});
export const anglesOutputSchema = z.object({ angles: z.array(angleOutputSchema), suggestions: z.array(z.string()) });

export const cardOutputSchema = z.object({
  title: z.string(),
  reelNumber: z.number().int().nullable(),
  lines: z.array(z.object({ label: z.string(), value: z.string(), source: z.enum(["given", "proposed"]) })),
  /** The chosen format's beats, after leaving out or adapting any that don't fit the brand. */
  beats: z.array(z.string()),
  cast: z.array(z.object({ name: z.string(), role: z.string(), isLead: z.boolean(), avatarId: z.string().nullable() })),
  toConfirm: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export const EDIT_OPS = [
  "set_field", "update_shot", "insert_shot", "remove_shot", "split_shot", "move_shot",
  "set_watch_outs", "update_cast", "add_cast", "remove_cast", "set_lead", "link_avatar", "confirm_item",
  // D447 — products and locations, by name and description only; the copilot never sets images.
  "add_product", "update_product", "remove_product", "add_location", "update_location", "remove_location",
] as const;

/** One edit operation. A flat object (unused fields null) rather than a union, so both providers'
 *  structured output accept it; ops.ts checks each op's required fields. */
export const editOpSchema = z.object({
  op: z.enum(EDIT_OPS),
  path: z.string().nullable(),
  value: z.string().nullable(),
  shotId: z.string().nullable(),
  afterShotId: z.string().nullable(),
  shot: shotFieldsSchema.nullable(),
  second: shotFieldsSchema.nullable(),
  list: z.array(z.string()).nullable(),
  cast: z.object({
    castId: z.string().nullable(), name: z.string(), description: z.string(), avatarId: z.string().nullable(),
  }).nullable(),
  itemId: z.string().nullable(),
  product: z.object({ productId: z.string().nullable(), name: z.string() }).nullable(),
  location: z.object({ locationId: z.string().nullable(), name: z.string(), description: z.string() }).nullable(),
});
export type EditOp = z.infer<typeof editOpSchema>;

export const editTurnSchema = z.object({ ops: z.array(editOpSchema), reply: z.string(), suggestions: z.array(z.string()) });
export const inlineOutputSchema = z.object({ replacement: z.string(), summary: z.string() });

/** Paste-a-script spec §5.2 — is the message a whole script (import) or anything else (the turn
 *  goes on as before). Asked of the quick model, only for long messages (import.ts mightBeScript). */
export const detectOutputSchema = z.object({ wholeScript: z.boolean() });
