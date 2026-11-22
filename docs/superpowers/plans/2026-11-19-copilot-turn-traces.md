# Copilot turn traces: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every brand KB copilot turn (typed, or a reply button) leaves a trace of exactly what the model was sent, each round of tool calls and answers, and what code did around it, seen in the copilot panel behind a developer switch and kept 30 days.

**Architecture:** The shared agent loop (`runAgent`) takes an optional *trace sink* and reports to it what it sent (instructions, conversation, tool definitions as the adapter sends them) and each round as it happens, so a turn that fails half-way keeps what it did. The KB turn reports its button choices (D519) and its refusals to the same sink. The route writes one row per turn to a new table *after* the stream has closed, catching every error, so tracing never slows or fails a turn. The panel reads only list lines (no trace bodies) while the switch is on, and loads one trace when it is opened. A daily Trigger.dev task removes traces older than 30 days.

**Tech Stack:** Next.js 16 route handlers, Supabase Postgres (service-role client, RLS default-deny), zod v4 (`z.toJSONSchema`), TanStack Query v5, Trigger.dev v4 `schedules.task`, shadcn (Base UI) `Switch`, `Tabs`, `Accordion`, `Badge`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-copilot-turn-traces-design.md`

## Global Constraints

- **Exactly what was sent (A).** The trace keeps the full instructions, the conversation, and each tool's name, description and JSON schema in the adapter's own form. Never a summary.
- **No added wait; never fails the turn.** The trace is written after `controller.close()`; any error writing it is caught and logged (`[kb-copilot] could not keep the trace`), never emitted.
- **No new polling.** The thread poll does not read traces. The list query runs only with the switch on, is never polled, and selects only the line columns (never `trace`).
- **Who sees it:** the same as the thread: routes under `withClient`; every read filters by `client_id`.
- **Kept 30 days:** `TRACE_KEEP_DAYS = 30`. The list also hides anything older, so a late sweep never shows stale traces.
- **Marks, exact ids and words:** `unanswered` "Question left unanswered", `asked_again` "Asked again", `refused` "Refused", `failed` "Failed".
- **The switch** is remembered per browser (`creativeos.copilot.developer`), off by default; off, the panel is exactly as today.
- Migrations: Cyril applies them; never apply one. shadcn primitives only. Lucide icons at 1.5 stroke.

## Review Focus

1. **A turn that throws inside the model call.** Expected: a trace with the rounds so far, `error` set, mark `failed`, and the person still gets the usual failure reply. Test in Task 3.
2. **The trace insert itself fails** (table not migrated yet, network). Expected: the turn's stream and stored reply are unchanged; one log line. Test in Task 3. This matters at once: the branch runs before Cyril applies 0066.
3. **A reply-button turn (D519)**, which never calls the model. Expected: a trace with `sent: null`, no rounds, the `choice` recorded. Test in Task 2.
4. **A refusal returned as a plain sentence** (`REVIEWED_LOCKED` from `answer_field`), not thrown. Expected: still marked `refused`. Test in Task 2.
5. **A trace id from another client** on the detail route. Expected: 404, nothing returned. Test in Task 4.

---

### Task 1: The loop reports what it sent and each round

**Files:**
- Create: `src/lib/journey/trace/recorder.ts`
- Modify: `src/lib/journey/agent.ts`, `src/lib/journey/agent-model.ts` (use `toolDefinitions`)
- Test: `src/lib/journey/__tests__/agent.test.ts`, `src/lib/journey/__tests__/trace-recorder.test.ts`

**Interfaces:**
- Produces:

```ts
// agent.ts
export type ToolDefinition = { name: string; description: string; parameters: Record<string, unknown> };
/** The tools as the model is told about them; the adapter sends exactly these. */
export function toolDefinitions(tools: Record<string, AgentTool>): ToolDefinition[];
export type TraceSink = {
  sent: (s: { system: string; messages: AgentMessage[]; tools: ToolDefinition[] }) => void;
  /** One model answer and the tools it called. `calls` empty for the final answer. */
  round: (r: { text: string; calls: ToolCall[]; results: ToolResult[]; ms: number }) => void;
  choice: (c: { tool: string; args: unknown; output: string }) => void;
  refused: (sentence: string) => void;
};
// runAgent input gains: trace?: TraceSink

// trace/recorder.ts
export type TraceRecord = {
  sent: { system: string; messages: AgentMessage[]; tools: ToolDefinition[] } | null;
  rounds: { text: string; calls: ToolCall[]; results: ToolResult[]; ms: number }[];
  choice: { tool: string; args: unknown; output: string } | null;
  refusals: string[];
};
export function traceRecorder(): TraceSink & { record: () => TraceRecord };
```

- [ ] **Step 1: Write the failing tests**

```ts
// agent.test.ts
it("tells the trace what it sent, once, with the tools as the model sees them", …)
  // sent called once; tools[0] has name, description, parameters.type === "object"
it("reports each round as it happens, with the final answer as a round with no calls", …)
  // one tool round then words → rounds: [{calls:[c1], results:[…]}, {text:"Done it.", calls:[]}]
it("keeps the rounds already reported when the model throws on a later call", …)
  // model throws on 2nd call → runAgent rejects; record().rounds has the first round
it("runs the same with no trace", …)
// trace-recorder.test.ts
it("collects what the loop and the turn report, in order", …)
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lib/journey/__tests__/agent.test.ts src/lib/journey/__tests__/trace-recorder.test.ts` Expected: FAIL.
- [ ] **Step 3: Implement.** `sent` is reported before the first model call. `ms` per round is from the model call that produced it to the end of its tools. An ending round (`ends`/quiet) is still reported before returning. `agent-model.ts` builds `functionTools` from `toolDefinitions` plus its own `type`/`strict`, so the two cannot drift.
- [ ] **Step 4: Run them to see them pass,** plus `src/lib/journey/__tests__/agent-model.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): the agent loop reports what it sent and each round to a trace`

---

### Task 2: The KB turn reports its buttons and refusals; marks

**Files:**
- Create: `src/lib/journey/kb-copilot/trace.ts`
- Modify: `src/lib/journey/kb-copilot/turn.ts`
- Test: `src/lib/journey/kb-copilot/__tests__/turn.test.ts`, `src/lib/journey/kb-copilot/__tests__/trace.test.ts`

**Interfaces:**
- Consumes: Task 1 `TraceSink`, `TraceRecord`.
- Produces:

```ts
// runKbTurn input gains: trace?: TraceSink (passed through to runAgent)
// trace.ts (pure)
export type TraceMark = "unanswered" | "asked_again" | "refused" | "failed";
export const TRACE_MARK_LABEL: Record<TraceMark, string>;   // the exact words in Global Constraints
export function kbTurnMarks(i: {
  record: TraceRecord; pending: string | null; settled: string[]; skipped: boolean; stopped: boolean;
  askedAgain: boolean; failed: boolean;
}): TraceMark[];
```

Rules: `unanswered` when `pending` is set and the turn settled nothing, did not skip, did not stop. `refused` when `record.refusals` is non-empty or any round result starts with `Error:`. `asked_again` and `failed` as given. Order as the type lists them.

- [ ] **Step 1: Write the failing tests**

```ts
// turn.test.ts
it("records a reply button carried out by code, with no model call", …)          // Review Focus 3: record().sent null, choice {tool:"confirm_field", …}
it("records a refusal a tool returns as a sentence", …)                          // Review Focus 4: answer_field on a reviewed field → refusals [REVIEWED_LOCKED]
it("passes the trace to the agent loop", …)                                      // a typed turn → record().sent not null
// trace.test.ts
it("marks a waiting question the turn did nothing about", …)                     // the §1 bug: pending AGE, rounds [{text:"Confirmed that field.", calls:[]}] → ["unanswered"]
it("does not mark a question answered, skipped or stopped", …)
it("marks a thrown refusal and a returned one alike", …)
it("marks asked again and failed as told", …)
```

- [ ] **Step 2: Fail.** `npx vitest run src/lib/journey/kb-copilot`
- [ ] **Step 3: Implement.** In `turn.ts` add `refuse(sentence)` = `input.trace?.refused(sentence)` then `tell(sentence)`, and use it for every returned refusal: `ALREADY_RUNNING`, `ALREADY_BUILT`, `NOTHING_TO_BUILD_FROM`, `WEBSITE_LOCKED`, `WEBSITE_LOCKED_BUILDING`, `NO_REVIEW`, `NOT_IN_KB`, `REVIEWED_LOCKED`, `EMPTY_ANSWER`, `NO_QUESTION`, "No handle was given.", and the refusal from `open()`. The button branch reports `choice` with the tool's own output.
- [ ] **Step 4: Pass.** Same command.
- [ ] **Step 5: Commit** `feat(copilot): the brand KB turn reports its buttons and refusals, and what a turn is marked`

---

### Task 3: Keep a trace for every turn, after the reply is on its way

**Files:**
- Create: `supabase/migrations/0066_copilot_turn_traces.sql`, `src/lib/db/copilot-traces.ts`
- Modify: `src/lib/db/copilot-messages.ts` (`NewCopilotMessage.id?`), `src/lib/journey/kb-copilot/trace.ts` (`kbTraceRow`), `src/lib/journey/kb-copilot/constants.ts` (`TRACE_KEEP_DAYS`, `TRACE_LIST_LIMIT = 50`, `TRACE_SENT_TEXT_MAX_CHARS = 200`), `src/app/api/clients/[id]/copilot/kb/turn/route.ts`
- Test: `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`, `src/lib/journey/kb-copilot/__tests__/trace.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:

```sql
create table copilot_turn_traces (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  thread text not null check (thread in ('onboarding')),
  -- The reply this turn stored; null when the turn failed before storing one.
  message_id uuid references client_copilot_messages(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- What a list line shows, so the list never reads `trace`.
  sent_text text not null default '', tools text[] not null default '{}', marks text[] not null default '{}',
  duration_ms integer not null,
  trace jsonb not null
);
create index copilot_turn_traces_client_idx on copilot_turn_traces (client_id, created_at desc);
create index copilot_turn_traces_age_idx on copilot_turn_traces (created_at);
alter table copilot_turn_traces enable row level security;
```

```ts
// trace.ts
export type TurnTrace = TraceRecord & {
  came: { text: string; attachments: { kind: string; name: string }[]; waiting: string | null; state: string };
  model: string | null;
  code: { settled: string[]; added: string[]; card: boolean };   // added: content of each message code stored after the reply
  reply: string; ms: number; error: string | null;
};
export type NewTurnTrace = { clientId: string; messageId: string | null; createdBy: string; sentText: string; tools: string[]; marks: TraceMark[]; durationMs: number; trace: TurnTrace };
export function kbTraceRow(i: Omit<TurnTrace, keyof TraceRecord> & { record: TraceRecord; clientId: string; messageId: string | null; createdBy: string; marks: TraceMark[] }): NewTurnTrace;
// db/copilot-traces.ts
export async function insertTurnTrace(row: NewTurnTrace): Promise<void>;
```

Route: a `traceRecorder()` per turn, passed as `trace` to `runKbTurn`; the reply's id made with `crypto.randomUUID()` and passed as `id` so the trace can name it; `askedAgain` = `walk.pending !== null && extra.some((m) => m.card?.kind === "question" && m.card.field === walk.pending)`; `came.state` = `ctx.kbStatus` plus `", building"` while a build runs. `work` becomes `turn().then(keepTrace)` where `keepTrace` builds the row and inserts it inside its own try/catch.

- [ ] **Step 1: Write the failing tests**

```ts
// route.test.ts (mock "@/lib/db/copilot-traces")
it("keeps a trace of the turn after the stream has closed", …)            // insertTurnTrace called once, after the last event; row.messageId === the stored reply's id
it("keeps a trace of a failed turn, marked failed, with what it did so far", …)   // Review Focus 1
it("answers exactly as before when the trace cannot be kept", …)           // Review Focus 2: insertTurnTrace rejects → same events, no "error" event
it("marks a question code asks again", …)                                  // asked_again
// trace.test.ts
it("kbTraceRow: line columns from the trace; sent text cut to 200 characters", …)
```

- [ ] **Step 2: Fail.** `npx vitest run src/app/api/clients/[id]/copilot/kb/turn src/lib/journey/kb-copilot/__tests__/trace.test.ts`
- [ ] **Step 3: Implement** the migration (header comment citing the spec, as 0064), the insert, `kbTraceRow`, and the route wiring.
- [ ] **Step 4: Pass, type-check.** Same command; `npx tsc --noEmit` (only the known image-generate error).
- [ ] **Step 5: Commit** `feat(copilot): keep a trace of every brand KB turn (migration 0066, not applied)`

---

### Task 4: Reading traces: list lines and one trace

**Files:**
- Create: `src/app/api/clients/[id]/copilot/traces/route.ts`, `src/app/api/clients/[id]/copilot/traces/[traceId]/route.ts`, `src/services/copilot-traces.service.ts`, `src/hooks/queries/copilot-traces.ts`
- Modify: `src/lib/db/copilot-traces.ts`, `src/hooks/queries/copilot-thread.ts` (invalidate the list in `useSendKbTurn` `onSettled`)
- Test: `src/app/api/clients/[id]/copilot/traces/route.test.ts`, `src/app/api/clients/[id]/copilot/traces/[traceId]/route.test.ts`

**Interfaces:**
- Produces:

```ts
export type TurnLine = { id: string; messageId: string | null; createdAt: string; sentText: string; tools: string[]; marks: TraceMark[]; durationMs: number };
// db
export async function listTurnLines(clientId: string, since: string, limit: number): Promise<TurnLine[]>;   // never selects `trace`
export async function getTurnTrace(clientId: string, id: string): Promise<(TurnLine & { trace: TurnTrace }) | null>;
// GET /api/clients/:id/copilot/traces          → { lines: TurnLine[] }  newest first, last TRACE_KEEP_DAYS, TRACE_LIST_LIMIT
// GET /api/clients/:id/copilot/traces/:traceId → TurnLine & { trace }   404 "That trace is gone." when missing or another client's
// query file
export const copilotTraceKeys: { all(clientId); list(clientId); detail(clientId, id) };
export function useTurnLines(clientId: string, enabled: boolean);          // no refetchInterval
export function useTurnTrace(clientId: string, id: string | null);         // enabled only with an id
```

- [ ] **Step 1: Write the failing tests**

```ts
it("lists one client's lines from the last 30 days, without trace bodies", …)    // listTurnLines called with (clientId, since ≈ now − 30 days, 50)
it("returns one trace of this client", …)
it("refuses a trace of another client", …)                                       // Review Focus 5: getTurnTrace → null → 404
it("refuses a trace id that is not a uuid", …)                                   // 400, no read
```

- [ ] **Step 2: Fail.** `npx vitest run src/app/api/clients/[id]/copilot/traces`
- [ ] **Step 3: Implement** with `withClient`, `withTryCatch`, `apiOk`/`apiError`; service through `readJson`; keys only via the factory.
- [ ] **Step 4: Pass, type-check.**
- [ ] **Step 5: Commit** `feat(copilot): read a client's turn traces, a line at a time and one in full`

---

### Task 5: Traces older than 30 days are removed

**Files:**
- Create: `trigger/copilot-trace-sweep.ts`
- Modify: `src/lib/db/copilot-traces.ts` (`deleteTurnTracesBefore(cutoff: string): Promise<number>`)
- Test: `src/lib/db/__tests__/copilot-traces.test.ts` (the cutoff and the filter, Supabase client mocked as in the other `db/__tests__`)

`schedules.task({ id: "copilot-trace-sweep", cron: "15 4 * * *", maxDuration: 300 })`; every `@/lib` import dynamic (as `archive-sweep.ts` explains). Cutoff = now − `TRACE_KEEP_DAYS` days.

- [ ] **Step 1: Write the failing test** `it("deletes traces created before the cutoff and reports how many", …)`
- [ ] **Step 2: Fail.** `npx vitest run src/lib/db/__tests__/copilot-traces.test.ts`
- [ ] **Step 3: Implement** the delete and the task.
- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** `feat(copilot): remove turn traces after 30 days`

---

### Task 6: The developer switch and the Turns view in the panel

**Files:**
- Create: `src/hooks/use-stored-flag.ts`, `src/components/journey/traces/turn-line.tsx`, `src/components/journey/traces/turn-trace-view.tsx`, `src/components/journey/traces/turn-list.tsx`, `src/components/journey/traces/reply-trace.tsx`
- Modify: `src/hooks/use-copilot-collapsed.ts` (built on `use-stored-flag`), `src/components/journey/journey-panel-shell.tsx` (`actions?: ReactNode` in the header, before the fold), `src/components/journey/thread-message.tsx` (`footer?: ReactNode` under the message), `src/components/journey/kb-copilot.tsx`
- Test: `src/hooks/use-stored-flag.test.ts`; the existing `src/hooks/use-copilot-collapsed.test.ts` stays green

**Interfaces:**
- Consumes: Task 4 hooks; Task 2 `TRACE_MARK_LABEL`.
- Produces: `useStoredFlag(key: string, fallback: boolean): readonly [boolean, (next: boolean) => void]` (the pattern `use-copilot-collapsed.ts` has today, made generic); `useCopilotDeveloper()` = `useStoredFlag("creativeos.copilot.developer", false)`.

What it shows:
- **Header:** a `Switch` labelled "Turns" (tooltip "Show each turn's trace, for testing the copilot").
- **Switch on:** `Tabs` under the header, "Chat" and "Turns". Chat is today's thread; each assistant message with a line in `useTurnLines` gets a `ReplyTrace` footer: a ghost `xs` Button "Trace" with its mark badges, opening `TurnTraceView` in place. Lines are looked up in a `Map` by `messageId`, built once per list.
- **Turns tab:** `TurnList`, one `TurnLine` per row: time, sent text (one line, truncated), tool names, `durationMs`, mark `Badge`s (`failed` and `refused` in destructive tone, the others outline). A row opens its `TurnTraceView`.
- **`TurnTraceView`:** sections in the spec's order (§3.1): what came in; what the agent was given (instructions, conversation and tools each folded in an `Accordion`, monospace, pre-wrapped); each round (its words; each call's name and arguments; each result, a refusal tinted destructive; ms); what code did (fields written, what it added after, a change card); how it ended (the reply, total ms, the error).

- [ ] **Step 1: Write the failing test** for `useStoredFlag`'s read/write (blocked storage falls back to memory), as `use-copilot-collapsed.test.ts` does.
- [ ] **Step 2: Fail.** `npx vitest run src/hooks/use-stored-flag.test.ts`
- [ ] **Step 3: Implement** the hook, move `use-copilot-collapsed` onto it, then the components and wiring. Keep each file under ~200 lines (`kb-copilot.tsx` is 162 today: the tabs and the lines lookup go in a small `KbCopilotBody` if it would pass that).
- [ ] **Step 4: Pass, type-check, lint, suite.** `npx vitest run src/hooks`; `npx tsc --noEmit`; `npx eslint src/components/journey src/hooks`; `npx vitest run` (only the two known image-generate failures).
- [ ] **Step 5: Commit** `feat(copilot): a developer switch in the panel shows each turn's trace`

The repo has no component test setup, so the view is verified by the browser checks in Task 7.

---

### Task 7: ADR, AGENTS line, QA checks, outcome

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (CRLF): append **D521** (traces: kept for every agent turn, exactly what was sent, in-app, 30 days, the four marks; rejected: LangSmith/LangGraph, a summary of the input (B), marks by tool name). *(D520 stays reserved for page-follows, already written into its plan.)*
- Modify: `AGENTS.md`, beside "Streaming": **A copilot turn leaves a trace.** An agent on the shared loop passes a `traceRecorder()` to `runAgent` and its route keeps the row after the stream closes; never trace by hand or skip it. Spec: the traces design.
- Modify: `docs/qa/2026-11-18-copilot-journey-manual-qa.md`: section "Turn traces".
- Modify: this plan: Outcome after the review.

QA checks (Do / Expected):
1. Turn the switch on. Chat and Turns tabs appear; off, the panel is exactly as before.
2. Repeat the spec §1 steps (type "yes" on a waiting question so the model, not the button, handles it; force a no-tool answer if it saves). The Turns line shows "Question left unanswered" or, if it saved, no mark.
3. Open that line: the waiting field, the instructions, conversation and tools (folded), the model's words, the calls (or none), what code added.
4. Press a reply button: its line shows the tool code ran, no model rounds.
5. On a reply in Chat, press "Trace": the same trace opens in place.
6. Ask for a change to a reviewed field and refuse it (same value): marked "Refused".
7. Turn the network off mid-turn on staging (or stop the model key locally): the turn's line is "Failed".
8. As a second person in the same organisation: the same lines. In another organisation: none (404 on a pasted trace URL).
9. With the switch off, DevTools Network shows no request to `/copilot/traces` on load or after a turn.
10. Before 0066 is applied: turns still answer normally; the server logs "could not keep the trace".

- [ ] **Step 1: Write the four documents.**
- [ ] **Step 2: Commit** `docs(copilot): D521, turn traces`

---

## Outcome (2026-11-19)

**Built** on `feat/copilot-journey`, commits `15b2339`..`50d362e4`, inline execution, test first. One independent whole-branch review (most capable model): no critical findings, one important, ten minor; verdict "with fixes". One fix pass.

**Departures from the plan (rulings):**
- The stored reply carries an id made by the route, so a trace names the reply it produced; six route tests now expect `id: expect.any(String)`.
- An extra index on `copilot_turn_traces(message_id)` (AGENTS rule 9: index foreign keys).
- The Turns list is refreshed 1.5 s after a turn settles (`refreshTurnLinesSoon`), because the trace is kept only after the answer has gone.
- Trace text uses the body face, not monospace: the design system allows two families only.
- The composer stays under the Turns tab; extra small files (`use-copilot-developer.ts`, `traces/trace-parts.tsx`, `traces/developer-switch.tsx`).
- QA 6.27 rewritten for the `propose_change` fix (`69dc1d3b`).

**Fixed after the review:**
- A `propose_change` call that only saved unreviewed fields now ends on "Saved {field}.", not on words the model wrote expecting a card.
- A turn that fails after a save is traced with that field written (the route records writes as they happen), not "Question left unanswered".
- A reply-button turn whose tool throws keeps its choice, with the error as the output.

**Left for later (minor):** the trace still shows the reply when the reply insert itself failed; a partly refused `propose_change` reports its save under "Error:"; the trace does not mark the last round's withdrawn tools; Turns → Chat returns to the top of the thread; Tabs have no panels; `text-[0.7rem]` badge size; "30 days" hard-coded in the list; the 1.5 s refresh is best-effort; ~15–40 KB per trace (store instructions by hash if volume grows).

**Owed:** apply migration 0066 (Cyril); deploy `copilot-trace-sweep` with the other Trigger.dev tasks; run QA section 7, check 7.10 first. (Renumbered 2026-11-22: this migration was 0065, D521 was D509.)
