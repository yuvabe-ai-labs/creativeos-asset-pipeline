# The Brand KB page follows the copilot: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the brand KB copilot asks about or writes a field, the Brand KB page goes to that field, marks it, shimmers it while it is written, and shows the answer land, with the chat answer winning over an unsaved edit of that field.

**Architecture:** The turn stream gains one event per field write (`writing`, then `written` or `unwritten`). The panel folds those events, plus "the asked field changed after my turn", into a small *field activity* record in the TanStack Query cache, the same no-fetch channel D501 uses for saved websites. The page reads that record and the waiting question (from the thread already in the cache, with `skipToken`, so no second poll), moves to the field, marks the row, and adopts the server's value over the draft for the fields the copilot wrote.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5 (`skipToken`, `select`), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-copilot-page-follows-design.md`

## Global Constraints

- Purple sparingly: the marks use `primary` at low opacity (`bg-primary/5`, `ring-primary/20`, `via-primary/10`); never the brand-gradient `.text-shimmer-brand`, which is reserved for the copilot's working line.
- Motion: easing `cubic-bezier(0.22,1,0.36,1)` only, durations from 200/320/500 ms; no springs. `prefers-reduced-motion: reduce` turns the shimmer and the scroll animation off (scroll jumps instead); tint and label stay.
- Label copy, exact: `Copilot is asking`.
- shadcn primitives only; no new native controls.
- Performance: no new request and no new poll. The page reads the thread through the cache only (`queryFn: skipToken`). Per-row work is a lookup in a `Set`, never a scan.
- Only the browser that sent the turn moves; a teammate's turn reaching this browser by the poll changes the mark only.
- The review walk never asks about Image Analysis; nothing here follows it.

## Review Focus

1. **A turn that fails after `writing` was sent** leaves the shimmer running for ever. Expected: any turn end (success or error) clears `writing`. Test in Task 2 (`endTurn`).
2. **Two fields written in one turn** ("age 40+, and there is no tagline"). Expected: both shimmer, both land, the page ends on the last one written. Test in Task 2.
3. **A write refused because the field was reviewed meanwhile.** Expected: shimmer stops, no "landed" highlight, the draft is not replaced. Tests in Task 1 (`unwritten`) and Task 2.
4. **An unsaved edit of a different field** when the copilot writes one. Expected: kept exactly. Test in Task 3.
5. **A path the page does not show** (a field missing from this KB, or an Image Analysis path). Expected: no move, no error. Test in Task 2 (`fieldLocation` returns null).

---

### Task 1: The turn reports each field it writes

**Files:**
- Modify: `src/lib/journey/thread/turn-events.ts` (add the event)
- Modify: `src/lib/journey/thread/turn-progress.ts` (the event leaves progress as it is)
- Modify: `src/lib/journey/kb-copilot/turn.ts` (`KbTurnEvents.field`, emitted from `settle`)
- Modify: `src/app/api/clients/[id]/copilot/kb/turn/route.ts` (map `field` to `emit`)
- Test: `src/lib/journey/kb-copilot/__tests__/turn.test.ts`, `src/lib/journey/thread/__tests__/turn-progress.test.ts`, `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`

**Interfaces:**
- Produces: `KbTurnEvent` member `{ type: "field"; path: string; phase: "writing" | "written" | "unwritten" }`; `KbTurnEvents.field?: (path: string, phase: "writing" | "written" | "unwritten") => void`.

- [ ] **Step 1: Write the failing tests**

```ts
// turn.test.ts, in "runKbTurn in review"
it("reports a field as being written, then written, around the save (page follows)", async () => {
  const { a } = withField();
  const field = vi.fn();
  const { model } = scripted([{ text: "", calls: [call("answer_field", { field: AGE, value: "40+" })] }, say("Noted.")]);
  await turn({ ctx: inReview, review: reviewOf(), actions: a, model, on: { field } });
  expect(field.mock.calls).toEqual([[AGE, "writing"], [AGE, "written"]]);
});
it("reports a refused write as not written", async () => {
  const field = vi.fn();
  const model = vi.fn(async () => { throw new Error("not asked"); });
  await turn({ ctx: inReview, review: reviewOf(), actions: actions({ setField: vi.fn(async () => false) }), model, text: "Yes, that's right", on: { field } });
  expect(field.mock.calls).toEqual([[AGE, "writing"], [AGE, "unwritten"]]);
});
it("reports 'written' before asking the page to re-read", async () => {
  const { a } = withField();
  const order: string[] = [];
  const model = vi.fn(async () => { throw new Error("not asked"); });
  await turn({ ctx: inReview, review: reviewOf(), actions: a, model, text: "Yes, that's right", on: { field: (_p, phase) => order.push(phase), page: () => order.push("page") } });
  expect(order).toEqual(["writing", "written", "page"]);
});

// turn-progress.test.ts
it("leaves the progress as it is on a field event", () => {
  const p = { step: "Saving your answer…", text: "" };
  expect(applyTurnEvent(p, { type: "field", path: "a.b", phase: "writing" })).toBe(p);
});
```

Route test (beside the existing `saved` stream test, same setup): a turn whose agent calls `answer_field` streams `{ type: "field", path, phase: "writing" }` then `{ type: "field", path, phase: "written" }` before `{ type: "page" }`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/journey src/app/api/clients/[id]/copilot/kb/turn`
Expected: FAIL (no `field` events; TypeScript-only union failure is acceptable for turn-progress).

- [ ] **Step 3: Implement**

`settle` in `turn.ts` calls `input.on?.field?.(field.path, "writing")` before `actions.setField`, and after it `"written"` (before `input.on?.page?.()`) or `"unwritten"`. If `setField` throws, emit `"unwritten"` and rethrow. The route maps `field: (path, phase) => emit({ type: "field", path, phase })`. `applyTurnEvent` returns `progress` for `"field"`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/journey src/app/api/clients/[id]/copilot/kb/turn`
Expected: PASS.

- [ ] **Step 5: Commit** `feat(copilot): a turn reports each field it writes, for the page to follow`

---

### Task 2: Field activity, the asked field, and where a field lives

**Files:**
- Create: `src/lib/journey/thread/field-activity.ts`
- Modify: `src/lib/kb/utils.ts` (add `fieldLocation`)
- Test: `src/lib/journey/thread/__tests__/field-activity.test.ts`, `src/lib/kb/utils.test.ts`

**Interfaces:**
- Produces:

```ts
// field-activity.ts (pure)
export type FieldActivity = {
  /** Fields being written right now. */
  writing: string[];
  /** Fields written, each with the count `n` of the write, so the page can tell a new one. */
  written: { path: string; n: number }[];
  /** The latest place to go, with its own count; null until there is one. */
  move: { path: string; n: number } | null;
  n: number;
};
export const NO_FIELD_ACTIVITY: FieldActivity;
export type FieldActivityEvent =
  | { type: "writing" | "written" | "unwritten"; path: string; move: boolean }
  | { type: "asked"; path: string }
  | { type: "endTurn" };
export function applyFieldEvent(a: FieldActivity, e: FieldActivityEvent): FieldActivity;
/** The field of the question the thread is waiting on: the last message, when it is an assistant
 *  question card; else null. */
export function askingFieldOf(state: ThreadState | undefined): string | null;

// src/lib/kb/utils.ts
/** Which tab and key a dotted review path is shown under; null when no tab shows it. */
export function fieldLocation(path: string): { module: ModuleKey; fieldKey: string } | null;
```

Rules of `applyFieldEvent`: `writing` adds the path to `writing` and, when `move`, sets `move` to it with a new count. `written` removes it from `writing`, appends `{ path, n }` to `written` (keep the last 20), and moves when `move`. `unwritten` removes it from `writing` only. `asked` sets `move`. `endTurn` empties `writing`. Every change increments `n`; a no-op returns the same object.

- [ ] **Step 1: Write the failing tests**

```ts
it("moves to a field as it is written, and marks it written", …)        // writing(move) then written(move)
it("ends on the last of two fields written in one turn", …)               // Review Focus 2: move.path === second, both in written
it("stops the shimmer and adds nothing on a refused write", …)            // Review Focus 3: unwritten → writing [], written []
it("clears every shimmer when the turn ends, whatever happened", …)      // Review Focus 1: endTurn → writing []
it("records a card's written fields without moving", …)                  // written(move:false) → move unchanged
it("returns the same object for a no-op", …)                              // unwritten of a path not writing → toBe(a)
it("askingFieldOf: the field of a trailing question, else null", …)       // question last → field; reply after it → null; undefined → null
// utils.test.ts
it("fieldLocation: finds the tab and key of a review path", () => {
  expect(fieldLocation("target_audience.age_range")).toEqual({ module: <the module whose getFieldPath(m, "age_range") is ["target_audience","age_range"]>, fieldKey: "age_range" });
  expect(fieldLocation("creative_direction.video.pacing")?.fieldKey).toBe("pacing");
});
it("fieldLocation: null for a path no tab shows", () => {             // Review Focus 5
  expect(fieldLocation("nope.x")).toBeNull();
  expect(fieldLocation("image_analysis.aesthetic")).toBeNull();
});
```

(The implementer fills each test body from the rules above; the module key in the first assertion is read from `MODULES`, not guessed.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/journey/thread src/lib/kb/utils.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** both files. `fieldLocation` searches `MODULES` (excluding Image Analysis) for the module whose `getFieldPath(m.key, key)` joins to `path`.

- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit** `feat(copilot): field activity, the asked field, and where a field lives`

---

### Task 3: The chat answer wins over an unsaved edit of that field

**Files:**
- Modify: `src/lib/kb/review-sync.ts` (`adoptServerKb` gains `take`)
- Test: `src/lib/kb/__tests__/review-sync.test.ts`

**Interfaces:**
- Produces: `adoptServerKb(draft, saved, server, take: ReadonlySet<string> = new Set())`: a dotted path in `take` adopts the server's field into the draft even when the person changed it and has not saved.

- [ ] **Step 1: Write the failing tests**

```ts
it("takes the server's field over an unsaved edit when the copilot wrote it (spec §2.4)", …)
  // draft has an unsaved edit of age_range; server has the copilot's answer; take = {"target_audience.age_range"}
  // → draft.age_range equals server's; changedFields(result.draft, result.saved) has no age_range patch
it("keeps an unsaved edit of every other field", …)                     // Review Focus 4: same setup, unsaved edit of tagline survives
it("behaves as before when take is empty", …)                            // existing expectations, no 4th argument
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lib/kb/__tests__/review-sync.test.ts` Expected: FAIL on the first test.
- [ ] **Step 3: Implement.** In the per-field merge, also take the server's field when `take.has([...path, key].join("."))`.
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(kb): a field the copilot wrote replaces an unsaved edit of it`

---

### Task 4: The panel records field activity; the page can read it

**Files:**
- Modify: `src/hooks/queries/copilot-thread.ts`
- Test: `src/hooks/queries/__tests__/copilot-thread.test.ts`

**Interfaces:**
- Consumes: Task 1's `field` event; Task 2's `applyFieldEvent`, `askingFieldOf`, `NO_FIELD_ACTIVITY`.
- Produces:

```ts
copilotThreadKeys.fieldActivity(clientId)
export function useCopilotFieldActivity(clientId: string): FieldActivity   // like useKbCopilotSaved: no fetch, initialData NO_FIELD_ACTIVITY
export function useAskingField(clientId: string): string | null            // useQuery({ queryKey: thread, queryFn: skipToken, select: askingFieldOf })
/** The `asked` event after a turn, or null when the asked field did not change. Pure. */
export function askedAfterTurn(before: ThreadState | undefined, after: ThreadState): FieldActivityEvent | null;
```

Wiring: `useSendKbTurn`'s `onEvent` folds `field` events in with `move: true`. In `onSuccess`, before `finishTurn`, compute `askedAfterTurn(previous thread, state)` and fold it in. `onSettled` folds `{ type: "endTurn" }`. `useDecideChange` on an approve folds `written` with `move: false` for each path in the decided card's `decision.kept` (read from the returned `state`, by `messageId`).

- [ ] **Step 1: Write the failing tests** (pure, beside `nextSavedEvent`'s)

```ts
it("askedAfterTurn: asks to move when the waiting field changed", …)     // before asks A, after asks B → { type: "asked", path: B }
it("askedAfterTurn: nothing when the same field is asked again", …)      // spec §3: A then A → null
it("askedAfterTurn: nothing when no question is waiting after", …)       // → null
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/hooks/queries/__tests__/copilot-thread.test.ts` Expected: FAIL.
- [ ] **Step 3: Implement** `askedAfterTurn`, the key, the two hooks and the wiring above.
- [ ] **Step 4: Run them, then type-check.** Same command, then `npx tsc --noEmit`. Expected: PASS; no new type errors.
- [ ] **Step 5: Commit** `feat(copilot): the panel records which fields it is working on, for the page`

---

### Task 5: The page follows, marks, shimmers and lands

**Files:**
- Modify: `src/components/kb/kb-field-row.tsx` (prop `copilot`, `data-kb-field`, remount the editor on a landing)
- Modify: `src/components/kb/kb-onboarding-review-step.tsx` (follow, take, highlight)
- Modify: `src/app/globals.css` (`.animate-field-sweep`, with its reduced-motion rule)

**Interfaces:**
- Consumes: Task 2 `fieldLocation`; Task 3 `adoptServerKb(..., take)`; Task 4 `useCopilotFieldActivity`, `useAskingField`.
- Produces: `KBFieldRow` prop `copilot?: { asking: boolean; writing: boolean; landed: number | null }` (`landed` is the write count while its highlight shows, else null) and attribute `data-kb-field="<dotted path>"` on the row's `<section>`.

Behaviour:
- **Move:** when `activity.move.n` is new, `setSelectedModule(location.module)`, then after paint scroll `[data-kb-field="<path>"]` into view (`block: "center"`, smooth unless reduced motion). Ignore a path `fieldLocation` cannot place.
- **Move on open:** the first time `useAskingField` is non-null after the review step mounts, move to it once (covers opening the page, a build landing, and coming from another page).
- **Take:** keep a ref of the paths in `activity.written` newer than the last adopt; pass them as `take` at the next `kbRevision` change, then clear.
- **Rows:** `asking` = path equals `useAskingField`; `writing` = path in `activity.writing` (a `Set` built once per render of the step); `landed` = the entry's `n` for 1500 ms after it appears, then null.
- **Look:** asking → `rounded-xl bg-primary/5 ring-1 ring-primary/20` plus a `text-eyebrow text-primary` label `Copilot is asking`; writing → an absolutely placed overlay `bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-field-sweep`; landed → `bg-primary/10` fading out over 500 ms with the house easing. The editor gets `key={landed ?? "idle"}` so a landing drops any half-typed text in that field (spec §2.4).

- [ ] **Step 1: Implement** the three files as above.
- [ ] **Step 2: Type-check and lint.** `npx tsc --noEmit` and `npx eslint src/components/kb src/hooks/queries src/lib/journey src/lib/kb`. Expected: no new errors.
- [ ] **Step 3: Run the suite.** `npx vitest run`. Expected: only the two known image-generate failures.
- [ ] **Step 4: Commit** `feat(kb): the Brand KB page follows the copilot to the field it asks about or writes`

The repo has no component test setup (no Testing Library), so this task is verified by the browser checks below, added to the QA plan in Task 6.

---

### Task 6: QA checks, ADR, outcome

**Files:**
- Modify: `docs/qa/2026-11-18-copilot-journey-manual-qa.md` (new checks under section 4)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append **D508**: the page follows the copilot; chat answer wins over an unsaved edit of the field it wrote; marks for everyone, moves for the sender)
- Modify: this plan (Outcome section after the review)

QA checks to add (Do / Expected):
1. Answer five questions with the buttons without touching the page. Each time the page is already on the right tab, field in view, marked "Copilot is asking"; each answer shimmers then lands; the mark moves on.
2. On another tab, type an answer for a field on a different tab. The page switches to it, shimmers, lands.
3. Edit a field on the page, don't save, then answer that field in the chat. The field shows the chat answer; pressing Save does not bring the old edit back. An unsaved edit of another field is still there.
4. Ask "what is our tone of voice?" while a question waits, after moving to another tab. The page does not move; the mark stays on the waiting field.
5. *(two people)* B watches the same client while A answers. B's page does not move; B sees the mark move.
6. Reload with a question waiting, and open Brand KB from the client home. Lands on the waiting field, marked.
7. With reduced motion on: no shimmer or smooth scroll; tint and label still show.
8. Approve a change card. The page does not move; changed fields on screen briefly highlight.

- [ ] **Step 1: Write the three documents.**
- [ ] **Step 2: Commit** `docs(copilot): D508, QA checks for the page following the copilot`
