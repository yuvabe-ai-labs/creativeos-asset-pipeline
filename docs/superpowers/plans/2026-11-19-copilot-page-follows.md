# The page shows the copilot's work: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Whatever the copilot changes on the page, the page shows it happening (go there, "Copilot is asking", working shimmer, landed highlight), built once as a shared mechanism and applied first to the brand KB: review fields, the pre-build form's website and handles, and the source list.

**Architecture:** The copilot names what it works on as *targets* (strings such as `kb:target_audience.age_range`). The turn stream gains a `target` event per change (`writing`, then `written` or `unwritten`). The panel folds those events, plus "the asked target changed after my turn" and "a file I attached was saved", into a small *activity* record in the TanStack Query cache (the no-fetch channel D501 uses for saved websites). A shared hook on the page reads the activity and the waiting question (from the thread already in the cache, via `skipToken`, so no second poll), asks the page to reveal a target (switch tab), scrolls it into view, and gives each target its state; a shared `CopilotTarget` component draws the mark, sweep and highlight. The review page also adopts the server's value over the draft for the targets the copilot wrote (spec §3.2).

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5 (`skipToken`, `select`), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-copilot-page-follows-design.md`

## Global Constraints

- Purple sparingly: marks use `primary` at low opacity (`bg-primary/5`, `ring-primary/20`, `via-primary/10`, `bg-primary/10`); never `.text-shimmer-brand` (reserved for the copilot's working line).
- Motion: easing `cubic-bezier(0.22,1,0.36,1)` only; durations from 200/320/500 ms; no springs. Under `prefers-reduced-motion: reduce`: no sweep, `scrollIntoView` without `smooth`; tint, label and highlight stay.
- Label copy, exact: `Copilot is asking`.
- shadcn primitives only; no new native controls.
- Performance: no new request, no new poll. The page reads the thread through the cache only (`queryFn: skipToken`). Per-target state is a `Set`/`Map` lookup built once per render, never a scan per row.
- Only the browser that sent the turn moves; a teammate's turn reaching this browser by the poll changes the "asking" mark only.
- Target ids, exact: `kb:<dotted review path>` (review fields), `kb-form:website`, `kb-form:instagram`, `kb-form:facebook`, `kb-source:<document or image id>`.
- A target the page cannot show is skipped silently. The Source files drawer is never opened for the copilot.

## Review Focus

1. **A turn that fails after `writing` was sent** leaves a shimmer running for ever. Expected: any turn end clears every `writing`. Test in Task 2 (`endTurn`).
2. **Two targets written in one turn** (website and a handle; or two review fields). Expected: both shimmer and land; the page ends on the last. Test in Task 2.
3. **A write refused** (field reviewed meanwhile; handle rejected). Expected: shimmer stops, no landed highlight, draft not replaced. Tests in Task 1 and Task 2.
4. **An unsaved edit of a different field** when the copilot writes one. Expected: kept exactly. Test in Task 3.
5. **A target the page does not show** (a field missing from this KB; Image Analysis; a source in the closed drawer). Expected: no move, no error. Tests in Task 2 (`fieldLocation` null) and Task 5 (`nextMove` ignores an unrevealable target).

---

### Task 1: Targets, and the turn reports each one it changes

**Files:**
- Create: `src/lib/journey/kb-copilot/targets.ts`
- Modify: `src/lib/journey/thread/turn-events.ts`, `src/lib/journey/thread/turn-progress.ts`, `src/lib/journey/kb-copilot/turn.ts`, `src/app/api/clients/[id]/copilot/kb/turn/route.ts`
- Test: `src/lib/journey/kb-copilot/__tests__/turn.test.ts`, `src/lib/journey/thread/__tests__/turn-progress.test.ts`, `src/app/api/clients/[id]/copilot/kb/turn/route.test.ts`, `src/lib/journey/kb-copilot/__tests__/targets.test.ts`

**Interfaces:**
- Produces:

```ts
// targets.ts (pure; server and browser)
export const kbTarget = {
  field: (path: string) => `kb:${path}`,
  form: (name: "website" | "instagram" | "facebook") => `kb-form:${name}`,
  source: (id: string) => `kb-source:${id}`,
};
/** The review path of a `kb:` target, else null. */
export function kbFieldPath(target: string): string | null;

// turn-events.ts
| { type: "target"; target: string; phase: "writing" | "written" | "unwritten" }
// turn.ts
KbTurnEvents.target?: (target: string, phase: "writing" | "written" | "unwritten") => void
```

- [ ] **Step 1: Write the failing tests**

```ts
// turn.test.ts
it("reports a review field as being written, then written, around the save", …)
  // answer_field AGE → target calls [[kb:AGE,"writing"],[kb:AGE,"written"]]
it("reports a refused write as not written", …)
  // "Yes, that's right" with setField → false → [[kb:AGE,"writing"],[kb:AGE,"unwritten"]]
it("reports 'written' before asking the page to re-read", …)
  // order: writing, written, page
it("reports the website and handles it saves as form targets", …)
  // save_website → [kb-form:website writing], [kb-form:website written]; save_socials {instagram} → kb-form:instagram only
// turn-progress.test.ts
it("leaves the progress as it is on a target event", …)
// targets.test.ts
it("builds and reads back target ids", …)   // kbFieldPath(kbTarget.field("a.b")) === "a.b"; kbFieldPath("kb-form:website") === null
```

Route test, beside the existing `saved` stream test: a turn whose agent calls `answer_field` streams `target` `writing` then `written` before `{ type: "page" }`.

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lib/journey src/app/api/clients/[id]/copilot/kb/turn` Expected: FAIL.
- [ ] **Step 3: Implement.** `settle` emits `writing` before `actions.setField`, then `written` (before `on.page`) or `unwritten`; if `setField` throws, emit `unwritten` and rethrow. `save_website` / `save_socials` emit `writing` before the save and `written` after, per handle stored. The route maps `target` to `emit`. `applyTurnEvent` returns `progress` for `target`.
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): name what the copilot works on as targets, and report each change`

---

### Task 2: Target activity, the asked target, and where a review field lives

**Files:**
- Create: `src/lib/journey/thread/target-activity.ts`
- Modify: `src/lib/kb/utils.ts` (`fieldLocation`)
- Test: `src/lib/journey/thread/__tests__/target-activity.test.ts`, `src/lib/kb/utils.test.ts`

**Interfaces:**
- Produces:

```ts
// target-activity.ts (pure, stage-neutral)
export type TargetActivity = {
  writing: string[];                         // targets being changed now
  written: { target: string; n: number }[];  // the last 20 changes, newest last
  move: { target: string; n: number } | null;
  n: number;
};
export const NO_TARGET_ACTIVITY: TargetActivity;
export type TargetEvent =
  | { type: "writing" | "written" | "unwritten"; target: string; move: boolean }
  | { type: "asked"; target: string }
  | { type: "endTurn" };
export function applyTargetEvent(a: TargetActivity, e: TargetEvent): TargetActivity;
/** The target of the question the thread waits on: the last message, when it is an assistant
 *  question card, mapped by the stage (`kbTarget.field` for the brand KB); else null. */
export function askingTargetOf(state: ThreadState | undefined, toTarget: (field: string) => string): string | null;

// src/lib/kb/utils.ts
export function fieldLocation(path: string): { module: ModuleKey; fieldKey: string } | null;
```

Rules: `writing` adds to `writing` and, when `move`, sets `move` with a new count. `written` removes from `writing`, appends `{ target, n }` (keep the last 20), and moves when `move`. `unwritten` removes from `writing` only. `asked` sets `move`. `endTurn` empties `writing`. Every change increments `n`; a no-op returns the same object.

- [ ] **Step 1: Write the failing tests**

```ts
it("moves to a target as it is written, and records it written", …)
it("ends on the last of two targets written in one turn", …)          // Review Focus 2
it("stops the shimmer and records nothing on a refused write", …)     // Review Focus 3
it("clears every shimmer when the turn ends", …)                       // Review Focus 1
it("records a change without moving when asked not to", …)            // card approval
it("returns the same object for a no-op", …)
it("askingTargetOf: the mapped field of a trailing question, else null", …)
it("fieldLocation: finds the tab and key of a review path", …)        // read the module from MODULES; "creative_direction.video.pacing" → fieldKey "pacing"
it("fieldLocation: null for a path no tab shows", …)                  // Review Focus 5: "nope.x", "image_analysis.aesthetic"
```

- [ ] **Step 2: Run them to see them fail.** `npx vitest run src/lib/journey/thread src/lib/kb/utils.test.ts` Expected: FAIL.
- [ ] **Step 3: Implement** both. `fieldLocation` searches `MODULES` except Image Analysis for the module whose `getFieldPath(m.key, key)` joins to `path`.
- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): target activity, the asked target, and where a review field lives`

---

### Task 3: The copilot's change wins over an unsaved edit of the same field

**Files:** Modify `src/lib/kb/review-sync.ts`; Test `src/lib/kb/__tests__/review-sync.test.ts`

**Interfaces:** Produces `adoptServerKb(draft, saved, server, take: ReadonlySet<string> = new Set())`, where `take` holds dotted review paths whose server field replaces the draft even when changed and unsaved.

- [ ] **Step 1: Write the failing tests**

```ts
it("takes the server's field over an unsaved edit when the copilot wrote it (spec §3.2)", …)
  // and changedFields(result.draft, result.saved) has no patch for that path
it("keeps an unsaved edit of every other field", …)                   // Review Focus 4
it("behaves as before when take is empty", …)
```

- [ ] **Step 2: Fail.** `npx vitest run src/lib/kb/__tests__/review-sync.test.ts`
- [ ] **Step 3: Implement.** In the per-field merge, also take the server's field when `take.has([...path, key].join("."))`.
- [ ] **Step 4: Pass.** Same command.
- [ ] **Step 5: Commit** `feat(kb): a field the copilot wrote replaces an unsaved edit of it`

---

### Task 4: The panel records activity; pages can read it

**Files:** Modify `src/hooks/queries/copilot-thread.ts`, `src/components/journey/kb-copilot.tsx`; Test `src/hooks/queries/__tests__/copilot-thread.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:

```ts
copilotThreadKeys.activity(clientId)
export function useCopilotActivity(clientId: string): TargetActivity          // no fetch; initialData NO_TARGET_ACTIVITY
export function useRecordCopilotActivity(clientId: string): (e: TargetEvent) => void
export function useAskingTarget(clientId: string): string | null             // thread key, queryFn: skipToken, select: s => askingTargetOf(s, kbTarget.field)
/** The `asked` event after a turn, or null when the asked target did not change. Pure. */
export function askedAfterTurn(before: ThreadState | undefined, after: ThreadState): TargetEvent | null;
```

Wiring: `useSendKbTurn` folds each `target` event with `move: true`; in `onSuccess` folds `askedAfterTurn(previous, state)`; in `onSettled` folds `endTurn`. `useDecideChange` on approve folds `written` (`move: false`) for `kbTarget.field(path)` of each path in the decided card's `decision.kept`, read from the returned `state` by `messageId`. `KbCopilot`'s chat upload folds `written` (`move: true`) for `kbTarget.source(attachment.id)` once a chip's upload is saved.

- [ ] **Step 1: Write the failing tests** (pure)

```ts
it("askedAfterTurn: moves when the waiting target changed", …)
it("askedAfterTurn: nothing when the same question is asked again", …)   // spec §3.3
it("askedAfterTurn: nothing when no question waits after", …)
```

- [ ] **Step 2: Fail.** `npx vitest run src/hooks/queries/__tests__/copilot-thread.test.ts`
- [ ] **Step 3: Implement** the key, hooks, `askedAfterTurn` and the wiring.
- [ ] **Step 4: Pass, then type-check.** Same command; `npx tsc --noEmit`. Expected: no new type errors.
- [ ] **Step 5: Commit** `feat(copilot): the panel records what it works on, for the page beside it`

---

### Task 5: The shared follow hook and the CopilotTarget component

**Files:**
- Create: `src/hooks/use-follow-copilot.ts`, `src/components/journey/copilot-target.tsx`
- Modify: `src/app/globals.css` (`.animate-target-sweep` and its reduced-motion rule)
- Test: `src/hooks/__tests__/use-follow-copilot.test.ts` (pure parts)

**Interfaces:**
- Consumes: Task 4 `useCopilotActivity`, `useAskingTarget`.
- Produces:

```ts
// use-follow-copilot.ts
export type TargetState = { asking: boolean; writing: boolean; landed: number | null };
/** Pure: the target to move to now, or null. `seen` is the last move count handled; a target
 *  `canShow` rejects is skipped (Review Focus 5). On first sight of an asked target after mount,
 *  `opened` is false and the asked target is returned. */
export function nextMove(input: { activity: TargetActivity; asking: string | null; seen: number; opened: boolean; canShow: (t: string) => boolean }): { target: string; n: number } | null;
/** Follows the copilot on this page. `reveal` makes a target reachable (switch tab) and returns
 *  false when this page cannot show it; then scrolls `[data-copilot-target="<id>"]` into view. */
export function useFollowCopilot(clientId: string, reveal: (target: string) => boolean): { stateOf: (target: string) => TargetState; written: TargetActivity["written"] };

// copilot-target.tsx
export function CopilotTarget(props: { id: string; state: TargetState; className?: string; children: React.ReactNode }): JSX.Element;
// renders data-copilot-target={id}; asking → rounded-xl bg-primary/5 ring-1 ring-primary/20 + text-eyebrow text-primary "Copilot is asking";
// writing → absolute overlay bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-target-sweep;
// landed → bg-primary/10 fading out over 500 ms (house easing). Children re-mount on a new `landed` (key), so half-typed text in that field is dropped (spec §3.2).
```

`stateOf`: `asking` = target equals the asked target; `writing` = in a `Set` of `activity.writing`; `landed` = the change's `n` for 1500 ms after it first appears, then null.

- [ ] **Step 1: Write the failing tests** for `nextMove`

```ts
it("moves on a new move count", …)
it("does not move again for a move already seen", …)
it("moves to the asked target once after opening", …)                 // opened false → asked target
it("skips a target the page cannot show", …)                            // Review Focus 5
```

- [ ] **Step 2: Fail.** `npx vitest run src/hooks/__tests__/use-follow-copilot.test.ts`
- [ ] **Step 3: Implement** the hook, the component and the CSS.
- [ ] **Step 4: Pass, type-check, lint.** Same command; `npx tsc --noEmit`; `npx eslint src/hooks src/components/journey`.
- [ ] **Step 5: Commit** `feat(copilot): a shared way for any page to follow the copilot and show its work`

---

### Task 6: Apply it to the brand KB review page

**Files:** Modify `src/components/kb/kb-onboarding-review-step.tsx`, `src/components/kb/kb-field-row.tsx`

- Rows are wrapped in `CopilotTarget id={kbTarget.field(path)}` with `stateOf(...)`.
- `reveal(target)`: `kbFieldPath` → `fieldLocation` → `setSelectedModule(module)`; false when either is null.
- Take: keep a ref of `kb:` paths in `written` newer than the last adopt; pass them as `take` at the next `kbRevision` change, then clear.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Type-check, lint, suite.** `npx tsc --noEmit`; `npx eslint src/components/kb`; `npx vitest run` (only the two known image-generate failures).
- [ ] **Step 3: Commit** `feat(kb): the review page follows the copilot to the field it asks about or writes`

### Task 7: Apply it to the pre-build form and the source list

**Files:** Modify `src/components/kb/kb-onboarding-upload-step.tsx`, `src/components/kb/kb-social-handle-fields.tsx`, `src/components/kb/kb-source-panel.tsx`

- The website field and each handle field are wrapped in `CopilotTarget` (`kb-form:*`); each source row in the form's lists in `CopilotTarget` (`kb-source:<id>`). `reveal` returns true (one page, nothing to switch). The drawer (`kb-source-panel`) wraps its rows too, so a source highlights when the drawer is already open, but `reveal` never opens it.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Type-check, lint, suite** as Task 6.
- [ ] **Step 3: Commit** `feat(kb): the brand KB form shows the copilot's saves and attached files land`

The repo has no component test setup (no Testing Library), so Tasks 6 and 7 are verified by the browser checks added in Task 8.

---

### Task 8: The rule, the ADR, QA checks, outcome

**Files:**
- Modify: `AGENTS.md`: a rule beside "Streaming", in this wording: **The page shows the copilot's work.** Whatever the copilot changes on a page, the page shows it happening: it goes there, marks what is asked about ("Copilot is asking"), shimmers what is being changed, and shows the change land. A page names what the copilot can work on as targets (`CopilotTarget`, `useFollowCopilot`); never build a separate follow mechanism per page. The copilot's change wins over an unsaved edit of the same thing. Spec: `docs/superpowers/specs/2026-11-19-copilot-page-follows-design.md`.
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`: append **D508** (the principle and its mechanism; rejected: per-page follow code, staying put while editing, asking which value to keep).
- Modify: `docs/qa/2026-11-18-copilot-journey-manual-qa.md`: new section "The page shows the copilot's work" with the checks below.
- Modify: this plan: Outcome section after the review.

QA checks (Do / Expected):
1. Answer five review questions with the buttons, page untouched: each time the page is on the field, marked "Copilot is asking"; each answer shimmers then lands; the mark moves on.
2. On another tab, type an answer for a field on a different tab: the page switches, shimmers, lands.
3. Edit a field, don't save, answer it in the chat: the field shows the chat answer; Save does not bring the edit back; an unsaved edit of another field is still there.
4. Ask "what is our tone of voice?" while a question waits, after moving tabs: the page does not move; the mark stays.
5. *(two people)* B watches while A answers: B's page does not move; B sees the mark move.
6. Reload with a question waiting; open Brand KB from the client home: lands on the waiting field, marked.
7. *(new client)* Send the website, then "instagram is @acme" in the chat: each form field comes into view, shimmers, lands.
8. *(new client)* Attach a PDF in the chat: it appears in the form's document list highlighted.
9. Reduced motion on: no sweep, no smooth scroll; tint, label and highlight still show.
10. Approve a change card: the page does not move; changed fields on screen briefly highlight.

- [ ] **Step 1: Write the four documents.**
- [ ] **Step 2: Commit** `docs(copilot): D508, the page shows the copilot's work`

---

## Outcome (2026-11-20)

**Built** on `feat/copilot-journey`, commits `7492dc4`..`0c3b0eb` plus the fix pass, inline execution, test first. One independent whole-branch review (most capable model; the first reviewer stalled and a second one delivered): one critical, three important, six minor; verdict "with fixes". One fix pass. Full suite: 5,869 pass, only the two known image-generate failures.

**Departures from the plan (rulings):**
- `save_website`, `save_socials` and a throwing `setField` also report `unwritten`, so no sweep outlives a failed save even before the turn ends.
- `askingTargetOf` uses the walk's own rule for the waiting question (`walkOf(...).pending`), which looks past page-save notes.
- `askedAfterTurn` also moves on the first question when there was no thread before.
- `TargetState` carries a stable `version` used as the re-mount key; keying on `landed` would re-mount again when the highlight fades.
- The sweep loops every 1500 ms; the landing holds 1 s and fades over 500 ms.
- `kb-field-row.tsx` is unchanged: rows are wrapped where the review step renders them. The "take" is component state through a pure, tested `fieldsWrittenSince`, in `use-kb-review-follow.ts`.
- `KBSocialHandleFields` and `KBSourcePanel` take an optional `stateOf` (absent = unchanged); list rows moved their classes onto an inner div.
- The AGENTS.md rule sits after "Turn traces".

**Fixed after the review:**
- **Critical:** the page read the thread with `skipToken`; because a query keeps the options of whichever observer rendered last, "refresh the thread now" failed silently and the panel stayed stale for up to 20 s. Both observers are now built from one `threadQueryOptions`; the page's is `enabled: false`.
- Each landed change has its own lifetime (`addLanded` / `pruneLanded`), so a second landing never strands the first (visible under reduced motion).
- A page counts as open once the thread has loaded (`hasOpened`), so a question a teammate's turn brings never moves it.
- A target that reaches the page late (a file attached in the chat, after the page is re-read) is looked for up to 3 s, and stays "landed" for 4 s so its highlight still plays.

**Left for later (minor):** the highlight's edges may be clipped on the review page (`-mx-3` inside an `overflow-x-hidden` body): check in the browser; "Copilot is asking" is not announced to screen readers and shifts the layout when it appears; formatting nits in `kb-onboarding-upload-step.tsx`; a move the page cannot show is re-checked on every activity change; the upload form's reveal accepts every target.

**Owed:** QA section 8 in the browser (none of this has been run in one).
