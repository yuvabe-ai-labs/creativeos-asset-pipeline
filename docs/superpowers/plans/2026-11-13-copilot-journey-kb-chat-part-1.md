# Brand KB copilot, part 1: the thread and the build conversation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Copilot panel on the Brand KB page becomes a saved chat that collects the website, socials, documents and images, starts the build, and shows what is running.

**Architecture:** One thread per client in a new table. A turn is a route handler that runs a small tool-calling agent (injected model, pure loop) whose tools call the same server functions the Brand KB form uses today. Live status is computed on read from the existing job tables and polled only while something runs. The build webhook writes the "built" or "failed" message into the thread.

**Tech Stack:** Next.js 16 route handlers, Supabase (service-role server client), OpenAI Responses API function tools through the existing `createOpenAI()`, zod, TanStack Query v5, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-copilot-journey-brand-kb-design.md` (sections 2.1, 2.2, 3, 4, 5, 6). Parent: `docs/superpowers/specs/2026-11-12-copilot-journey-design.md`.

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
- Create: `src/lib/journey/kb-copilot/schema.ts`
- Create: `src/lib/journey/kb-copilot/rows.ts`
- Create: `src/lib/journey/kb-copilot/__tests__/rows.test.ts`
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
export const kbCardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status"), lines: z.array(statusLineSchema) }),
]);
export type KbCard = z.infer<typeof kbCardSchema>;
export type KbMessage = {
  id: string; role: "user" | "assistant"; content: string;
  card: KbCard | null; attachments: Attachment[]; suggestions: string[]; createdAt: string;
};
export type CopilotThread = "onboarding";

// rows.ts
export type CopilotMessageRow = { id: string; role: "user" | "assistant"; content: string; card: unknown; attachments: unknown; suggestions: unknown; created_at: string };
export function rowToKbMessage(row: CopilotMessageRow): KbMessage;

// db/copilot-messages.ts (server-only; every query filters on client_id AND thread)
export async function listCopilotMessages(clientId: string, thread: CopilotThread): Promise<KbMessage[]>; // ordered by seq, newest 200
export type NewCopilotMessage = { role: "user" | "assistant"; content: string; card?: KbCard | null; attachments?: Attachment[]; suggestions?: string[] };
export async function insertCopilotMessages(clientId: string, thread: CopilotThread, userId: string | null, messages: NewCopilotMessage[]): Promise<void>;
/** Stores the opening only if the thread has no rows. Safe when two turns race. Returns true if it inserted. */
export async function insertOpeningIfEmpty(clientId: string, thread: CopilotThread, content: string): Promise<boolean>;
```

- [ ] **Step 1: Write the migration.** Follow `supabase/migrations/0052_script_generate.sql` for conventions (RLS on, no policies, `created_by uuid references auth.users(id) on delete set null`). Table `client_copilot_messages`: `id uuid pk default gen_random_uuid()`, `seq bigint generated always as identity`, `client_id uuid not null references clients(id) on delete cascade`, `thread text not null check (thread in ('onboarding'))`, `role text not null check (role in ('user','assistant'))`, `content text not null default ''`, `card jsonb`, `attachments jsonb not null default '[]'`, `suggestions jsonb not null default '[]'`, `is_opening boolean not null default false`, `created_by`, `created_at timestamptz not null default now()`. Index on `(client_id, thread, seq)`. A unique partial index on `(client_id, thread) where is_opening` is what makes `insertOpeningIfEmpty` race-safe.

- [ ] **Step 2: Write the failing test** `rows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rowToKbMessage } from "../rows";

const base = { id: "m1", role: "assistant" as const, content: "Hi", created_at: "2026-11-13T00:00:00Z" };

describe("rowToKbMessage", () => {
  it("reads a plain row", () => {
    expect(rowToKbMessage({ ...base, card: null, attachments: [], suggestions: [] })).toEqual({
      id: "m1", role: "assistant", content: "Hi", card: null, attachments: [], suggestions: [], createdAt: "2026-11-13T00:00:00Z",
    });
  });
  it("keeps a valid card, attachments and suggestions", () => {
    const m = rowToKbMessage({
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
    const m = rowToKbMessage({ ...base, card: { kind: "from-the-future" }, attachments: [{ nope: true }], suggestions: "x" });
    expect(m.card).toBeNull();
    expect(m.attachments).toEqual([]);
    expect(m.suggestions).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it.** `npm test -- kb-copilot/__tests__/rows` Expected: FAIL, cannot find `../rows`.
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
}) => Promise<{ text: string; calls: ToolCall[] }>;
export const MAX_AGENT_ROUNDS = 4;
export async function runAgent(input: {
  model: AgentModel; system: string; messages: AgentMessage[]; tools: Record<string, AgentTool>;
}): Promise<{ text: string; ran: string[] }>; // ran: names of tools that executed without error

// agent-model.ts
export function openaiAgentModel(modelId: string): AgentModel;
```

Behaviour of `runAgent`: call the model; if it returns no calls, return its text. Otherwise run every call: unknown name -> result `Error: no such tool.`; args failing `schema.safeParse` -> `Error: invalid arguments: {zod message}`; a tool that throws -> `Error: {message}`. Feed the results back as the next round. After `MAX_AGENT_ROUNDS` rounds that still ask for tools, call the model once more with `tools: {}` so it must answer in words. If the final text is empty, return `Done.`.

- [ ] **Step 1: Write the failing tests** with a scripted fake model (an array of responses returned in order, recording each input):
  - returns the text when the model calls nothing;
  - runs a tool, feeds its output back in `rounds[0].results`, returns the second response's text, `ran` is `["save_website"]`;
  - unknown tool name -> the result passed back is `Error: no such tool.` and `ran` is `[]`;
  - invalid args -> result starts `Error: invalid arguments`, the tool's `run` is not called;
  - a throwing tool -> result `Error: boom`, the turn still returns text;
  - a model that always calls a tool: the model is called exactly `MAX_AGENT_ROUNDS + 1` times, the last time with no tools, and the function returns.
- [ ] **Step 2: Run.** `npm test -- journey/__tests__/agent` Expected: FAIL, module not found.
- [ ] **Step 3: Implement `agent.ts`.**
- [ ] **Step 4: Run.** Expected: PASS 6/6.
- [ ] **Step 5: Implement `agent-model.ts`.** Read the Responses API types in `node_modules/openai/resources/responses/` first; do not write the shapes from memory. Use `createOpenAI().responses.create` with function tools built from each tool's `z.toJSONSchema(schema)`; map `function_call` output items to `ToolCall` (parse `arguments` as JSON, `{}` on a parse failure) and replay earlier rounds as `function_call` + `function_call_output` input items. Follow `src/lib/scripts/copilot/model.ts` for how the client is created.
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
- Consumes: `runAgent`, `AgentModel` (Task 3); `KbContext`, `canStartBuild`, `isBuilding`, `fallbackSuggestions` (Task 2); `Attachment`, `KbMessage` (Task 1).
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
  ctx: KbContext; history: KbMessage[]; text: string; attachments: Attachment[];
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
- Create: `src/lib/journey/kb-copilot/load.ts`
- Create: `src/app/api/clients/[id]/copilot/kb/route.ts` (GET)
- Create: `src/app/api/clients/[id]/copilot/kb/route.test.ts`
- Create: `src/app/api/clients/[id]/copilot/kb/turn/route.ts` (POST)
- Create: `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:

```ts
// load.ts (server-only)
export type KbThreadState = { messages: KbMessage[]; live: StatusLine[]; suggestions: string[]; kbStatus: KbContext["kbStatus"] };
export async function loadKbContext(client: ClientRow): Promise<{ ctx: KbContext; documentIds: Set<string>; imageIds: Set<string> }>;
export async function loadKbThread(client: ClientRow): Promise<KbThreadState>;
```

`loadKbContext` reads in one `Promise.all`: `listKBDocuments`, `listBrandImages(clientId, "uploads")`, `getActiveKBVersion`, `getLatestKBJob`, `getBrandDetails`, `listLatestAssetImports`, `getImageAnalysisStatus`. If selecting only an id is possible for the version, do that (rule 8: never download the KB output to learn that it exists).

`loadKbThread`: context and `listCopilotMessages` in parallel. An empty thread returns one virtual message `{ id: "opening", role: "assistant", content: openingMessage(ctx), ... }` and stores nothing. `suggestions` is the newest assistant message's suggestions when it is the last message, else `fallbackSuggestions(ctx)`; empty while `live` is non-empty.

**GET** `/api/clients/:id/copilot/kb` -> `apiOk(state)`.

**POST** `/api/clients/:id/copilot/kb/turn`, body `{ text: string, attachments: Attachment[] }`, `export const maxDuration = 120`. Mirror `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts` for auth (`resolveCallerContext()` once). Order:
1. Validate: body parses; `text.trim()` or at least one attachment; `text.length <= KB_TURN_MAX_CHARS`; `attachments.length <= KB_TURN_MAX_ATTACHMENTS` -> else 400.
2. `loadKbContext`. Every attachment id must be in `documentIds` or `imageIds` for its kind -> else `apiError("That attachment does not belong to this client.", 400)`.
3. `listCopilotMessages` (a throw fails the turn). `insertOpeningIfEmpty(clientId, "onboarding", openingMessage(ctx))` when it returned no messages.
4. Insert the person's message with its attachments.
5. `runKbTurn` with `openaiAgentModel(KB_COPILOT_MODEL)` and actions bound to `updateClientWebsiteUrl` (normalise the URL the way `website-url/route.ts` does; extract `normalizeUrl` to `src/lib/kb/utils.ts` and import it in both), `patchBrandDetails`, `startKBBuild(client)`.
6. Insert the reply with its suggestions. If the agent throws, insert `Something went wrong on my side. Nothing was changed. Try again.` and return 200 with the state, so the person's message is not lost.
7. When `changed`, `revalidatePath` for `/clients/{slug}/kb`.
8. Return `apiOk({ state: await loadKbThread(client), changed })`.

- [ ] **Step 1: Write the failing route tests**, mocking the db and `runKbTurn` modules the way `src/app/api/clients/[id]/market/approve/route.test.ts` does:
  - GET returns the virtual opening for an empty thread and calls no insert;
  - POST 400 on empty text with no attachments; 400 over `KB_TURN_MAX_CHARS`;
  - POST 400 `That attachment does not belong to this client.` for an id not in the client's documents, and `insertCopilotMessages` not called;
  - POST on an empty thread calls `insertOpeningIfEmpty` once, then stores the user message, then the reply, in that order;
  - POST when `listCopilotMessages` rejects: 500, `insertOpeningIfEmpty` not called;
  - POST when `runKbTurn` rejects: 200, the stored reply is the "Something went wrong" line;
  - POST with `changed: true` calls `revalidatePath("/clients/acme/kb")`.
- [ ] **Step 2: Run.** `npm test -- copilot/kb` Expected: FAIL, modules not found.
- [ ] **Step 3: Implement `load.ts` and both routes.**
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
- Create: `src/services/kb-copilot.service.ts`
- Create: `src/hooks/queries/kb-copilot.ts`
- Create: `src/hooks/queries/__tests__/kb-copilot.test.ts`

**Interfaces:**
- Produces:

```ts
// service (through readJson, like clients.service.ts)
export const kbCopilotService: {
  thread(clientId: string): Promise<KbThreadState>;
  turn(clientId: string, body: { text: string; attachments: Attachment[] }): Promise<{ state: KbThreadState; changed: boolean }>;
};
// queries
export const kbCopilotKeys = { all: (clientId: string) => ["kb-copilot", clientId] as const, thread: (clientId: string) => [...kbCopilotKeys.all(clientId), "thread"] as const };
export const KB_LIVE_POLL_MS = 3000;
export function liveRefetchInterval(state: KbThreadState | undefined): number | false; // KB_LIVE_POLL_MS while state.live.length > 0
export function useKbThread(clientId: string): UseQueryResult<KbThreadState>;
export function useSendKbTurn(clientId: string): UseMutationResult<...>;
```

`useSendKbTurn` shows the person's message at once (optimistic, as `useSendTurn` in `src/hooks/queries/script-generate.ts`), rolls back on error, sets the cache to the returned state, and calls `router.refresh()` when `changed` so the page on the right re-reads the website, handles and job.

- [ ] **Step 1: Write the failing test** for `liveRefetchInterval`: `false` for `undefined`, `false` for `live: []`, `KB_LIVE_POLL_MS` for one running line.
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
- Create: `src/components/journey/kb-copilot-message.tsx`
- Create: `src/components/journey/kb-status-lines.tsx`
- Create: `src/components/journey/kb-copilot-composer.tsx`
- Create: `src/components/journey/kb-attachment-chip.tsx`
- Create: `src/hooks/use-kb-attachments.ts`

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

// use-kb-attachments.ts
export function useKbAttachments(clientId: string): {
  items: { key: string; name: string; state: "uploading" | "ready" | "failed"; attachment: Attachment | null; error: string | null }[];
  add: (files: File[]) => void; remove: (key: string) => void; clear: () => void;
  uploading: boolean; ready: Attachment[];
};
```

Exact copy for `checkSourceFile`: unsupported type -> `.{ext} files are not supported. Documents: PDF, DOCX, PPTX, MD, TXT. Images: JPG, PNG, WEBP.`; over a single-file limit, if `src/lib/kb/constants.ts` has one -> `{name} is over the {limit} limit for one file.`; over the total -> `Adding {name} would pass the {limit} limit for {documents|images}.` Use `formatBytes` from `src/lib/kb/utils.ts`.

The panel body, top to bottom:
- **Messages** in a `ScrollArea`, following the newest (as `copilot-chat.tsx` does). A person's message shows `PersonText` and its attachment chips; the copilot's shows `CopilotText`, then a status card (`kb-status-lines.tsx`: a tick in `text-success-text` for done, a cross in `text-destructive` for failed).
- **Live status** under the last message while `state.live` is non-empty: one line each with a spinner (`Loader2`, `animate-spin`, `motion-reduce:animate-none`), `aria-live="polite"`.
- **Reply chips** from `state.suggestions` (dashed primary chips, `REPLY_CHIP_CLASS`); a chip sends its text at once. Hidden while a turn is in flight.
- **Composer:** `InputGroup` with `InputGroupTextarea` (placeholder `Answer the copilot, or attach brand documents and images…`), a paperclip `InputGroupButton` (`aria-label="Attach files"`) and the send button. The file picker is the shadcn `Input type="file"` with `multiple` and the combined accept list, visually hidden, exactly the pattern `kb-onboarding-upload-step.tsx` uses; no raw `<input>`. Files can also be dropped on the composer or pasted (image paste). Chosen files upload at once and show as chips above the textarea: name, a thumbnail for an image, a spinner while uploading, a remove button. A refused file shows its reason on its chip in `text-destructive`. Send is disabled while a turn is in flight, while any file is uploading, and when there is neither text nor a ready attachment. Enter sends, Shift+Enter is a new line.
- The rail's `waiting` text: `Your reply` when the last message is the copilot's and nothing is live; else null.
- Loading: three skeleton lines. Error: `The copilot could not be loaded.` with a `Try again` button that refetches.

- [ ] **Step 1: Write the failing tests** for `sourceKindOf` (`a.PDF` -> document, `b.webp` -> image, `c.exe` -> null) and `checkSourceFile` (allowed -> null; `.exe` -> the unsupported string; a document that would pass the document total -> the total string naming documents; an image is checked against the image total, not the document total).
- [ ] **Step 2: Run.** `npm test -- upload-source` Expected: FAIL.
- [ ] **Step 3: Implement `upload-source.ts` and switch `kb-onboarding-upload-step.tsx` to it** (its toasts now show `checkSourceFile`'s reason). `npm test -- upload-source` Expected: PASS.
- [ ] **Step 4: Build the hook and the five components.** Each under about 200 lines.
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
  - **D496: one saved copilot thread per client, in its own table.** Rejected: reusing `client_script_messages` (it requires a script).
  - **D497: stage agents are a small tool-calling loop with an injected model, run inside the request.** Why: the tools are quick writes; the long work (the build) stays in Trigger.dev and reports into the thread from its webhook. Rejected: Trigger.dev `chat.agent` for this stage (no long-running model work to host); a fixed step machine like the script brief (Cyril decided on tool calling). Refines D336.
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
