# Brand KB Change Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a person has reviewed a field, the copilot changes it only through a change card (each field before and after, where the new value came from, keep or drop each, approve or discard), whether the change comes from the chat, a new document, "Save & re-analyze" or a removed source; the KB stays approved throughout.

**Architecture:** A change card is a `change` card on a message in the onboarding thread (D496): the thread is its only store, so pending cards survive a reload and refusals are read back from settled cards. A change stated in the chat is turned into a card inside the turn (a new `propose_change` tool). A change from documents is worked out in the background (a new `kb-propose` Trigger.dev task and `background_jobs` kind), which writes the card into the thread when it is done. Approving claims the card once, skips any field changed by hand since the card was made, and writes the kept fields with the existing per-field merge (`patchKBFields`, D498).

**Tech Stack:** Next.js 16 route handlers, Supabase (PostgREST JSON-path selects, no migration), Trigger.dev v4 task, OpenAI Responses `parse` with `zodTextFormat`, TanStack Query v5, shadcn Base UI, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-12-copilot-journey-brand-kb-design.md](../specs/2026-11-12-copilot-journey-brand-kb-design.md) §2.4, §2.5, §3, §5, §6, §8. Decisions it builds on: D496 (the thread), D497 (the loop), D498 (per-field writes), D499 (code words the walk), D500 (waiting is derived), D502/D503 (streaming), D504 (images studied on send). Next ADR number: D505.

## Global Constraints

- Nothing is pushed or merged. **No migration**: the card lives in `client_copilot_messages.card` (jsonb), and `background_jobs.kind` is plain text.
- "The copilot never overwrites a field a person has reviewed without a change card." Boundary (spec §2.5, my call there): a field still `needs_review` may be written directly by the copilot (today's `answer_field` / `confirm_field`); a field that is `approved`, `edited` or `rejected` only through a card.
- Every copilot change to a reviewed field gets a card, even one field.
- "The KB stays approved throughout. Nothing locks." Applying a card never changes `kb_status`.
- Applied fields are written as `{ value: after, status: "approved", evidence_type: "explicit", confidence: "high" }`.
- A card names where each value came from: `"You, in this chat"`, a document's file name, or `"No remaining source supports it"`.
- A refused change is remembered per (document, field): a discarded card, or a field dropped on an approved card, is not proposed again from that document.
- A field changed by hand after the card was made is shown as out of date and is never overwritten by approving.
- Image Analysis is not proposed on (it gets its own card in piece 2b). Only the 43 review fields (`REVIEW_FIELD_PATHS`) can appear on a card.
- Long or paid work runs in Trigger.dev, `retry: { maxAttempts: 1 }` (performance rule 12).
- Polled reads stay small: the KB is never downloaded by the thread read; only the paths on pending cards are read, by JSON path (rule 8).
- Copy, word for word:
  - Card buttons: `Approve 1 change` / `Approve N changes`, `Discard`. Per field: a checkbox labelled `Keep`.
  - Card footers once settled: `Approved by {name}: {k} of {n} changed.` / `Discarded by {name}.`
  - Out of date line on a field: `Changed by hand since. Approving leaves it as it is.`
  - Reply after `propose_change`: `Here is the change. Nothing changes until you approve it.`
  - Card message from documents: `{names} would change {n} field(s).` / nothing to change: `Read {names}. Nothing in it changes the brand KB.`
  - Removal card message: `Without {names}, {n} field(s) are no longer supported.`
  - Step lines: `Preparing the change…` (tool), `Reading {names}…` (background).
  - Waiting label: `Approve the change` (one pending card) / `Approve {n} changes`.
  - Image Analysis note: `Studied the images again. Changed: {labels}.`

## Review Focus

1. **Two people approve the same card at the same moment.** It is applied once; the second gets "That change was already settled." (Task 3)
2. **The KB was rebuilt or replaced after the card was made.** Approving applies nothing and says the card no longer applies. (Task 3)
3. **A document proposes a value equal to what is already there, or a field outside the 43.** It never reaches a card. (Task 5)
4. **The proposal run fails part-way (model error, unreadable file).** The job ends failed with a plain line in the thread; no half card. (Task 5)
5. **A card whose fields were all changed by hand since.** Approving changes nothing and says so; it is not reported as "applied 0 of 0". (Task 3)

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/journey/thread/schema.ts` (modify) | The `change` card and its settled form |
| `src/lib/kb/changes/card.ts` (create) | Pure: build a card from proposed values, decide an approval, refusal keys |
| `src/lib/db/kb.ts` (modify) | `readKBFieldValues(versionId, paths)` by JSON path |
| `src/lib/db/copilot-messages.ts` (modify) | `claimChangeCard`, `setMessageCard`, `listSettledChangeCards` |
| `src/app/api/clients/[id]/copilot/changes/[messageId]/route.ts` (create) | Approve or discard a card |
| `src/lib/journey/kb-copilot/turn.ts`, `src/prompts/kb-copilot.ts` (modify) | `propose_change` tool and its instructions |
| `src/lib/kb/changes/propose.ts`, `src/prompts/kb-propose.ts`, `trigger/kb-propose.ts`, `src/lib/kb/changes/start.ts` (create) | The background proposal from documents |
| `src/lib/kb/document-input.ts` (create) | Turning documents into model input (moved out of the re-extract route) |
| `src/app/api/clients/[id]/kb/propose/route.ts` (create) | What "Save & re-analyze" calls |
| `src/lib/journey/kb-copilot/{load,context,waiting}.ts`, `src/lib/journey/thread/load.ts` (modify) | Status line, waiting on a card, out-of-date fields |
| `src/components/journey/thread-change-card.tsx` (create), `thread-message.tsx`, `kb-copilot.tsx` (modify) | The card in the panel |
| `src/services/copilot-thread.service.ts`, `src/hooks/queries/copilot-thread.ts` (modify) | `decideChange` and `useDecideChange` |
| Removed | `kb/re-extract` and `kb/re-analyze` routes, the "Refine with AI" button and its handler |

---

### Task 1: The change card, and the rules for building and settling it

**Files:**
- Modify: `src/lib/journey/thread/schema.ts`
- Create: `src/lib/kb/changes/card.ts`
- Test: `src/lib/kb/changes/__tests__/card.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // schema.ts — added to the card union
  export type ChangeField = { path: string; label: string; before: unknown; after: unknown; from: string; docId: string | null };
  export type ChangeCard = {
    kind: "change"; versionId: string;
    status: "pending" | "applied" | "discarded" | "stale";
    fields: ChangeField[];
    decision: { by: string; byId: string | null; at: string; kept: string[]; outOfDate: string[] } | null;
  };
  // ThreadMessage gains, at read time only (never stored):  outOfDate?: string[]
  // card.ts
  export function buildChangeCard(input: { versionId: string; current: TraceableBrandKB; proposals: { path: string; value: unknown; from: string; docId: string | null }[]; refused: Set<string> }): ChangeCard | null;
  export function decideChange(card: ChangeCard, input: { keep: string[]; currentValues: Record<string, unknown>; activeVersionId: string | null }):
    | { kind: "stale" } | { kind: "apply"; patches: KBFieldPatch[]; kept: string[]; outOfDate: string[] };
  export function refusedKeys(cards: ChangeCard[]): Set<string>;   // keys `${docId}|${path}`
  export function outOfDatePaths(card: ChangeCard, currentValues: Record<string, unknown>): string[];
  export const sameValue: (a: unknown, b: unknown) => boolean;   // list order and surrounding whitespace ignored
  ```

- [ ] **Step 1: Write the failing tests.**

  ```ts
  describe("buildChangeCard", () => {
    it("lists each proposed field with its label, before, after and source", …);
    it("leaves out a value equal to what is there, ignoring list order and spaces", …);
    it("leaves out a path that is not one of the 43 review fields, including image_analysis", …);
    it("leaves out a change from a document that was refused before", …);       // refused has `${docId}|${path}`
    it("keeps a change the person states in the chat even if a document's was refused", …); // docId null
    it("returns null when nothing is left", …);
  });
  describe("decideChange", () => {
    it("writes each kept field as approved, stated by the person", …);
    // patch: { value: after, status: "approved", evidence_type: "explicit", confidence: "high" }
    it("writes nothing for a dropped field", …);
    it("skips a field changed by hand since the card was made, and reports it", …);
    it("says the card is stale when the active KB is a different version", …);
    it("ignores a kept path that is not on the card", …);
  });
  describe("refusedKeys", () => {
    it("remembers every field of a discarded card from a document", …);
    it("remembers only the dropped fields of an approved card", …);
    it("remembers nothing from a chat change or a pending card", …);
  });
  ```

- [ ] **Step 2: Run.** `npx vitest run src/lib/kb/changes` → Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Add the zod schema for `change` to the card union (`fields` at least 1). Labels come from `reviewFields` (`src/lib/journey/kb-copilot/review.ts`). `currentValues` maps path → stored value.
- [ ] **Step 4: Run.** Same command, plus `npx vitest run src/lib/journey` → PASS.
- [ ] **Step 5: Commit.** `feat(kb): the change card, and the rules for building and settling it`

### Task 2: Reading what a card needs from the database

**Files:**
- Modify: `src/lib/db/kb.ts`, `src/lib/db/copilot-messages.ts`
- Test: `src/lib/db/__tests__/kb-field-values.test.ts`, `src/lib/db/__tests__/copilot-change-cards.test.ts` (create; mock the Supabase builder as `src/lib/jobs/reconcile.test.ts` does)

**Interfaces:**
- Produces:
  ```ts
  /** The stored values at these dotted paths of one KB version, by PostgREST JSON path, never the whole KB. Throws on error. */
  export async function readKBFieldValues(versionId: string, paths: string[]): Promise<Record<string, unknown>>;
  /** Sets a pending change card to `next` only if it is still pending. False when someone settled it first. */
  export async function claimChangeCard(clientId: string, messageId: string, next: ChangeCard): Promise<boolean>;
  export async function setMessageCard(clientId: string, messageId: string, card: ThreadCard): Promise<void>;
  /** Every settled change card of the client's onboarding thread, however old (no read limit). */
  export async function listSettledChangeCards(clientId: string): Promise<ChangeCard[]>;
  ```

- [ ] **Step 1: Write the failing tests.** `readKBFieldValues` selects `output->brand_profile->tagline->value` style columns (alias per path) from `client_kb_versions` for `id = versionId`, and returns `{}` for no paths without querying. `claimChangeCard` filters `card->>status = pending` and returns false on no row. `listSettledChangeCards` filters `card->>kind = change` and `card->>status in (applied, discarded)`.
- [ ] **Step 2: Run.** `npx vitest run src/lib/db/__tests__` → FAIL.
- [ ] **Step 3: Implement** as specified. Path segments are checked against `isPatchablePath` before they reach a select.
- [ ] **Step 4: Run.** Same → PASS.
- [ ] **Step 5: Commit.** `feat(kb): read single fields by path, and claim or list change cards`

### Task 3: Approving or discarding a card

**Files:**
- Create: `src/app/api/clients/[id]/copilot/changes/[messageId]/route.ts`, its `route.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `patchKBFields` (D498); `resolveDisplayNames` as `approveKB` uses it.
- Produces: `POST /api/clients/:id/copilot/changes/:messageId` with `{ decision: "approve", keep: string[] } | { decision: "discard" }` → `{ state: ThreadState }`.

- [ ] **Step 1: Write the failing tests.**

  ```ts
  it("applies the kept fields, records who approved, and leaves kb_status alone", …);
  it("discards: writes nothing to the KB, records who discarded", …);
  it("applies a card once when two approvals race: the second gets 409 'That change was already settled.'", …);
  it("does not overwrite a field changed by hand since, and records it as out of date", …);
  it("marks the card stale and writes nothing when the active KB is another version", …);
  it("says nothing was changed when every kept field was changed by hand since", …);  // decision.kept = []
  it("puts the card back as pending when the write fails, so it can be tried again", …);
  it("refuses a message that is not a change card on this client's thread (404)", …);
  it("refuses a body that is neither approve nor discard (400)", …);
  ```

- [ ] **Step 2: Run.** `npx vitest run "src/app/api/clients/[id]/copilot/changes"` → FAIL.
- [ ] **Step 3: Implement.** `withClient` + `withTryCatch`. Read the message, the caller and the active version in parallel. Read `readKBFieldValues(card.versionId, card.fields paths)`. Run `decideChange`. Claim the card with its settled form, then `patchKBFields(versionId, patches)` (no `onlyUnreviewed`); on a write error, `setMessageCard` back to the pending card and rethrow. `revalidatePath` the KB page. Return `{ state: await loadThread(client) }`.
- [ ] **Step 4: Run.** Same → PASS.
- [ ] **Step 5: Commit.** `feat(journey): approve or discard a change card, once, without overwriting a hand edit`

### Task 4: A change stated in the chat becomes a card

**Files:**
- Modify: `src/lib/journey/kb-copilot/turn.ts`, `src/prompts/kb-copilot.ts`, `src/app/api/clients/[id]/copilot/kb/turn/route.ts`
- Test: `src/lib/journey/kb-copilot/__tests__/turn.test.ts`, `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`, `src/prompts/__tests__/kb-copilot.test.ts` (if present; otherwise assert on the system text in the turn test)

**Interfaces:**
- Consumes: `buildChangeCard` (Task 1).
- Produces: `runKbTurn` result gains `card: ChangeCard | null`. `KbTurnInput` gains `kb: { versionId: string; output: TraceableBrandKB } | null` (the route already reads the active version when in review; it now reads it whenever the client has one).

- [ ] **Step 1: Write the failing tests.**

  ```ts
  it("turns a change to a reviewed field into a card, sourced to the person, and ends the turn with the fixed reply", …);
  // propose_change { changes: [{ field, value }] } → result.card.fields[0].from === "You, in this chat"
  // reply === "Here is the change. Nothing changes until you approve it."; model asked once
  it("labels the step 'Preparing the change…'", …);
  it("still fills an unreviewed field directly during the first review", …);   // answer_field unchanged
  it("refuses answer_field on a reviewed field and points the model to propose_change", …);
  it("refuses a change that equals what is there", …);   // tool output: "That is already the value."
  it("puts every field of one turn on one card", …);     // two calls in one round → one card, two fields
  // route
  it("stores the card as its own message after the reply, in the same insert", …);
  ```

- [ ] **Step 2: Run.** `npx vitest run src/lib/journey/kb-copilot "src/app/api/clients/[id]/copilot/kb"` → FAIL.
- [ ] **Step 3: Implement.** `propose_change` schema `{ changes: { field: fieldArg; value: string | string[] }[] }` (1 to 10), `label: "Preparing the change…"`, `ends: true`; values coerced as `answer_field` does; fields still `needs_review` are refused with the sentence `That field is not reviewed yet. Use answer_field.` `REVIEWED_LOCKED` becomes `That field is already reviewed. Use propose_change to suggest a new value; the person approves it.` In the prompt, replace "Changing reviewed fields from the chat comes in a later step…" with instructions to call `propose_change` with only what the person said, and to tell the person nothing changes until they approve. The route inserts `{ role: "assistant", content: "", card }` after the reply when `card` is set.
- [ ] **Step 4: Run.** Same → PASS.
- [ ] **Step 5: Commit.** `feat(journey): a change to a reviewed field asked for in the chat comes back as a change card`

### Task 5: A change from documents is worked out in the background

**Files:**
- Create: `src/lib/kb/document-input.ts`, `src/prompts/kb-propose.ts`, `src/lib/kb/changes/propose.ts`, `src/lib/kb/changes/start.ts`, `trigger/kb-propose.ts`
- Modify: `src/lib/jobs/types.ts` (`JobKind` gains `"kb-propose"`), `src/lib/jobs/reconcile.ts` (`RECONCILED_JOB_KINDS` gains it)
- Test: `src/lib/kb/changes/__tests__/propose.test.ts`, `src/lib/kb/changes/__tests__/start.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `insertCopilotMessages`, `ensureOpening`; the job helpers (`insertJob`, `startJob`, `setJobPhase`, `succeedJob`, `failJob`).
- Produces:
  ```ts
  export type KbProposeInput = { added: { id: string; name: string }[]; removed: string[] };   // removed = file names
  export async function startKbProposal(clientId: string, userId: string | null, input: KbProposeInput): Promise<void>;  // no lock: each run is its own card
  export async function runKbProposal(jobId: string, deps?: { model?: ProposeModel }): Promise<void>;
  export type ProposeModel = (args: { system: string; content: unknown[] }) => Promise<{ changes: { path: string; value: string | string[] | null; document: string }[] }>;
  export async function documentInput(docs: ClientKBDocumentRow[]): Promise<unknown[]>;   // moved from re-extract
  ```

- [ ] **Step 1: Write the failing tests** (model injected, database mocked):

  ```ts
  it("writes one card from the added documents, each value sourced to its document by name", …);
  it("reads the remaining sources after a removal and proposes what they no longer support", …);  // from: "No remaining source supports it"
  it("does not propose a change refused before from the same document", …);
  it("says nothing changes, with no card, when the model proposes nothing or only equal values", …);
  it("ends the job failed with a plain line in the thread, and no card, when the model fails", …);
  it("names the step 'Reading brand-guidelines.pdf…' while it runs", …);
  it("does nothing when the client has no KB version any more", …);
  it("starting it inserts one job and triggers one run; a failed trigger fails the job", …);
  ```

- [ ] **Step 2: Run.** `npx vitest run src/lib/kb/changes` → FAIL.
- [ ] **Step 3: Implement.** `documentInput` is the loop moved out of `re-extract/route.ts` unchanged. The prompt (`kbProposePrompt`, model `kbExtractPrompt.model`) is given the current value of each of the 43 fields (`path | label | value`) and the material, and returns only fields the material states differently, each with the document's file name; for a removal it is given the remaining sources and returns fields they no longer support, with `value: null` or the value they do support. The run builds the card with `buildChangeCard` (refused from `refusedKeys(await listSettledChangeCards(clientId))`), then inserts one assistant message with the copy from Global Constraints and the card (or the nothing-changes line). `trigger/kb-propose.ts` follows `trigger/image-analysis.ts`: dynamic import, `retry: { maxAttempts: 1 }`, `maxDuration: 600`.
- [ ] **Step 4: Run.** Same → PASS. `npx tsc --noEmit -p .` → no new errors.
- [ ] **Step 5: Commit.** `feat(kb): new documents and removed sources come back as a change card, worked out in the background`

### Task 6: What starts a proposal

**Files:**
- Create: `src/app/api/clients/[id]/kb/propose/route.ts`, its `route.test.ts`
- Modify: `src/app/api/clients/[id]/copilot/kb/turn/route.ts`, `src/components/kb/kb-onboarding-review-step.tsx` (`handleSaveChanges`, `fireReExtract`)
- Delete: `src/app/api/clients/[id]/kb/re-extract/` (route and any test)

**Interfaces:**
- Consumes: `startKbProposal` (Task 5).
- Produces: `POST /api/clients/:id/kb/propose { added: string[] (doc ids), removed: string[] (file names) }` → `{ started: boolean }`. Doc ids are checked against the client's own documents (rule 14).

- [ ] **Step 1: Write the failing tests.**

  ```ts
  // propose route
  it("starts one proposal for the added and removed documents", …);
  it("starts nothing when only images changed", …);              // added: [], removed: [] → started: false
  it("refuses a document id that is not this client's (400)", …);
  it("never changes kb_status", …);
  // turn route
  it("starts a proposal for documents attached to a message once the KB is built", …);
  it("starts no proposal for documents attached before any build", …);
  ```

- [ ] **Step 2: Run** the two route test files → FAIL.
- [ ] **Step 3: Implement.** The review step's "Save & re-analyze" deletes the staged removals as today, then calls the new route through `kbService.propose` with the newly added doc ids and the removed docs' file names, shows `toast.success("Saved. The copilot is reading the changes.")`, and no longer shows the re-extract overlay or navigates. Delete the re-extract route.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit -p .` → no new errors.
- [ ] **Step 5: Commit.** `feat(kb): Save & re-analyze and documents attached in the chat propose changes instead of rebuilding`

### Task 7: The panel knows about cards

**Files:**
- Modify: `src/lib/journey/kb-copilot/load.ts`, `context.ts`, `waiting.ts`, `src/lib/journey/thread/load.ts`
- Test: the matching `__tests__` files

**Interfaces:**
- Consumes: `readKBFieldValues`, `outOfDatePaths` (Tasks 1, 2).
- Produces: `KbContext.proposing: string | null` (the running proposal's phase line); `Waiting` gains `{ kind: "change"; label: string }`; `threadState` attaches `outOfDate` to each pending change message.

- [ ] **Step 1: Write the failing tests.**

  ```ts
  it("shows 'Reading brand-guidelines.pdf…' while a proposal runs, and nothing once it ends", …);
  it("waits on the person while a change card is pending, also on an approved KB", …);  // "Approve the change" / "Approve 2 changes"
  it("a pending card outranks the review task but not a waiting question", …);
  it("marks a field on a pending card that was changed by hand since", …);
  it("reads only the paths on pending cards, and no KB at all when none is pending", …);
  it("fails the thread read when those values cannot be read", …);   // rule 13
  ```

- [ ] **Step 2: Run** `npx vitest run src/lib/journey` → FAIL.
- [ ] **Step 3: Implement.** `loadKbContext` adds `listRecentJobs(clientId, "kb-propose", 1)` to its parallel reads. `kbWaiting` checks pending change cards before the approved-KB early return.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `feat(journey): the panel shows a proposal running, waits on a pending card, and marks fields changed since`

### Task 8: The card on screen

**Files:**
- Create: `src/components/journey/thread-change-card.tsx`
- Modify: `src/components/journey/thread-message.tsx`, `src/components/journey/kb-copilot.tsx`, `src/services/copilot-thread.service.ts`, `src/hooks/queries/copilot-thread.ts`
- Test: `src/hooks/queries/__tests__/copilot-thread.test.ts` (the pure helper below)

**Interfaces:**
- Consumes: the route (Task 3).
- Produces: `copilotThreadService.decideChange(clientId, messageId, body)`; `useDecideChange(clientId)` (on success, `finishTurn` with the returned state and `router.refresh()`); `approveLabel(n: number): string`.

- [ ] **Step 1: Write the failing test** for `approveLabel`: `1 → "Approve 1 change"`, `3 → "Approve 3 changes"`, `0 → "Approve"` (button disabled).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Pending card: for each field its label, `Before` and `After` (lists as comma-separated, null as `none`), the source in `text-muted-foreground`, a `Checkbox` labelled `Keep` (on by default; off and disabled for an out-of-date field, with the out-of-date line), then `Approve N changes` and `Discard` (`Button`). Settled card: the fields read-only and the footer copy. Same card shell as the gate card (`thread-gate-card.tsx`): white, 1px border, `shadow-card`, `rounded-xl`. Buttons disabled while a decision is in flight; an error is a toast.
- [ ] **Step 4: Run** the test, `npx tsc --noEmit -p .`, `npx eslint src/components/journey src/hooks/queries src/services` → PASS, no new errors.
- [ ] **Step 5: Commit.** `feat(journey): the change card in the panel: before and after, keep or drop, approve or discard`

### Task 9: "Refine with AI" is removed

**Files:**
- Modify: `src/components/kb/kb-field-row.tsx`, `src/components/kb/kb-onboarding-review-step.tsx` (and any component passing the refine props between them)
- Delete: `src/app/api/clients/[id]/kb/re-analyze/` (route and any test)

- [ ] **Step 1:** `grep -rn "re-analyze\|onReanalyze\|reanalyzingFields\|Refine with AI" src` → note every hit.
- [ ] **Step 2:** Remove the button, its props, `handleReanalyzeField`, `reanalyzingFields` and the route. Nothing else in the field row changes.
- [ ] **Step 3:** The grep from Step 1 → no hits. `npx tsc --noEmit -p .`, `npx eslint src/components/kb` → no new errors. `npx vitest run src/components/kb src/app/api/clients` → PASS.
- [ ] **Step 4: Commit.** `refactor(kb): remove Refine with AI; a field is changed by typing or by asking in the chat`

### Task 10: Image Analysis says what it changed

**Files:**
- Modify: `src/lib/image-analysis/run.ts`
- Test: `src/lib/image-analysis/__tests__/run.test.ts` (add to the existing file if present)

- [ ] **Step 1: Write the failing tests.**

  ```ts
  it("says in the client's thread which Image Analysis fields a re-study changed, once the KB exists", …);
  // "Studied the images again. Changed: Mood, Colour palette."  card { kind: "note" }
  it("says nothing when no field changed, or when there is no thread yet", …);
  ```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Compare the section's values before and after the write; labels from the Image Analysis field labels the review screen uses. Use `hasCopilotMessages` to skip a client with no thread; a failure to write the note is logged and never fails the run.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit.** `feat(image-analysis): a re-study says in the copilot thread which fields it changed`

### Task 11: Record it

- [ ] **Step 1:** Append **D505** to the ADR log: change cards live in the thread, are settled once by compare-and-set, never overwrite a field changed by hand since, and refusals are read back from settled cards; documents are proposed on in a background `kb-propose` job; "Save & re-analyze" and "Refine with AI" no longer rebuild or rewrite. Why, rejected (a table for cards or refusals; rebuilding the whole KB and diffing it, which re-words every field), refines D318, D496, D498.
- [ ] **Step 2:** Append an Outcome section to this plan.
- [ ] **Step 3:** Add an entry to the team journal (artifact `7yU5A2TiWyxDLTwgaXpjHC`) and set piece 2.3 on its map to Built.
- [ ] **Step 4: Commit.** `docs(adr): D505, change cards on the brand KB`

## How Cyril tests it

Restart `npm run dev` and `npx trigger dev`. Use a client with an approved brand KB.

1. In the chat: "we no longer say chemical-free". A card appears with the affected fields, before and after, "You, in this chat". Untick one, approve. Only the ticked field changes on the right; the KB is still approved.
2. Edit a field on the right and save, then approve an older pending card that names it. That field is shown as changed by hand and is left as you wrote it.
3. Attach a PDF in the chat and send. "Reading … .pdf…" shows, then a card sourced to the PDF. Discard it. Attach the same PDF again: nothing from it is proposed again.
4. In Source files, remove a document and press "Save & re-analyze". A card lists the fields nothing else supports. Nothing is wiped and the KB stays approved.
5. The sparkle "Refine with AI" button is gone from every field.
6. Two browser windows: approve the same card in both. It applies once; the second says it was already settled.
