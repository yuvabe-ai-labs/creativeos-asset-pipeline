# The Brand KB Copilot Shows Its Work As It Happens: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A brand KB chat turn sends what it does to the browser as it happens: a named step line, each save at the moment it is stored, and the reply's words as they are written.

**Architecture:** The shared agent loop gains optional event callbacks and stays pure. The OpenAI adapter streams when asked for words. The turn route answers as newline-delimited JSON, the same wire format the script copilot's first draft already uses (D337), ending with one `state` line that carries exactly what the route returns today. The browser reads the lines, keeps the in-flight step and words in the turn hook, and applies saves through the path D501 built.

**Tech Stack:** Next.js 16 route handler (`ReadableStream`, `after` from `next/server`), OpenAI SDK 7 (`responses.stream`), TanStack Query v5, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-17-copilot-streaming-design.md](../specs/2026-11-17-copilot-streaming-design.md). Decisions: D502 (the principle), D501 (plain saves), D497 (the loop), D337 (the wire format).

## Global Constraints

- Nothing is pushed or merged. No migration. Work on `feat/copilot-journey` in the worktree.
- A turn stores the same messages it stores today, in the same order. Events change when things are seen, never what is saved.
- D501 stays: `save_website` and `save_socials` end the turn with a reply worded by code.
- No stop button. A reload in the middle of a turn behaves as it does today (no record that a turn is running).
- Reply buttons appear only with the final state. Teammates see nothing live.
- A turn that has started finishes and stores its reply even if the browser goes away.
- Bad input is refused as an ordinary JSON error before anything streams (`apiError`), as today.
- Browser data access keeps the three layers: `src/services` → `src/hooks/queries` → components. Controls are shadcn primitives.
- The step lines, word for word: `Saving the website…`, `Saving the handles…`, `Saving your answer…`, `Starting the build…`. The general line stays `Working on it…`.

## Review Focus

1. **The browser goes away in the middle of a turn.** The reply is still stored. (Task 4)
2. **The model writes words and then asks for a tool.** Those words are cleared; only the final reply's words stay. (Task 1)
3. **A network chunk ends in the middle of a line or of a multi-byte character.** The reader still yields whole lines. (Task 5)
4. **The turn fails after a save was shown.** The saved value stays shown and the failure line replaces any half-written words. (Tasks 4 and 6)
5. **A turn that owes a structured answer.** Its JSON is never sent to the browser as words. (Task 1)

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/journey/agent.ts` (modify) | The loop reports words, a reset and step labels through optional callbacks |
| `src/lib/journey/agent-model.ts` (modify) | The OpenAI adapter streams text when given `onText` |
| `src/lib/journey/kb-copilot/turn.ts` (modify) | Tool labels; reports saves and page changes |
| `src/lib/journey/thread/turn-events.ts` (create) | The event type shared by route and browser, and the response headers |
| `src/lib/journey/thread/turn-progress.ts` (create) | Pure reducer: events → what the panel shows while a turn runs |
| `src/app/api/clients/[id]/copilot/kb/turn/route.ts` (modify) | Answers as event lines; finishes under `after` |
| `src/services/read-ndjson.ts` (create) | One line reader for both streaming services |
| `src/services/script-generate.service.ts` (modify) | Uses the shared reader, behaviour unchanged |
| `src/services/copilot-thread.service.ts` (modify) | `kbTurn` reads events |
| `src/hooks/queries/copilot-thread.ts` (modify) | `useSendKbTurn` applies events and exposes progress |
| `src/components/journey/kb-copilot.tsx` (modify) | Shows the step line and the words as they arrive |

---

### Task 1: The loop reports what it is doing

**Files:**
- Modify: `src/lib/journey/agent.ts`
- Test: `src/lib/journey/__tests__/agent.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AgentTool = { description: string; schema: z.ZodType; run: (args: unknown) => Promise<string>; ends?: boolean;
    /** The line shown while this tool runs. Only tools that change the page have one. */
    label?: string };
  export type AgentEvents = { text?: (delta: string) => void; reset?: () => void; step?: (label: string) => void };
  // AgentModel's input gains:  onText?: (delta: string) => void
  // runAgent's input gains:    on?: AgentEvents
  ```

- [ ] **Step 1: Write the failing tests** (append to the `runAgent` describe). The scripted model in this file gains an optional list of deltas per response that it passes to `input.onText` before returning.

  ```ts
  it("passes the model's words on as they are written", async () => {
    // one response, deltas ["Hel", "lo"], text "Hello", no calls
    expect(text).toEqual(["Hel", "lo"]); expect(reset).not.toHaveBeenCalled();
  });
  it("clears words the model wrote before it asked for a tool", async () => {
    // response 1: deltas ["Let me"], calls [save_website]; response 2: deltas ["Saved."], no calls
    expect(order).toEqual(["text:Let me", "reset", "text:Saved."]);
  });
  it("does not clear anything when the round with a tool wrote no words", async () => {
    expect(reset).not.toHaveBeenCalled();
  });
  it("names the step before a labelled tool runs, and says nothing for an unlabelled one", async () => {
    // tools: save_website { label: "Saving the website…" }, other { no label }; one round calls both
    expect(order).toEqual(["step:Saving the website…", "ran:save_website", "ran:other"]);
  });
  it("gives the model no way to send words when a structured answer is owed", async () => {
    // answer: z.object({ ok: z.boolean() }), on: { text }
    expect(seen[0].onText).toBeUndefined(); expect(text).not.toHaveBeenCalled();
  });
  it("runs exactly as before when no callbacks are given", async () => {
    expect(await runAgent({ ...base, model, tools: saveWebsite() })).toEqual({ text: "Hello", ran: [] });
  });
  ```

- [ ] **Step 2: Run them.** `npx vitest run src/lib/journey/__tests__/agent.test.ts` → Expected: the six new tests FAIL (callbacks never called; `label` unknown).

- [ ] **Step 3: Implement in `runAgent`.** Each model call is given `onText` only when `on?.text` is set and no `answer` is owed; the wrapper sets a local `wrote = true` and forwards the delta. After a reply that has calls: if `wrote`, call `on.reset?.()` and set `wrote = false`. Before `runCall` for a call whose tool has `label`: `on.step?.(label)`. Nothing else in the loop changes, including the `ends` return.

- [ ] **Step 4: Run.** Same command → Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit.** `feat(journey): the agent loop reports words, resets and steps as they happen`

### Task 2: The OpenAI adapter streams words when asked

**Files:**
- Modify: `src/lib/journey/agent-model.ts`
- Test: `src/lib/journey/__tests__/agent-model.test.ts` (create)

**Interfaces:**
- Consumes: `AgentModel` input `onText` (Task 1).
- Produces: no signature change. `openaiAgentModel(modelId)` calls `responses.stream(...)` when `onText` is given, `responses.create(...)` otherwise.

- [ ] **Step 1: Write the failing tests.** Mock `server-only` and `@/lib/openai/server` so `createOpenAI()` returns `{ responses: { create, stream } }`. `stream` returns `{ on(event, cb) { handlers[event] = cb; return this; }, finalResponse: async () => { handlers["response.output_text.delta"]?.({ delta: "Hi" }); return RESPONSE; } }`, where `RESPONSE = { output: [], output_text: "Hi" }`.

  ```ts
  it("streams and forwards each piece of text when words are wanted", async () => {
    const out = await model({ system: "s", messages: [], tools: {}, rounds: [], onText });
    expect(stream).toHaveBeenCalledTimes(1); expect(create).not.toHaveBeenCalled();
    expect(onText).toHaveBeenCalledWith("Hi"); expect(out).toEqual({ text: "Hi", calls: [] });
  });
  it("does not stream when no words are wanted", async () => {
    await model({ system: "s", messages: [], tools: {}, rounds: [] });
    expect(create).toHaveBeenCalledTimes(1); expect(stream).not.toHaveBeenCalled();
  });
  it("sends the same request either way", async () => {
    expect(stream.mock.calls[0][0]).toEqual(create.mock.calls[0][0]);   // same model, instructions, input, tools
    expect(stream.mock.calls[0][1]).toEqual({ timeout: 20_000, maxRetries: 0 });
  });
  ```

- [ ] **Step 2: Run.** `npx vitest run src/lib/journey/__tests__/agent-model.test.ts` → Expected: FAIL (`stream` never called).

- [ ] **Step 3: Implement.** Build the request body once. With `onText`: `const s = client.responses.stream(body, opts); s.on("response.output_text.delta", (e) => onText(e.delta)); const response = await s.finalResponse();`. Without: `create` as today. Everything after `response` (carrying output, reading calls, the structured answer) is unchanged.

- [ ] **Step 4: Run.** Same command → PASS. Then `npx tsc --noEmit -p .` → Expected: no new errors (one known error in `src/app/api/nodes/[id]/image-generate/route.test.ts`).

- [ ] **Step 5: Commit.** `feat(journey): the OpenAI adapter streams a reply's words when the caller wants them`

### Task 3: The brand KB turn names its steps and reports saves

**Files:**
- Modify: `src/lib/journey/kb-copilot/turn.ts`
- Test: `src/lib/journey/kb-copilot/__tests__/turn.test.ts`

**Interfaces:**
- Consumes: `AgentEvents`, `AgentTool.label` (Task 1).
- Produces:
  ```ts
  export type KbTurnEvents = AgentEvents & {
    /** A website or handles were just stored. */  saved?: (saved: KbSaved) => void;
    /** Something on the page that `saved` cannot carry was just written: a field, a build. */  page?: () => void };
  // runKbTurn's input gains:  on?: KbTurnEvents
  ```

- [ ] **Step 1: Write the failing tests.**

  ```ts
  it("reports a saved website the moment it is stored, before the turn returns", async () => {
    // model: one round calling save_website; on.saved records
    expect(saved).toHaveBeenCalledWith({ website: "acme.com" });
  });
  it("reports only the handles that were stored", async () => {
    expect(saved).toHaveBeenCalledWith({ instagram: "acme" });
  });
  it("says the page changed when a field is written and when a build starts", async () => {
    // review turn: answer_field written → page called once; start_build → page called once
  });
  it("does not say the page changed when a write was refused", async () => {
    // setField resolves false; start_build while one is running
    expect(page).not.toHaveBeenCalled();
  });
  it("labels the tools that change the page, and no others", () => {
    // capture the tools given to the model on its first call
    expect(labels).toEqual({ save_website: "Saving the website…", save_socials: "Saving the handles…",
      answer_field: "Saving your answer…", confirm_field: "Saving your answer…", start_build: "Starting the build…" });
  });
  it("passes the model's words and resets through", async () => {
    expect(order).toEqual(["text:Let me", "reset", "text:Started."]);
  });
  ```

- [ ] **Step 2: Run.** `npx vitest run src/lib/journey/kb-copilot/__tests__/turn.test.ts` → Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** Add the five `label`s. In `save_website` after the store: `input.on?.saved?.({ website: saved.website })`. In `save_socials`: `on.saved` with only the stored keys. In `settle` when `written`, and in `start_build` after `actions.startBuild()` returns: `input.on?.page?.()`. Pass `{ text, reset, step }` from `input.on` to `runAgent` as `on`.

- [ ] **Step 4: Run.** Same command → PASS, all tests in the file.

- [ ] **Step 5: Commit.** `feat(journey): the brand KB turn names its steps and reports each save as it is stored`

### Task 4: The turn route answers as event lines and finishes on its own

**Files:**
- Create: `src/lib/journey/thread/turn-events.ts`
- Modify: `src/app/api/clients/[id]/copilot/kb/turn/route.ts`
- Test: `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`

**Interfaces:**
- Consumes: `KbTurnEvents` (Task 3).
- Produces:
  ```ts
  // turn-events.ts
  export type KbTurnEvent =
    | { type: "step"; text: string } | { type: "text"; delta: string } | { type: "reset" }
    | { type: "saved"; saved: KbSaved } | { type: "page" }
    | { type: "state"; state: ThreadState; changed: boolean; saved: KbSaved }
    | { type: "error"; error: string };
  export const NDJSON_HEADERS = { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" } as const;
  ```
  The `state` line is the object the route returns as JSON today.

- [ ] **Step 1: Change the test helpers, then write the failing tests.** Add `const events = async (res: Response) => (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l))` and `const last = async (res: Response) => (await events(res)).at(-1)`. Every existing assertion on `await res.json()` for a 200 answer becomes an assertion on `await last(res)` with `type: "state"` added; 400 answers stay `res.json()`. Mock `after` from `next/server` so it records its callback: `vi.mock("next/server", async (orig) => ({ ...(await orig()), after: vi.fn((cb) => { afterWork.push(cb); }) }))`. New tests:

  ```ts
  it("answers as event lines, ending with the state", async () => {
    expect(res.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
    expect((await events(res)).at(-1)).toEqual({ type: "state", state: STATE, changed: false, saved: {} });
  });
  it("sends a step, then the save, then the state, in that order", async () => {
    // runKbTurn mock calls on.step("Saving the website…"), then actions.saveWebsite, then on.saved({ website })
    expect((await events(res)).map((e) => e.type)).toEqual(["step", "saved", "state"]);
  });
  it("sends words and a reset as the turn reports them", async () => {
    expect((await events(res)).slice(0, 3)).toEqual([{ type: "text", delta: "Let me" }, { type: "reset" }, { type: "text", delta: "Done." }]);
  });
  it("still refuses bad input as plain JSON, before anything streams", async () => {
    expect(res.status).toBe(400); expect(res.headers.get("content-type")).toMatch(/json/);
  });
  it("stores the reply even when the browser has gone away", async () => {
    const res = await POST(post({ text: "hi", attachments: [] }), { params });
    await res.body!.cancel();                       // nobody is reading
    await Promise.all(afterWork.map((cb) => cb()));  // the work the route asked to be finished
    expect(insertCopilotMessages).toHaveBeenCalledTimes(2);   // the message, then the reply
  });
  it("sends an error line when the turn cannot finish, after the message was stored", async () => {
    vi.mocked(loadThread).mockRejectedValue(new Error("down"));
    expect((await events(res)).at(-1)).toEqual({ type: "error", error: "The copilot could not answer." });
  });
  it("keeps a save that was already sent when the agent then fails", async () => {
    // runKbTurn: saveWebsite, on.saved, then throws
    const all = await events(res);
    expect(all.find((e) => e.type === "saved")).toBeTruthy();
    expect(all.at(-1)).toMatchObject({ type: "state", changed: true });
    expect(vi.mocked(insertCopilotMessages).mock.calls[1][3][0].content).toBe(KB_TURN_FAILED_AFTER_SAVE_REPLY);
  });
  ```

- [ ] **Step 2: Run.** `npx vitest run "src/app/api/clients/[id]/copilot/kb/turn/route.test.ts"` → Expected: FAIL (the route answers JSON).

- [ ] **Step 3: Implement.** Everything up to and including storing the person's message stays as it is and still answers JSON on refusal. From there the body becomes `const work = (async () => { … })()` run inside a `ReadableStream`'s `start`, with `emit` wrapping `controller.enqueue` in `try { } catch { }` so a closed stream never throws into the turn. `runKbTurn` gets `on: { step: (text) => emit({ type: "step", text }), text: (delta) => emit({ type: "text", delta }), reset: () => emit({ type: "reset" }), saved: (saved) => emit({ type: "saved", saved }), page: () => emit({ type: "page" }) }`. The existing agent-failure catch, the walk messages, the reply insert, `revalidatePath` and `loadThread` are unchanged; the last line emits `{ type: "state", state, changed: refresh, saved }`. An outer catch logs and emits `{ type: "error", error: "The copilot could not answer." }`; `finally` closes the controller (also in a try/catch). Register `after(() => work)` before returning `new NextResponse(stream, { headers: NDJSON_HEADERS })`, so the platform keeps the function alive until the work is done.

- [ ] **Step 4: Run.** Same command → PASS, all tests in the file.

- [ ] **Step 5: Commit.** `feat(journey): the brand KB turn answers as event lines and finishes even if the browser leaves`

### Task 5: One line reader, and the thread service reads events

**Files:**
- Create: `src/services/read-ndjson.ts`
- Modify: `src/services/script-generate.service.ts`, `src/services/copilot-thread.service.ts`
- Test: `src/services/__tests__/read-ndjson.test.ts` (create)

**Interfaces:**
- Consumes: `KbTurnEvent` (Task 4).
- Produces:
  ```ts
  /** Calls `onLine` with each complete, non-blank line of a streamed body, parsed as JSON, in order. */
  export async function readNdjson<T>(body: ReadableStream<Uint8Array>, onLine: (line: T) => void): Promise<void>;
  // copilotThreadService
  kbTurn(clientId: string, body: KbTurnBody, onEvent?: (event: KbTurnEvent) => void): Promise<KbTurnResult>;
  ```
  `kbTurn` resolves with the `state` line's `{ state, changed, saved }`, throws `Error(event.error)` on an `error` line, and throws `"The copilot could not answer."` if the stream ends with no `state`. A non-OK answer or one with no body goes through `readJson` as today.

- [ ] **Step 1: Write the failing tests** for `readNdjson`, feeding a `ReadableStream` built from byte chunks:

  ```ts
  it("yields each line once, in order", …);            // "a\nb\n" → [a, b]
  it("joins a line split across two chunks", …);        // '{"type":"te' + 'xt"}\n'
  it("joins a multi-byte character split across two chunks", …);  // "…" cut between its bytes
  it("yields a last line that has no newline after it", …);
  it("skips blank lines", …);
  it("stops and rejects when a handler throws", …);
  ```

- [ ] **Step 2: Run.** `npx vitest run src/services/__tests__/read-ndjson.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 3: Implement `readNdjson`** by moving the reader loop out of `scriptGenerateService.turn` (reader, `TextDecoder` with `{ stream: true }`, buffer split on `"\n"`, the remainder handled at the end). `scriptGenerateService.turn` then calls it with its existing `handle` logic; its behaviour and signature do not change.

- [ ] **Step 4: Implement `kbTurn`** as specified under Interfaces, calling `onEvent?.(event)` for every line before acting on `state` and `error`.

- [ ] **Step 5: Run.** `npx vitest run src/services src/components/scripts src/lib/scripts` → Expected: PASS (the script copilot's own tests still pass).

- [ ] **Step 6: Commit.** `refactor(services): one reader for streamed lines; the copilot thread service reads turn events`

### Task 6: The turn hook applies events and exposes progress

**Files:**
- Create: `src/lib/journey/thread/turn-progress.ts`
- Modify: `src/hooks/queries/copilot-thread.ts`
- Test: `src/lib/journey/thread/__tests__/turn-progress.test.ts` (create)

**Interfaces:**
- Consumes: `KbTurnEvent`, `kbTurn(…, onEvent)` (Tasks 4, 5), `nextSavedEvent` and `copilotThreadKeys.saved` (D501).
- Produces:
  ```ts
  // turn-progress.ts
  export type TurnProgress = { step: string | null; text: string };
  export const NO_PROGRESS: TurnProgress = { step: null, text: "" };
  export function applyTurnEvent(progress: TurnProgress, event: KbTurnEvent): TurnProgress;
  // copilot-thread.ts: useSendKbTurn(clientId) returns the mutation with one more field
  //   progress: TurnProgress   (NO_PROGRESS whenever no turn is running)
  ```

- [ ] **Step 1: Write the failing tests** for `applyTurnEvent`:

  ```ts
  it("shows the step it is told", …);                          // step → { step: "Saving the website…", text: "" }
  it("adds words as they arrive and drops the step line", …);   // text, text → { step: null, text: "Hello" }
  it("clears the words on a reset", …);                         // text then reset → NO_PROGRESS
  it("replaces half-written words when a step follows", …);     // text then step → { step, text: "" }
  it("ends with nothing shown on the final state and on an error", …);
  it("leaves progress alone for a save and for a page change", …);  // returns the same object
  ```

- [ ] **Step 2: Run.** `npx vitest run src/lib/journey/thread/__tests__/turn-progress.test.ts` → Expected: FAIL (module missing).

- [ ] **Step 3: Implement `applyTurnEvent`**, a switch on `event.type` with exactly the outcomes above.

- [ ] **Step 4: Implement in `useSendKbTurn`.** Hold `progress` in `useState(NO_PROGRESS)`. `mutationFn` passes an `onEvent` that: sets progress with `applyTurnEvent`; on `saved`, writes `nextSavedEvent(previous, event.saved)` to `copilotThreadKeys.saved(clientId)`; on `page`, calls `router.refresh()`. `onSuccess` keeps setting the thread and calling `router.refresh()` when `changed`, and no longer writes the saved event (the `saved` line already did). `onSettled` sets progress back to `NO_PROGRESS`. `onMutate` and `onError` are unchanged. Return `{ ...mutation, progress }`.

- [ ] **Step 5: Run.** `npx vitest run src/lib/journey src/hooks/queries` → PASS. `npx tsc --noEmit -p .` → no new errors.

- [ ] **Step 6: Commit.** `feat(journey): the turn hook applies saves as they arrive and exposes what the copilot is doing`

### Task 7: The panel shows the step and the words

**Files:**
- Modify: `src/components/journey/kb-copilot.tsx`

**Interfaces:**
- Consumes: `turn.progress` (Task 6); the existing `ThreadStatusLines` and the shared chat text component already used by `thread-message.tsx`.

- [ ] **Step 1: Implement.** While `busy`: if `turn.progress.text` is not empty, draw it as an assistant message in the list, in the same bubble a stored reply uses, with no buttons; otherwise draw `ThreadStatusLines` with one running line whose text is `turn.progress.step ?? "Working on it…"`. Add `turn.progress.text.length` and `turn.progress.step` to the dependencies of the effect that scrolls to the end. Nothing else in the panel changes: buttons, the waiting block and the gate card stay hidden while `busy`, as today.

- [ ] **Step 2: Check types and lint.** `npx tsc --noEmit -p .` and `npx eslint src/components/journey src/hooks/queries src/services src/lib/journey "src/app/api/clients/[id]/copilot"` → Expected: no new errors or warnings.

- [ ] **Step 3: Run the whole suite.** `npx vitest run` → Expected: everything passes except the two known failures in `src/app/api/nodes/[id]/composite-generate/route.test.ts` and `image-generate/route.test.ts`.

- [ ] **Step 4: Commit.** `feat(journey): the brand KB panel shows the step in progress and the reply as it is written`

### Task 8: Record it

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7)
- Modify: this plan (an Outcome section)

- [ ] **Step 1: Append D503** to the ADR log: a copilot turn answers as newline-delimited JSON event lines ending in one `state` line, the loop reports through optional callbacks and stays pure, and the turn is finished under `after` so a closed tab never loses a reply. Why, rejected (a second request or a realtime channel for progress; server-sent events as a separate format beside D337's), refines D337, D497, D502.
- [ ] **Step 2: Append an Outcome section** to this plan: departures from it, what the review changed, what is left for later, and what was not verified (nothing here is run in a browser by the implementer; the streamed OpenAI call is first exercised by Cyril's test).
- [ ] **Step 3: Add an entry to the team journal** (artifact `7yU5A2TiWyxDLTwgaXpjHC`, "How we got here") and set piece 2.4 on its map to Built.
- [ ] **Step 4: Commit.** `docs(adr): D503, how a copilot turn sends its work to the browser`

## How Cyril tests it

1. Restart `npm run dev`. Open a new client's Brand KB tab.
2. Send a website. The line under your message changes to "Saving the website…", the form on the right fills, and then the fixed reply appears.
3. Send "start the build". The line reads "Starting the build…" and the page switches to the build view before the reply has finished appearing.
4. On a client whose KB is in review, answer a question in your own words. "Saving your answer…" shows, the field on the right updates, and the copilot's short acknowledgement appears word by word, followed by the next question.
5. Ask it something that needs no tool ("what do you still need from me?"). The reply appears word by word.
6. Send a message and close the tab at once. Reopen the client: the reply is in the thread.

## Outcome (2026-11-18)

Built as planned in seven commits, then one review and one fix pass (`8211af86..e3cd5921`, unpushed). Recorded as D503.

**Departures from the plan**
- The route tests read the answer through one `send` helper that waits for the whole stream, in place of rewriting each assertion.
- `readNdjson` also cancels the reader if a handler throws, so a broken turn stops downloading.

**What the review changed**
- A streamed reply that needed a second model call would have been refused by OpenAI: the SDK's streamed response adds `parsed_arguments` and `parsed`, which the API does not take back as input. It is now sent back through the SDK's `toResponseInputItems`.
- The 20-second limit only covered the start of a streamed call; it now covers the whole reply.
- Words written beside reply buttons appeared, vanished and were written again. Reply buttons are now a `quiet` tool, and those words stay as the reply. *(My rule, narrower than the reviewer's: only `reply_choices` is quiet, because skip, keep-asking and stop-asking can return a refusal the model must see.)*
- A thread read in flight when a turn finished could put the older thread back for up to 20 seconds (from before this change). The finished thread is now written after cancelling it.

**Left for later (minor)**
- A one-frame "Working on it…" between the last word and the stored message.
- `revalidatePath` now runs after the answer has started; the browser's own re-read does the work.
- Two saves arriving in one network chunk show only the second until the end of the turn.
- "Saving the website…" shows even when the tool then refuses.
- A failed or cut-off stream reads like a reply, as a failed plain call already did.

**Not verified**
- Nothing here was run in a browser or against the real OpenAI API by the implementer. The first streamed call to OpenAI is Cyril's test.
- That `after()` keeps the function alive after a disconnect on Vercel shows only on staging.
