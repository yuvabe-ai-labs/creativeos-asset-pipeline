# Brand KB copilot, part 1: the thread and the build conversation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Copilot panel on the Brand KB page becomes a saved chat that collects the website, socials, documents and images, starts the build, and shows what is running.

**Architecture:** One thread per client in a new table. A turn is a route handler that runs a small tool-calling agent (injected model, pure loop) whose tools call the same server functions the Brand KB form uses today. Live status is computed on read from the existing job tables and polled only while something runs. The build webhook writes the "built" or "failed" message into the thread.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role server client), OpenAI Responses API function tools through the existing `createOpenAI()`, zod, TanStack Query v5, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-copilot-journey-brand-kb-design.md` (sections 2.1, 2.2, 3, 4, 5, 6). Parent: `docs/superpowers/specs/2026-11-12-copilot-journey-design.md`.

**Map:** `docs/superpowers/specs/2026-11-15-copilot-journey-map.md` (sections 2, 5 and 6). Everything this plan builds that a later piece reuses is named after the thread or the journey, never after the brand KB: the thread store and its types, the message, status, composer and attachment components, the one thread read, and the agent loop. Only the agent's prompt and tools, `KbContext`, the turn route and `kb-copilot.tsx` are the brand KB's own.

**Piece 2 is three plans, built in order on this branch (`feat/copilot-journey`, one worktree, merged once at the end):**

1. **Part 1 (this plan):** thread, chat, intake, attachments, build start, status lines.
2. **Part 2:** the review walk: the account of what was found, up to five questions, answers that fill fields, what is left, the gate card, who approved.
3. **Part 3:** change cards: additions and statements on a reviewed KB, chat refinement, "Save & Re-analyze" and source removal as cards, remembered refusals, removing the sparkle button.

Until part 3, an attachment on a reviewed KB is saved as a source and the copilot says it cannot change reviewed fields yet. That intermediate state never ships: all three parts merge together.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing route or layout code.
- Controls are shadcn primitives from `src/components/ui/*` only (Base UI `render` prop, never `asChild`). No raw `<button>`, `<input>`, `<textarea>`. Anything inside a field uses `InputGroup*`.
- Colours through tokens only (`text-primary`, `text-success-text`, `bg-warning`, `text-muted-foreground`). Lucide icons, `strokeWidth={1.5}`. Easing `cubic-bezier(0.22,1,0.36,1)` only.
- Routes use `apiOk` / `apiError` / `withClient` / `withTryCatch` from `src/lib/api/route-helpers.ts`. Never `NextResponse.json`.
- Browser data goes service file -> query file -> component. Keys only through the key factory. Polling is `refetchInterval` returning `false` when done.
- Auth once per request: resolve the caller once in the route and pass it down. Independent queries run in `Promise.all`.
- A failed read is never "empty" when empty would trigger a write.
- Ids from the client are checked against the client in the URL.
- Import, never redefine: search `src/lib/kb/constants.ts`, `src/lib/kb/utils.ts`, `src/lib/scripts/copilot/*` before adding a constant or helper.
- User-facing text says "avatar", never "presenter". No em dashes in user-facing copy.
- The migration is written, not applied. Cyril applies migrations.
- Nothing is pushed.
- One component per file, named export, split at about 200 lines.
- ADRs go in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` section 7 only. Next free number: D496.

## Review Focus

1. **Attachment ids from another client.** A turn naming a document or image id that belongs to a different client must be rejected with 400, and nothing saved. (Task 5)
2. **A build already running.** "Start the build" while a job is running must answer in words ("A build is already running") and start nothing. (Task 4)
3. **The model misbehaves.** An unknown tool name, arguments that fail the tool's schema, or a model that keeps calling tools forever must end the turn with a normal reply, never a 500 and never an endless loop. (Task 3)
4. **A failed thread read.** If reading the thread throws, the turn must fail; it must not treat the thread as empty and insert a second opening message. (Task 5)
5. **Two sends at once.** Two teammates sending at the same moment must each get their own reply in order; neither message is lost and the opening message is stored once. (Tasks 1 and 5)

---

### Task 1: Thread storage

**Files:**
- Create: `supabase/migrations/0063_client_copilot_messages.sql`
- Create: `src/lib/journey/thread/schema.ts`
- Create: `src/lib/journey/thread/rows.ts`
- Create: `src/lib/journey/thread/__tests__/rows.test.ts`
- Create: `src/lib/db/copilot-messages.ts`

**Interfaces:**
- Produces:

```ts
// schema.ts
export const attachmentSchema = z.object({
  kind: z.enum(["document", "image"]),
  id: z.string().uuid(),
  name: z.string().min(1).max(300),
  url: z.string().nullable(), // image thumbnail; null for a document
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const statusLineSchema = z.object({ text: z.string(), state: z.enum(["running", "done", "failed"]) });
export type StatusLine = z.infer<typeof statusLineSchema>;
export const threadCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status"), lines: z.array(statusLineSchema) }),
]);
export type ThreadCard = z.infer<typeof threadCardSchema>;
export type ThreadMessage = {
  id: string; role: "user" | "assistant"; content: string;
  card: ThreadCard | null; attachments: Attachment[]; suggestions: string[]; createdAt: string;
};
export type CopilotThread = "onboarding";

// rows.ts
export type CopilotMessageRow = { id: string; role: "user" | "assistant"; content: string; card: unknown; attachments: unknown; suggestions: unknown; created_at: string };
export function rowToThreadMessage(row: CopilotMessageRow): ThreadMessage;

// db/copilot-messages.ts (server-only; every query filters on client_id AND thread)
export async function listCopilotMessages(clientId: string, thread: CopilotThread): Promise<ThreadMessage[]>; // ordered by seq, newest 200
export type NewCopilotMessage = { role: "user" | "assistant"; content: string; card?: ThreadCard | null; attachments?: Attachment[]; suggestions?: string[] };
export async function insertCopilotMessages(clientId: string, thread: CopilotThread, userId: string | null, messages: NewCopilotMessage[]): Promise<void>;
/** Stores the opening only if the thread has no rows. Safe when two turns race. Returns true if it inserted. */
export async function insertOpeningIfEmpty(clientId: string, thread: CopilotThread, content: string): Promise<boolean>;
```

- [ ] **Step 1: Write the migration.** Follow `supabase/migrations/0052_script_generate.sql` for conventions (RLS on, no policies, `created_by uuid references auth.users(id) on delete set null`). Table `client_copilot_messages`: `id uuid pk default gen_random_uuid()`, `seq bigint generated always as identity`, `client_id uuid not null references clients(id) on delete cascade`, `thread text not null check (thread in ('onboarding'))`, `role text not null check (role in ('user','assistant'))`, `content text not null default ''`, `card jsonb`, `attachments jsonb not null default '[]'`, `suggestions jsonb not null default '[]'`, `is_opening boolean not null default false`, `created_by`, `created_at timestamptz not null default now()`. Index on `(client_id, thread, seq)`. A unique partial index on `(client_id, thread) where is_opening` is what makes `insertOpeningIfEmpty` race-safe.

- [ ] **Step 2: Write the failing test** `rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowToThreadMessage } from "../rows";

const base = { id: "m1", role: "assistant" as const, content: "Hi", created_at: "2026-11-13T00:00:00Z" };

describe("rowToThreadMessage", () => {
  it("reads a plain row", () => {
    expect(rowToThreadMessage({ ...base, card: null, attachments: [], suggestions: [] })).toEqual({
      id: "m1", role: "assistant", content: "Hi", card: null, attachments: [], suggestions: [], createdAt: "2026-11-13T00:00:00Z",
    });
  });
  it("keeps a valid card, attachments and suggestions", () => {
    const m = rowToThreadMessage({
      ...base,
      card: { kind: "status", lines: [{ text: "Read the website", state: "done" }] },
      attachments: [{ kind: "document", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "brand.pdf", url: null }],
      suggestions: ["Start the build"],
    });
    expect(m.card).toEqual({ kind: "status", lines: [{ text: "Read the website", state: "done" }] });
    expect(m.attachments).toHaveLength(1);
    expect(m.suggestions).toEqual(["Start the build"]);
  });
  it("drops a card or attachment it cannot read instead of throwing", () => {
    const m = rowToThreadMessage({ ...base, card: { kind: "from-the-future" }, attachments: [{ nope: true }], suggestions: "x" });
    expect(m.card).toBeNull();
    expect(m.attachments).toEqual([]);
    expect(m.suggestions).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it.** `npm test -- thread/__tests__/rows` Expected: FAIL, cannot find `../rows`.
- [ ] **Step 4: Implement `schema.ts`, `rows.ts` (safeParse each part), `copilot-messages.ts`.** `insertOpeningIfEmpty` inserts a row with `is_opening: true` only when a `select id ... limit 1` for the thread returns no row; a unique-violation (`23505`) from the partial index means another turn stored it, so return `false`. A failed select throws; it never falls through to the insert.
- [ ] **Step 5: Run it.** Expected: PASS 3/3.
- [ ] **Step 6: Commit** `feat(journey): a saved copilot thread per client`.

---

### Task 2: What the copilot knows, and what it says without a model

**Files:**
- Create: `src/lib/journey/kb-copilot/context.ts`
- Create: `src/lib/journey/kb-copilot/__tests__/context.test.ts`

**Interfaces:**
- Produces:

```ts
export type KbContext = {
  clientName: string;
  kbStatus: "pending" | "in_review" | "ready";
  hasVersion: boolean;             // an active KB version exists
  websiteUrl: string | null;
  instagram: string | null;
  facebook: string | null;
  documentCount: number;           // not counting website-research.md
  imageCount: number;              // uploaded images
  job: { status: string; phaseMessage: string | null } | null; // latest KB job
  importing: ("website" | "instagram" | "facebook")[];         // imports running now
  studyingImages: boolean;
};
export function isBuilding(ctx: KbContext): boolean;        // job status in KB_JOB_NON_TERMINAL_STATUSES
export function canStartBuild(ctx: KbContext): boolean;     // not building, no version yet, and a website or a document
export function sourcesSummary(ctx: KbContext): string;
export function openingMessage(ctx: KbContext): string;
export function fallbackSuggestions(ctx: KbContext): string[];
export function liveStatus(ctx: KbContext): StatusLine[];   // only state "running"
```

Exact copy (these strings are asserted):

- `sourcesSummary`: parts joined with commas and a final " and ": `the website example.com` (host without `www.`), `1 document` / `2 documents`, `1 image` / `3 images`. Nothing at all: `nothing yet`.
- `openingMessage`:
  - building: `The brand KB for {name} is being built. I will say here when it is ready to review.`
  - `ready`: `{name}'s brand KB is approved.\n\nTo add to it, attach a document or an image here, or tell me what changed.`
  - `in_review` with a version: `{name}'s brand KB is built and waiting for your review on the right.\n\nReview each section there. You can mark the KB ready once every field is reviewed.`
  - can start: `I have {sourcesSummary} for {name}.\n\nShall I start the build?\nYou can add Instagram or Facebook handles, documents or images first.`
  - otherwise: `Let's build {name}'s brand KB.\n\nWhat is the brand's website?\nNo website? Attach brand documents here instead.`
- `fallbackSuggestions`: `["Start the build"]` when `canStartBuild`, else `[]`.
- `liveStatus`: the job's `phaseMessage` (or `Starting the build…` when null) while building; `Collecting images and video from the website…` / `…from Instagram…` / `…from Facebook…` per running import; `Studying the images…` when `studyingImages`.

- [ ] **Step 1: Write the failing tests.** One `it` per bullet above, asserting the exact strings, plus: `canStartBuild` is false while building, false with a version, false with neither website nor document, true with only a document; `sourcesSummary` for (website + 2 documents + 1 image) is `the website acme.com, 2 documents and 1 image`.
- [ ] **Step 2: Run.** `npm test -- kb-copilot/__tests__/context` Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Import `KB_JOB_NON_TERMINAL_STATUSES` from `src/lib/kb/constants.ts`; check `src/lib/kb/utils.ts` for an existing host or pluralise helper before writing one.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(journey): the brand KB copilot's opening, suggestions and live status`.

---

### Task 3: The agent loop

**Files:**
- Create: `src/lib/journey/agent.ts` (shared by later stage agents)
- Create: `src/lib/journey/__tests__/agent.test.ts`
- Create: `src/lib/journey/agent-model.ts` (the OpenAI adapter; no test, it is the thin edge)

**Interfaces:**
- Produces:

```ts
// agent.ts (pure; no SDK import)
export type AgentTool = { description: string; schema: z.ZodType; run: (args: unknown) => Promise<string> };
export type AgentMessage = { role: "user" | "assistant"; content: string };
export type ToolCall = { id: string; name: string; args: unknown };
export type ToolResult = { id: string; output: string };
export type AgentModel = (input: {
  system: string; messages: AgentMessage[]; tools: Record<string, AgentTool>;
  /** Earlier rounds of this turn: the calls the model made and what each returned. */
  rounds: { calls: ToolCall[]; results: ToolResult[] }[];
  /** When set, the final reply must be this structure, not only words. */
  answer?: z.ZodType;
}) => Promise<{ text: string; calls: ToolCall[]; answer?: unknown }>;
export class AgentAnswerError extends Error {}
export const MAX_AGENT_ROUNDS = 4;
export async function runAgent<T = never>(input: {
  model: AgentModel; system: string; messages: AgentMessage[]; tools: Record<string, AgentTool>;
  answer?: z.ZodType<T>; // a script step passes this (piece 4); the brand KB chat does not
}): Promise<{ text: string; ran: string[]; answer?: T }>; // ran: names of tools that executed without error

// agent-model.ts
export function openaiAgentModel(modelId: string): AgentModel;
```

Behaviour of `runAgent`: call the model; if it returns no calls, return its text. Otherwise run every call: unknown name -> result `Error: no such tool.`; args failing `schema.safeParse` -> `Error: invalid arguments: {zod message}`; a tool that throws -> `Error: {message}`. Feed the results back as the next round. After `MAX_AGENT_ROUNDS` rounds that still ask for tools, call the model once more with `tools: {}` so it must answer in words. If the final text is empty, return `Done.`.

Two things later pieces rely on (map section 5). **Any provider:** `agent.ts` imports no SDK and knows nothing about OpenAI; a second provider is a second adapter beside `agent-model.ts`, never a change to the loop. **A strict ending:** when `answer` is given, it is passed to the model on every call, and once the model stops calling tools its `answer` must pass `answer.safeParse`; the parsed value is returned as `answer`. If it does not pass, `runAgent` throws `AgentAnswerError` with the zod message and the caller decides whether to retry. Without `answer` the loop behaves exactly as above.

- [ ] **Step 1: Write the failing tests** with a scripted fake model (an array of responses returned in order, recording each input):
  - returns the text when the model calls nothing;
  - runs a tool, feeds its output back in `rounds[0].results`, returns the second response's text, `ran` is `["save_website"]`;
  - unknown tool name -> the result passed back is `Error: no such tool.` and `ran` is `[]`;
  - invalid args -> result starts `Error: invalid arguments`, the tool's `run` is not called;
  - a throwing tool -> result `Error: boom`, the turn still returns text;
  - a model that always calls a tool: the model is called exactly `MAX_AGENT_ROUNDS + 1` times, the last time with no tools, and the function returns;
  - with `answer: z.object({ angles: z.array(z.string()).length(3) })`, a model that calls one tool and then returns `answer: { angles: ["a", "b", "c"] }`: the result's `answer` is that object, `ran` has the tool, and every model call received the schema;
  - with the same `answer`, a model whose final `answer` is `{ angles: ["a"] }`: rejects with `AgentAnswerError`.
- [ ] **Step 2: Run.** `npm test -- journey/__tests__/agent` Expected: FAIL, module not found.
- [ ] **Step 3: Implement `agent.ts`.**
- [ ] **Step 4: Run.** Expected: PASS 8/8.
- [ ] **Step 5: Implement `agent-model.ts`.** Read the Responses API types in `node_modules/openai/resources/responses/` first; do not write the shapes from memory. Use `createOpenAI().responses.create` with function tools built from each tool's `z.toJSONSchema(schema)`; map `function_call` output items to `ToolCall` (parse `arguments` as JSON, `{}` on a parse failure) and replay earlier rounds as `function_call` + `function_call_output` input items. Follow `src/lib/scripts/copilot/model.ts` for how the client is created. When `answer` is given, request it as the response's structured output the way `structuredCaller` in that file does and return the parsed value as `answer`; the brand KB chat never passes one, so this path is first exercised in piece 4 and gets its live check there.
- [ ] **Step 6: Type-check.** `npx tsc --noEmit -p .` Expected: no new errors (the one existing error is in `src/app/api/nodes/*-generate/route.test.ts`).
- [ ] **Step 7: Commit** `feat(journey): a small tool-calling agent loop with an injected model`.

---

### Task 4: The brand KB agent's tools and its turn

**Files:**
- Create: `src/lib/kb/start-build.ts` (the body of `startKBBuildJob`, without the auth wrapper)
- Modify: `src/lib/actions/kb.ts:163-201` (`startKBBuildJob` calls `startKBBuild`)
- Create: `src/prompts/kb-copilot.ts`
- Create: `src/lib/journey/kb-copilot/constants.ts`
- Create: `src/lib/journey/kb-copilot/turn.ts`
- Create: `src/lib/journey/kb-copilot/__tests__/turn.test.ts`

**Interfaces:**
- Consumes: `runAgent`, `AgentModel` (Task 3); `KbContext`, `canStartBuild`, `isBuilding`, `fallbackSuggestions` (Task 2); `Attachment`, `ThreadMessage` (Task 1).
- Produces:

```ts
// start-build.ts (server-only)
export class BuildAlreadyRunningError extends Error {}
export async function startKBBuild(client: ClientRow): Promise<{ jobId: string }>;

// constants.ts
export const KB_COPILOT_MODEL = SCRIPT_QUICK_MODEL;   // imported from src/lib/scripts/copilot/constants.ts
export const KB_TURN_MAX_CHARS = 4000;
export const KB_TURN_MAX_ATTACHMENTS = 10;
export const KB_CONVERSATION_WINDOW = 12;             // messages sent to the model

// turn.ts
export type KbActions = {
  saveWebsite: (url: string) => Promise<void>;
  saveSocials: (handles: { instagram?: string; facebook?: string }) => Promise<void>;
  startBuild: () => Promise<void>;                    // throws BuildAlreadyRunningError
};
export async function runKbTurn(input: {
  ctx: KbContext; history: ThreadMessage[]; text: string; attachments: Attachment[];
  actions: KbActions; model: AgentModel;
}): Promise<{ reply: string; suggestions: string[]; changed: boolean }>;
```

Tools the agent gets (names are asserted): `save_website({ url })`, `save_socials({ instagram?, facebook? })`, `start_build({})`, `reply_choices({ choices: string[] })` (max 4, each max 80 chars; records the buttons to show, returns `ok`).

Rules inside the tools, enforced in code, not left to the prompt:
- `start_build` returns `A build is already running.` when `isBuilding(ctx)`; returns `The brand KB is already built. Changes to it come in a later step.` when `ctx.hasVersion`; returns `I need a website or at least one document first.` when there is neither (re-read after any `save_website` in the same turn); `BuildAlreadyRunningError` from `actions.startBuild` also maps to the first string.
- `save_website` on a client that already has a version returns `The website cannot be changed here once the KB is built.` and saves nothing.

`changed` is true when `save_website`, `save_socials` or `start_build` executed successfully. `suggestions` are the `reply_choices` of the last call, else `fallbackSuggestions` computed from the context as it stands after the tools ran. The user message sent to the model has the attachments appended as a line: `Attached: brand.pdf (document), hero.png (image)`.

The system prompt (`src/prompts/kb-copilot.ts`, exported `kbCopilotSystem(ctx: KbContext): string`) states: who the copilot is; the context block (every `KbContext` field in plain lines); the order to ask in (website, then socials, then documents and images, then confirm what it is starting from and start); one question per message; say what it is starting from before calling `start_build`, and only call it after the person says to; it never approves or marks the KB ready; it never states a brand fact; while a build runs it asks nothing; on a KB that is already built it can only acknowledge attachments as saved sources and say that changing reviewed fields comes in a later step; short plain sentences, no em dashes.

- [ ] **Step 1: Write the failing tests** with the scripted fake model from Task 3 and `vi.fn()` actions:
  - a model that calls `save_website({ url: "acme.com" })` then replies: `actions.saveWebsite` called with `acme.com`, `changed` true, reply is the model's text;
  - `start_build` while `ctx.job.status` is running: `actions.startBuild` not called, the tool result is `A build is already running.`, `changed` false;
  - `start_build` with no website and no document: not called, result `I need a website or at least one document first.`;
  - `save_website` then `start_build` in one turn on an empty client: both run (the second sees the website);
  - `start_build` when `actions.startBuild` rejects with `BuildAlreadyRunningError`: result `A build is already running.`, turn still returns;
  - `reply_choices({ choices: ["Yes, start", "Add documents first"] })`: `suggestions` equals those two;
  - no `reply_choices` and `canStartBuild`: `suggestions` is `["Start the build"]`;
  - attachments appear in the last user message given to the model as `Attached: brand.pdf (document)`;
  - only the last `KB_CONVERSATION_WINDOW` history messages are sent.
- [ ] **Step 2: Run.** `npm test -- kb-copilot/__tests__/turn` Expected: FAIL, module not found.
- [ ] **Step 3: Move the build start.** Create `startKBBuild(client)` from the body of `startKBBuildJob` (insert job, the unique-index error becomes `BuildAlreadyRunningError`, trigger `kb-build`, store the run id, `revalidatePath`). `startKBBuildJob` keeps its `withAction` wrapper, loads the client and calls it, and still throws `A KB build is already running for this client.` Trace what else the form's Extract handler does (`src/components/kb/kb-onboarding-upload-step.tsx:210-235` and whatever starts the asset imports) and make sure the chat path does the same and nothing more.
- [ ] **Step 4: Implement `constants.ts`, `kb-copilot.ts`, `turn.ts`.**
- [ ] **Step 5: Run.** Expected: PASS 9/9. Then `npm test -- actions` and `npm test -- kb` to confirm the moved build start broke nothing.
- [ ] **Step 6: Commit** `feat(journey): the brand KB agent collects sources and starts the build`.

---

### Task 5: The thread's routes

**Files:**
- Create: `src/lib/journey/kb-copilot/load.ts` (`loadKbContext`)
- Create: `src/lib/journey/thread/load.ts` (`loadThread`; `ThreadState` goes in `src/lib/journey/thread/schema.ts`)
- Create: `src/app/api/clients/[id]/copilot/thread/route.ts` (GET)
- Create: `src/app/api/clients/[id]/copilot/thread/route.test.ts`
- Create: `src/app/api/clients/[id]/copilot/kb/turn/route.ts` (POST)
- Create: `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:

```ts
// thread/schema.ts gains ThreadState; kb-copilot/load.ts holds loadKbContext; thread/load.ts holds loadThread (both server-only)
export type ThreadState = { messages: ThreadMessage[]; live: StatusLine[]; suggestions: string[] }; // nothing stage-specific in here
export async function loadKbContext(client: ClientRow): Promise<{ ctx: KbContext; documentIds: Set<string>; imageIds: Set<string> }>;
export async function loadThread(client: ClientRow): Promise<ThreadState>;
```

`loadKbContext` reads in one `Promise.all`: `listKBDocuments`, `listBrandImages(clientId, "uploads")`, `getActiveKBVersion`, `getLatestKBJob`, `getBrandDetails`, `listLatestAssetImports`, `getImageAnalysisStatus`. If selecting only an id is possible for the version, do that (rule 8: never download the KB output to learn that it exists).

`loadThread`: context and `listCopilotMessages` in parallel. An empty thread returns one virtual message `{ id: "opening", role: "assistant", content: openingMessage(ctx), ... }` and stores nothing. `suggestions` is the newest assistant message's suggestions when it is the last message, else `fallbackSuggestions(ctx)`; empty while `live` is non-empty.

**GET** `/api/clients/:id/copilot/thread` -> `apiOk(state)`. This is the one read of the onboarding thread for every stage page. In part 1 its live status and fallback suggestions come from the brand KB alone; later stages add theirs inside `loadThread`, so the same messages are never cached under a second key. Sending a turn stays per stage (`/copilot/kb/turn`), because each stage has its own agent.

**POST** `/api/clients/:id/copilot/kb/turn`, body `{ text: string, attachments: Attachment[] }`, `export const maxDuration = 120`. Mirror `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts` for auth (`resolveCallerContext()` once). Order:
1. Validate: body parses; `text.trim()` or at least one attachment; `text.length <= KB_TURN_MAX_CHARS`; `attachments.length <= KB_TURN_MAX_ATTACHMENTS` -> else 400.
2. `loadKbContext`. Every attachment id must be in `documentIds` or `imageIds` for its kind -> else `apiError("That attachment does not belong to this client.", 400)`.
3. `listCopilotMessages` (a throw fails the turn). `insertOpeningIfEmpty(clientId, "onboarding", openingMessage(ctx))` when it returned no messages.
4. Insert the person's message with its attachments.
5. `runKbTurn` with `openaiAgentModel(KB_COPILOT_MODEL)` and actions bound to `updateClientWebsiteUrl` (normalise the URL the way `website-url/route.ts` does; extract `normalizeUrl` to `src/lib/kb/utils.ts` and import it in both), `patchBrandDetails`, `startKBBuild(client)`.
6. Insert the reply with its suggestions. If the agent throws, insert `Something went wrong on my side. Nothing was changed. Try again.` and return 200 with the state, so the person's message is not lost.
7. When `changed`, `revalidatePath` for `/clients/{slug}/kb`.
8. Return `apiOk({ state: await loadThread(client), changed })`.

- [ ] **Step 1: Write the failing route tests**, mocking the db and `runKbTurn` modules the way `src/app/api/clients/[id]/market/approve/route.test.ts` does:
  - GET returns the virtual opening for an empty thread and calls no insert;
  - POST 400 on empty text with no attachments; 400 over `KB_TURN_MAX_CHARS`;
  - POST 400 `That attachment does not belong to this client.` for an id not in the client's documents, and `insertCopilotMessages` not called;
  - POST on an empty thread calls `insertOpeningIfEmpty` once, then stores the user message, then the reply, in that order;
  - POST when `listCopilotMessages` rejects: 500, `insertOpeningIfEmpty` not called;
  - POST when `runKbTurn` rejects: 200, the stored reply is the "Something went wrong" line;
  - POST with `changed: true` calls `revalidatePath("/clients/acme/kb")`.
- [ ] **Step 2: Run.** `npm test -- "[id]/copilot"` Expected: FAIL, modules not found.
- [ ] **Step 3: Implement both load files and both routes.**
- [ ] **Step 4: Run.** Expected: PASS 8/8.
- [ ] **Step 5: Commit** `feat(journey): routes for the brand KB thread and its turns`.

---

### Task 6: The build reports into the thread

**Files:**
- Create: `src/lib/journey/kb-copilot/build-messages.ts`
- Create: `src/lib/journey/kb-copilot/__tests__/build-messages.test.ts`
- Modify: `src/app/api/webhooks/kb-build/route.ts` (after `markKBJobSucceeded`, and in the `failed` branch)
- Modify: the webhook's existing test file, if one exists (search `webhooks/kb-build`)

**Interfaces:**
- Produces:

```ts
export function buildSucceededMessage(input: { hadWebsite: boolean; documentCount: number; skipped: { filename: string; reason: string }[] }): NewCopilotMessage;
export function buildFailedMessage(error: string): NewCopilotMessage;
```

Exact copy:
- succeeded content: `The brand KB is built and ready for your review on the right.` plus, when images may still be coming, a second paragraph `Images and video from the site and socials are still being collected. That does not block the review.` (always included when `hadWebsite`). When `skipped` is non-empty, a third paragraph `I could not read: a.pdf (too large), b.docx (unsupported).`
- succeeded card: `{ kind: "status", lines }` with `Read the website` (only when `hadWebsite`), `Read 2 documents` / `Read 1 document` (only when `documentCount > 0`), `Built the brand KB`, all `state: "done"`.
- failed content: `The build failed: {error}\n\nNothing was changed. Say "start the build" to try again.`, card `{ kind: "status", lines: [{ text: "Build failed", state: "failed" }] }`, suggestions `["Start the build"]`.

- [ ] **Step 1: Write the failing tests** asserting the strings and lines above for: website + 2 documents; documents only (no website line, no "still being collected" paragraph); one skipped file; the failed message.
- [ ] **Step 2: Run.** `npm test -- build-messages` Expected: FAIL.
- [ ] **Step 3: Implement, then call it from the webhook.** The thread write is best-effort: wrap it in try/catch and `console.error`; a failed message insert must not fail the webhook or mark the job failed. Add a webhook test (or a case in the existing one) that a rejecting `insertCopilotMessages` still returns 200 with `versionId`.
- [ ] **Step 4: Run.** `npm test -- build-messages` and `npm test -- webhooks/kb-build` Expected: PASS.
- [ ] **Step 5: Commit** `feat(journey): the build says in the thread when it lands or fails`.

---

### Task 7: Service and query layer

**Files:**
- Create: `src/services/copilot-thread.service.ts`
- Create: `src/hooks/queries/copilot-thread.ts`
- Create: `src/hooks/queries/__tests__/copilot-thread.test.ts`

**Interfaces:**
- Produces:

```ts
// service (through readJson, like clients.service.ts)
export const copilotThreadService: {
  thread(clientId: string): Promise<ThreadState>;
  kbTurn(clientId: string, body: { text: string; attachments: Attachment[] }): Promise<{ state: ThreadState; changed: boolean }>;
};
// queries
export const copilotThreadKeys = { all: (clientId: string) => ["copilot-thread", clientId] as const, thread: (clientId: string) => [...copilotThreadKeys.all(clientId), "thread"] as const };
export const THREAD_LIVE_POLL_MS = 3000;
export function liveRefetchInterval(state: ThreadState | undefined): number | false; // THREAD_LIVE_POLL_MS while state.live.length > 0
export function useCopilotThread(clientId: string): UseQueryResult<ThreadState>;
export function useSendKbTurn(clientId: string): UseMutationResult<...>;
```

The thread is read by one hook for every stage (`useCopilotThread`); a turn is sent by the stage's own hook, and `useSendKbTurn` is the brand KB's. `useSendKbTurn` shows the person's message at once (optimistic, as `useSendTurn` in `src/hooks/queries/script-generate.ts`), rolls back on error, sets the cache to the returned state, and calls `router.refresh()` when `changed` so the page on the right re-reads the website, handles and job.

- [ ] **Step 1: Write the failing test** for `liveRefetchInterval`: `false` for `undefined`, `false` for `live: []`, `THREAD_LIVE_POLL_MS` for one running line.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement all three files.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(journey): service and query hooks for the brand KB thread`.

---

### Task 8: Shared chat pieces

Two call sites now exist for the copilot's text rendering, the reply chips and the panel shell, so they are extracted. No behaviour changes; the script copilot must look and behave exactly as before.

**Files:**
- Create: `src/components/copilot/copilot-text.tsx` (move `CopilotText` out of `src/components/scripts/generate/copilot-chat-message.tsx`)
- Create: `src/components/copilot/person-text.tsx` (move `PersonText`)
- Create: `src/components/copilot/reply-chip.ts` (export the `CHIP` class string from `copilot-suggestions.tsx` as `REPLY_CHIP_CLASS`)
- Create: `src/components/journey/journey-panel-shell.tsx`
- Modify: `src/components/scripts/generate/copilot-chat-message.tsx`, `copilot-suggestions.tsx` (import the moved pieces)
- Modify: `src/components/journey/journey-panel.tsx` (use the shell)

**Interfaces:**
- Produces:

```ts
export function JourneyPanelShell(props: {
  slug: string;
  /** Shown vertically on the folded rail; null shows the word "Copilot". */
  waiting: string | null;
  /** Folding is refused while true (a turn is in flight). */
  busy?: boolean;
  children: ReactNode; // the body under the header
}): JSX.Element;
```

The shell owns the `<section>`, the header with the hide button, the fold state (`useCopilotCollapsed(journeyFoldKey(slug))`) and `JourneyRail`. Unlike today's `JourneyPanel`, the body **stays mounted while folded** (hidden with `lg:hidden`, as `copilot-chat.tsx` does), so a half-typed message and an upload in progress survive a fold.

- [ ] **Step 1: Move the three pieces and update imports.** `grep -rn "CopilotText\|PersonText\|CHIP" src/components` first to find every user.
- [ ] **Step 2: Build the shell from `journey-panel.tsx` and make `JourneyPanel` render `<JourneyPanelShell slug waiting={guide.waiting}>` with its done lines, gate card and next link as children.**
- [ ] **Step 3: Verify.** `npx tsc --noEmit -p .`, `npx eslint src/components/copilot src/components/journey src/components/scripts/generate`, `npm test -- scripts` and `npm test -- journey`. Expected: no new type or lint errors, all tests pass.
- [ ] **Step 4: Commit** `refactor(copilot): share the chat text, reply chip and panel shell between the script copilot and the journey panel`.

---

### Task 9: The chat in the panel, with attachments

**Files:**
- Create: `src/lib/kb/upload-source.ts` (client-safe)
- Create: `src/lib/kb/__tests__/upload-source.test.ts`
- Modify: `src/components/kb/kb-onboarding-upload-step.tsx:127-165` (use `checkSourceFile` and `uploadSourceFile`)
- Create: `src/components/journey/kb-copilot.tsx`
- Create: `src/components/journey/thread-message.tsx`
- Create: `src/components/journey/thread-status-lines.tsx`
- Create: `src/components/journey/thread-composer.tsx`
- Create: `src/components/journey/thread-attachment-chip.tsx`
- Create: `src/hooks/use-thread-attachments.ts`

**Interfaces:**
- Consumes: Tasks 1, 7, 8.
- Produces:

```ts
// upload-source.ts
export type SourceKind = "document" | "image";
export function sourceKindOf(filename: string): SourceKind | null;          // by extension, from DOC_EXTENSIONS / IMG_EXTENSIONS
/** Null when the file may be uploaded; otherwise the reason, ready to show. */
export function checkSourceFile(file: { name: string; size: number }, usedBytes: { document: number; image: number }): string | null;
export async function uploadSourceFile(clientId: string, file: File): Promise<Attachment>; // sign + finalize via uploadViaSignedUrl

// use-thread-attachments.ts
export function useThreadAttachments(input: { check: (file: File) => string | null; upload: (file: File) => Promise<Attachment> }): {
  items: { key: string; name: string; state: "uploading" | "ready" | "failed"; attachment: Attachment | null; error: string | null }[];
  add: (files: File[]) => void; remove: (key: string) => void; clear: () => void;
  uploading: boolean; ready: Attachment[];
};
```

Exact copy for `checkSourceFile`: unsupported type -> `.{ext} files are not supported. Documents: PDF, DOCX, PPTX, MD, TXT. Images: JPG, PNG, WEBP.`; over a single-file limit, if `src/lib/kb/constants.ts` has one -> `{name} is over the {limit} limit for one file.`; over the total -> `Adding {name} would pass the {limit} limit for {documents|images}.` Use `formatBytes` from `src/lib/kb/utils.ts`.

The panel body, top to bottom:
- **Messages** in a `ScrollArea`, following the newest (as `copilot-chat.tsx` does). A person's message shows `PersonText` and its attachment chips; the copilot's shows `CopilotText`, then a status card (`thread-status-lines.tsx`: a tick in `text-success-text` for done, a cross in `text-destructive` for failed).
- **Live status** under the last message while `state.live` is non-empty: one line each with a spinner (`Loader2`, `animate-spin`, `motion-reduce:animate-none`), `aria-live="polite"`.
- **Reply chips** from `state.suggestions` (dashed primary chips, `REPLY_CHIP_CLASS`); a chip sends its text at once. Hidden while a turn is in flight.
- **Composer:** `InputGroup` with `InputGroupTextarea` (placeholder `Answer the copilot, or attach brand documents and images…`), a paperclip `InputGroupButton` (`aria-label="Attach files"`) and the send button. The file picker is the shadcn `Input type="file"` with `multiple` and the combined accept list, visually hidden, exactly the pattern `kb-onboarding-upload-step.tsx` uses; no raw `<input>`. Files can also be dropped on the composer or pasted (image paste). Chosen files upload at once and show as chips above the textarea: name, a thumbnail for an image, a spinner while uploading, a remove button. A refused file shows its reason on its chip in `text-destructive`. Send is disabled while a turn is in flight, while any file is uploading, and when there is neither text nor a ready attachment. Enter sends, Shift+Enter is a new line.
- The rail's `waiting` text: `Your reply` when the last message is the copilot's and nothing is live; else null.
- Loading: three skeleton lines. Error: `The copilot could not be loaded.` with a `Try again` button that refetches.

- [ ] **Step 1: Write the failing tests** for `sourceKindOf` (`a.PDF` -> document, `b.webp` -> image, `c.exe` -> null) and `checkSourceFile` (allowed -> null; `.exe` -> the unsupported string; a document that would pass the document total -> the total string naming documents; an image is checked against the image total, not the document total).
- [ ] **Step 2: Run.** `npm test -- upload-source` Expected: FAIL.
- [ ] **Step 3: Implement `upload-source.ts` and switch `kb-onboarding-upload-step.tsx` to it** (its toasts now show `checkSourceFile`'s reason). `npm test -- upload-source` Expected: PASS.
- [ ] **Step 4: Build the hook and the five components.** Each under about 200 lines. Only `kb-copilot.tsx` knows about the brand KB: it binds `checkSourceFile` and `uploadSourceFile` into `useThreadAttachments`, and passes the placeholder, the accepted file types and `useSendKbTurn` down. The four `thread-*` components and the hook take those as props and import nothing from `src/lib/kb` or `src/lib/journey/kb-copilot`.
- [ ] **Step 5: Verify.** `npx tsc --noEmit -p .` and `npx eslint src/components/journey src/hooks src/lib/kb src/components/kb`. Expected: clean.
- [ ] **Step 6: Commit** `feat(journey): the brand KB chat with attachments in the panel`.

---

### Task 10: Put the chat in the frame

**Files:**
- Modify: `src/lib/journey/load.ts` (`FrameClient.client` gains `id`)
- Modify: `src/lib/journey/__tests__/load.test.ts`
- Modify: `src/components/journey/journey-guide.tsx`
- Modify: `src/lib/journey/guide.ts` and its test (the `kb` section's guide is no longer used; remove its branch and tests, keep market and scripts)
- Modify: `src/app/clients/[id]/kb/page.tsx` (key the upload step so a refresh shows what the chat saved)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` section 7

- [ ] **Step 1: Update the failing test first:** `load.test.ts` expects `client.id` in the result. Run: FAIL. Add `id` in `load.ts`. Run: PASS.
- [ ] **Step 2: `JourneyGuide` renders `<KbCopilot clientId={client.id} slug={client.slug} />` when `panel === "kb"`, and the guide panel otherwise.**
- [ ] **Step 3: Both sides show the same sources.** `KBOnboardingUploadStep` gets a `key` made of the website URL, the two handles and the document and image ids, so `router.refresh()` after a chat turn remounts it with the saved values. Check that an upload made in the form does not itself trigger a remount mid-upload.
- [ ] **Step 4: Append ADRs** in the log's format (Decision / Why / Rejected / Refines / Originated):
  - **D496: one saved onboarding thread per client, in its own table; a script's thread stays where it is.** Both stores return messages in one shape, so the panel, the cards and the composer do not care which a message came from. Why: a script's messages cannot exist before a script does, and the onboarding thread starts before any script. Rejected: reusing `client_script_messages` (it requires a script); moving every script's conversation into the new table (it would move live data for no change the person can see).
  - **D497: stage agents share one small tool-calling loop; the model is passed in, and each stage decides where the loop runs and how a turn ends.** The brand KB agent runs inside the request: its tools are quick writes, and the long work (the build) stays in Trigger.dev and reports into the thread from its webhook. A stage whose agent does long or paid work (market research) runs the same loop in a background task. A turn ends in plain words, or in a strict structure when the caller asks for one, which is how a script step will use the loop while the code keeps deciding the order of steps. Rejected: Trigger.dev `chat.agent` for the brand KB (no long-running model work to host); one fixed place for every agent to run; a free tool-calling agent for scripts (Cyril chose code-decided steps with optional tool calls, 2026-11-15). Refines D336.
- [ ] **Step 5: Whole suite.** `npm test > "$TMP/kb-part1.log" 2>&1; tail -15 "$TMP/kb-part1.log"`. Expected: only the 2 known failures in `src/app/api/nodes/{composite,image}-generate/route.test.ts`; `kling-provider.test.ts` may time out once and passes alone. `npx tsc --noEmit -p .` and `npx eslint .` on changed files: clean.
- [ ] **Step 6: Commit** `feat(journey): the Brand KB page's panel is the brand KB copilot (D496, D497)`.

## Browser check (Cyril, after migration 0063 on a test database)

1. New client: the panel asks for the website. Answer; the form on the right shows it after the reply.
2. Attach a PDF and an image; both appear as chips, then in the form's lists.
3. Attach a `.exe`: refused on the chip with the reason.
4. "Start the build": status lines appear and change with the phases; the form shows the same build.
5. Close the tab mid-build and reopen: the thread is there, the status is live.
6. The build lands: the done lines and "ready for your review" appear without a reload.
7. Fold the panel with a half-typed message, unfold: the text is still there.
8. An existing approved client: the opening says the KB is approved.

---

## Outcome (2026-11-16): built, reviewed once, fixed

All ten tasks are built on `feat/copilot-journey`. One independent review of the whole part found no critical issue and eleven important ones; one fix pass followed. Whole suite after the fixes: 5,511 passed, 2 failed (the two that were failing before this work, in `src/app/api/nodes/[id]/{composite,image}-generate/route.test.ts`), 3 skipped. Nothing here has been run in a browser, and the OpenAI adapter has never made a live call.

### Where the build departed from this plan

- `startKBBuild` takes the client id, not the row: a website saved earlier in the same turn must count, so it re-reads.
- The website and handles are saved through the existing `setImportTarget` (what Brand assets uses), not a newly extracted `normalizeUrl`.
- `save_website` is refused while a build runs, as well as once the KB is built.
- The build error classes live in `src/lib/kb/build-errors.ts`, shared by the pure turn logic and the server start.
- The OpenAI adapter carries the model's own output items between rounds instead of rebuilding tool calls from `rounds`: a reasoning model rejects a tool call replayed without its reasoning item.
- `hasVersion` comes from the client row. No version query.
- `checkSourceFile`'s `usedBytes` is optional. The chat leaves the per-kind totals to the sign route, which already enforces them.
- The empty-thread and reply-choice rules are tested on `loadThread`, not through the one-line GET route.

### What the review changed

- **The panel follows the form.** The form tells the copilot to re-read when it uploads, removes, starts a build, or the build moves on; the thread also re-reads every 20 seconds when idle, so a teammate's message arrives.
- **The form follows the chat without remounting** (`useServerState`). The `key` on the upload step is gone: a chat save no longer wipes other fields or repeats an old failure toast.
- **The polled read is lean and never writes.** Six small reads; no stale-job updates, no counts, no refresh planning. A job that stopped reporting 45 minutes ago is not shown as running.
- **The first turn's model call sees the opening** the person is answering.
- **An attachment is stored from the server's own row**: its name and address are never taken from the browser.
- **Removing an attachment chip removes the source**; a failed removal says the file is still saved.
- **A message that could not be sent is put back** in the box, with its attachments, and the thread is re-read.
- **A failed collection or image study says so** and says where to try again, until the KB is approved.
- **Every line the build writes is true**: no "start the build" offer the copilot would refuse; no "nothing was changed" when the webhook failed part-way; the document count leaves out skipped files; the collection sentence no longer claims it is still running.
- **An empty model reply repeats what the tool said**, never a bare "Done." after a refusal.
- **The collection starts only after the build has started, and only from sources never collected before** (spec section 6).
- **The adapter** resets when a new turn starts, forces the final answer with `tool_choice: "none"`, and gives each call 20 seconds with no SDK retries so five calls fit in the request.
- **A paste is attached only when it is a file and nothing else**, so text copied from a document or spreadsheet pastes as text.

### Left for later, on purpose

- Steps do not turn into separate done lines as the build runs; the build shows one line that changes, then a card of done lines when it lands. Per-step done lines for the collection and the image study are not shown.
- Two turns sent at the same moment are not serialised: each gets its reply, but the replies can land out of order and neither model call sees the other's message.
- The stored opening is computed at first send, so it can differ from the line shown if the person attached a file first.
- The rail says "Your reply" whenever the copilot spoke last, including on an approved KB.
- Enter sends during IME composition. The drop target is only the message box.
- Tool errors reach the model verbatim and may be repeated to the person.
- The caller is resolved twice per turn (`withClient`, then `resolveCallerContext`), as the script turn route does.
- The form's stuck-job path writes nothing to the thread; two simultaneous "failed" deliveries could both write.
- "Read N documents" on a rebuild can still count the earlier website research.
- For later pieces: `thread/load.ts` reads the brand KB context, so the market page will pay for it unless split; a message carries no author; only the newest 200 messages are read; there is no card-update function yet.
- No automated test covers the GET route, the components, the hooks or the adapter.

### Browser check, added by the review

9. With the panel open, press Extract on the form: the panel shows the build and then "built" without a reload.
10. Attach a file in the chat, remove its chip, then build: the file is not a source.
11. Send a message with the network off: the text and the chips come back.
12. Copy a few cells from a spreadsheet and paste: text is pasted, nothing is uploaded.
13. Type a website in the form without saving, then save a handle in the chat: the typed website is still there.
