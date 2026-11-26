import { z } from "zod";

// The shape of a copilot thread message, the same for every stage (journey map §2 and §5). A stage
// supplies its own agent and tools; what the panel renders is always this.

export const attachmentSchema = z.object({
  kind: z.enum(["document", "image"]),
  id: z.string().uuid(),
  name: z.string().min(1).max(300),
  /** An image's thumbnail; null for a document. */
  url: z.string().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const statusLineSchema = z.object({ text: z.string(), state: z.enum(["running", "done", "failed"]) });
export type StatusLine = z.infer<typeof statusLineSchema>;

/** One field a change card would change (brand KB spec §2.4): what it holds now, what it would
 *  hold, and where the new value came from. `docId` is the document it came from, or null. */
export const changeFieldSchema = z.object({
  path: z.string().min(1),
  label: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  from: z.string(),
  docId: z.string().nullable(),
});
export type ChangeField = z.infer<typeof changeFieldSchema>;

/** A proposed change to reviewed fields of the brand KB, settled once by a person (D517). Made
 *  against one KB version; `stale` once that version is no longer the active one. */
export const changeCardSchema = z.object({
  kind: z.literal("change"),
  versionId: z.string().min(1),
  status: z.enum(["pending", "applied", "discarded", "stale"]),
  fields: z.array(changeFieldSchema).min(1),
  /** Who settled it, when, which fields were kept, and which were left because they were changed
   *  by hand after the card was made. */
  decision: z.object({
    by: z.string(), byId: z.string().nullable(), at: z.string(),
    kept: z.array(z.string()), outOfDate: z.array(z.string()),
  }).nullable(),
});
export type ChangeCard = z.infer<typeof changeCardSchema>;

/** One brand the market agent proposes to look at (D530), in the tab it would fill. */
export const marketBrandSchema = z.object({
  /** An Instagram handle, normalised: lowercase, no "@". */
  handle: z.string().min(1).max(30),
  name: z.string(),
  why: z.string(),
  group: z.enum(["direct", "adjacent"]),
  /** Whether the person keeps it for fetching. */
  keep: z.boolean(),
});
export type MarketBrand = z.infer<typeof marketBrandSchema>;

/** The brands to fetch posts from, reviewed by a person before anything is fetched (D530).
 *  pending → fetching (a person confirmed; `jobId` is the fetch) → fetched; `stale` once a newer
 *  brands card replaced it while it was still pending. */
export const brandsCardSchema = z.object({
  kind: z.literal("brands"),
  status: z.enum(["pending", "fetching", "fetched", "stale"]),
  /** What the person asked to look into, when they named something ("hooks for monsoon"). */
  focus: z.string().nullable(),
  brands: z.array(marketBrandSchema),
  jobId: z.string().nullable(),
});
export type BrandsCard = z.infer<typeof brandsCardSchema>;

/** A signal the agent drafted from fetched posts, saved only when a person keeps it (D530).
 *  `thumbs` is what the card shows, so the thread needs no read per post. */
export const signalDraftCardSchema = z.object({
  kind: z.literal("signal-draft"),
  status: z.enum(["pending", "kept", "dropped"]),
  name: z.string(),
  tags: z.array(z.string()),
  description: z.string(),
  itemIds: z.array(z.string()),
  thumbs: z.array(z.object({ itemId: z.string(), url: z.string().nullable(), handle: z.string() })),
  /** The signal it became once kept. */
  signalId: z.string().nullable(),
});
export type SignalDraftCard = z.infer<typeof signalDraftCardSchema>;

/** What a person decides about a draft: keep it (as edited), or drop it. */
export type SignalDraftDecision =
  | { decision: "keep"; name: string; tags: string[]; description: string; itemIds: string[] }
  | { decision: "drop" };

/** The structured part of an assistant message. The gate card is not here: it is worked out on
 *  each read, never stored (see `Waiting`). */
export const threadCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status"), lines: z.array(statusLineSchema) }),
  /** A question about one thing, named by `field`; `label` is shown above the words. */
  /** `answers`: likely answers offered on an empty field (D533), kept so a tap can be read in code. */
  z.object({ kind: z.literal("question"), field: z.string().min(1), label: z.string(), answers: z.array(z.string()).optional() }),
  /** Who approved a stage or a card. The name is kept as it was that day. */
  z.object({ kind: z.literal("approval"), what: z.string(), by: z.string(), byId: z.string().uuid().nullable() }),
  /** Something that happened beside the chat, said in one line (a save on the page). */
  z.object({ kind: z.literal("note") }),
  changeCardSchema,
  brandsCardSchema,
  signalDraftCardSchema,
]);
export type ThreadCard = z.infer<typeof threadCardSchema>;

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  card: ThreadCard | null;
  attachments: Attachment[];
  suggestions: string[];
  createdAt: string;
  /** On a pending change card, read fresh each time and never stored: the fields changed by hand
   *  since the card was made. */
  outOfDate?: string[];
};

/** Which saved thread of a client. Only the onboarding thread lives in this store (D508). */
export type CopilotThread = "onboarding";
export const ONBOARDING: CopilotThread = "onboarding";

/** The id of a thread's opening line while it is only shown, not yet stored. */
export const VIRTUAL_OPENING_ID = "opening";

/** The one thing the person has to do next (journey spec §4.3). Worked out on every read from what
 *  is stored, so it follows what is done by hand. `label` is what the folded rail shows.
 *  - reply: the copilot asked something; nothing more is drawn in the thread.
 *  - task: something to do on the page, with links to where.
 *  - gate: the next approval, what it opens, and why the copilot cannot do it. `action` names the
 *    approval for the stage's own component, which is the only thing that can carry it out. */
export type Waiting =
  | { kind: "reply"; label: string }
  | { kind: "task"; label: string; text: string; links: { label: string; href: string }[] }
  | { kind: "gate"; label: string; title: string; opens: string; why: string; action: string }
  /** One or more change cards in the thread are waiting for a person's decision (D517). */
  | { kind: "change"; label: string };

/** What the panel shows: the saved messages, what is running right now, the reply choices, and
 *  what the person is waited on. */
export type ThreadState = { messages: ThreadMessage[]; live: StatusLine[]; suggestions: string[]; waiting: Waiting | null };
