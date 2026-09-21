# Multishot Plan Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Multishot Prompt node an explicit Save for hand edits to its plan, so those edits reach the `node_versions` row that every downstream reader actually uses.

**Architecture:** Three changes, in dependency order. A pure `planIsDirty` comparison lands in `src/lib/nodes/multishot-plan.ts` with unit tests. `MultishotBeatCard` gains a narrow `aiDisabled` prop so the AI buttons can be gated without freezing the editor. Then `MultishotPromptFocusView` stops patching the canvas store on every keystroke, buffers into `planDraft`, and persists on Save via the existing `savePromptOutputAction`. No server-side or downstream code changes — Video Gen already re-fetches upstream on open.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, zustand, Tailwind v4, shadcn/Base UI, vitest, sonner (toasts).

**Spec:** [docs/superpowers/specs/2026-09-09-multishot-plan-save-design.md](../specs/2026-09-09-multishot-plan-save-design.md)

## Global Constraints

- **Controls are shadcn primitives only.** Never a raw `<button>`/`<input>`/`<textarea>`. Use `Button` from `@/components/ui/button`. Base UI composes via `render`, not `asChild`. (CLAUDE.md)
- **Import, don't redefine.** `savePromptOutputAction` already exists in `src/lib/actions/nodes.ts` and already calls `updateActiveVersionOutput`. Do NOT write a `saveMultishotPlanAction`. (AGENTS.md)
- **Two call sites = extract. One = leave inline.** The "Unsaved changes" pill is copied from `video-prompt-focus-view.tsx`, not extracted — this is only its second use. (AGENTS.md)
- **Motion easing** is `cubic-bezier(0.22,1,0.36,1)` only; no springs. Colors come from the shadcn CSS variables in `globals.css` — never hardcoded. Icons are Lucide, `strokeWidth={1.5}`, no fills.
- **Save button label is exactly `Save`** — verbatim parity with the Motion Prompt node.
- **Dirty-state hint copy is exactly:** `Save or discard your edits to rewrite with AI.`
- **Test command:** `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
- Do NOT run the full `npm test` to verify — it has ~11 known timeout flakes in API route tests. Verify per-file.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/lib/nodes/multishot-plan.ts` | Modify (append) | Add `planIsDirty` — the pure saved-vs-draft comparison |
| `src/lib/nodes/__tests__/multishot-plan.test.ts` | Modify (append) | Unit tests for `planIsDirty` |
| `src/components/nodes/multishot-beat-card.tsx` | Modify | Add `aiDisabled` prop gating only the two AI buttons |
| `src/components/nodes/multishot-prompt-focus-view.tsx` | Modify | Buffer edits, Save bar, dirty interlocks |

---

### Task 1: `planIsDirty` — the pure comparison

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts` (append after `mergeRefinedPlan`, which ends the file)
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts` (append a new `describe` block at the end)

**Interfaces:**
- Consumes: `MultishotPlan` — already exported from `src/lib/nodes/multishot-plan.ts` as
  `{ version: 1; look: string; beats: MultishotBeat[] }`, where `MultishotBeat` is `{ cutId: string; text: string }`.
- Produces: `planIsDirty(saved: MultishotPlan | null, draft: MultishotPlan | null): boolean` — imported by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/multishot-plan.test.ts`. Note the file's existing `raw()`
helper returns an untyped object literal, so cast through the shared shape rather than reusing it:

```ts
describe("planIsDirty", () => {
  const plan = (over: Partial<MultishotPlan> = {}): MultishotPlan => ({
    version: 1,
    look: "Late afternoon, warm low sun.",
    beats: [
      { cutId: "c1", text: "Tight on a hand lifting keys." },
      { cutId: "c2", text: "A cab door swings open." },
    ],
    ...over,
  });

  it("is not dirty when the draft matches what was saved", () => {
    expect(planIsDirty(plan(), plan())).toBe(false);
  });

  it("is dirty when the look was edited", () => {
    expect(planIsDirty(plan(), plan({ look: "Overcast, flat light." }))).toBe(true);
  });

  it("is dirty when a beat's text was edited", () => {
    const edited = plan({
      beats: [
        { cutId: "c1", text: "Tight on a hand lifting keys." },
        { cutId: "c2", text: "The cab door slams." },
      ],
    });
    expect(planIsDirty(plan(), edited)).toBe(true);
  });

  it("is dirty when the beat count differs", () => {
    const edited = plan({ beats: [{ cutId: "c1", text: "Tight on a hand lifting keys." }] });
    expect(planIsDirty(plan(), edited)).toBe(true);
  });

  it("is dirty when a cutId at the same index differs", () => {
    const edited = plan({
      beats: [
        { cutId: "c1", text: "Tight on a hand lifting keys." },
        { cutId: "c9", text: "A cab door swings open." },
      ],
    });
    expect(planIsDirty(plan(), edited)).toBe(true);
  });

  it("is never dirty with no draft — there is nothing to save", () => {
    expect(planIsDirty(plan(), null)).toBe(false);
    expect(planIsDirty(null, null)).toBe(false);
  });

  it("is dirty when there is a draft but nothing saved", () => {
    expect(planIsDirty(null, plan())).toBe(true);
  });

  // `version` is a schema literal, not an operator-editable field. Comparing it would report a
  // plan dirty on a future schema bump, which is not an unsaved edit.
  it("ignores the schema version", () => {
    const bumped = { ...plan(), version: 2 } as unknown as MultishotPlan;
    expect(planIsDirty(plan(), bumped)).toBe(false);
  });
});
```

Add `planIsDirty` to the existing import at the top of the file. The current line is:

```ts
import { parsePlan, renderPlan, refsCitedIn, mergeRefinedPlan, checkPlanLimits } from "../multishot-plan";
```

Change it to:

```ts
import { parsePlan, renderPlan, refsCitedIn, mergeRefinedPlan, checkPlanLimits, planIsDirty } from "../multishot-plan";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: FAIL — `planIsDirty is not a function`, or a TypeScript error that `planIsDirty` is not exported by `../multishot-plan`.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/lib/nodes/multishot-plan.ts`:

```ts
/**
 * Has the operator hand-edited the plan since it was last generated, restored or saved?
 *
 * Drives the Multishot Prompt focus view's Save button, its "Unsaved changes" pill, the sheet's
 * close-confirm, and the lockout on every path that would replace the plan wholesale (D240, D242).
 *
 * Compared FIELD-WISE rather than by `JSON.stringify`: stringify is key-order dependent, so a plan
 * the server happened to serialise `beats`-before-`look` would read as edited; it would also
 * silently start comparing any field later added to MultishotPlan, editable or not. `version` is
 * deliberately excluded for exactly that reason — it is a schema literal, and a bump to it is not
 * an unsaved edit.
 *
 * A null draft is never dirty: there is nothing to save. A draft with nothing saved is.
 */
export function planIsDirty(
  saved: MultishotPlan | null,
  draft: MultishotPlan | null,
): boolean {
  if (!draft) return false;
  if (!saved) return true;
  if (saved.look !== draft.look) return true;
  if (saved.beats.length !== draft.beats.length) return true;
  return saved.beats.some(
    (b, i) => b.cutId !== draft.beats[i].cutId || b.text !== draft.beats[i].text,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: PASS — all tests in the file, including the 8 new `planIsDirty` cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/multishot-plan.ts src/lib/nodes/__tests__/multishot-plan.test.ts
git commit -m "feat(multishot): planIsDirty, the saved-vs-draft plan comparison (D240)"
```

---

### Task 2: `aiDisabled` on the beat card

**Files:**
- Modify: `src/components/nodes/multishot-beat-card.tsx` (props type ~lines 40-74; JSX ~lines 99-119)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `MultishotBeatCard` accepts a new optional prop `aiDisabled?: boolean`, defaulting to `false`. Task 3 passes `dirty` to it. Existing `disabled` semantics are unchanged.

**Why this task is separate:** `disabled` currently gates the refine button (line 104), the rewrite
button (line 112) **and** the `MentionInstructionEditor` (line 133). Routing the dirty flag through
`disabled` would freeze a beat the instant it was typed into, making it impossible to edit or save.
The AI actions need their own gate.

- [ ] **Step 1: Add the prop to the type**

In the props type, immediately after the existing `disabled?: boolean;` block (which ends at the
line `disabled?: boolean;` following the D33 comment), add:

```ts
  /**
   * Gates the two AI actions ONLY — the editor stays live. Set while the plan has unsaved hand
   * edits (D242): a rewrite resolves against the snapshot it captured at submit time, so letting
   * one start here would discard the edit with no error at all. Distinct from `disabled`, which
   * also locks the editor and so cannot express "you may keep typing, but not rewrite".
   */
  aiDisabled?: boolean;
```

- [ ] **Step 2: Destructure it with a default**

In the parameter destructuring, add `aiDisabled = false,` immediately after `disabled = false,`:

```ts
  onFocusTimings,
  disabled = false,
  aiDisabled = false,
  isLast = false,
}: {
```

- [ ] **Step 3: Apply it to the two AI buttons only**

Change the `RefineWithAI` `disabled` prop from `disabled={disabled}` to:

```tsx
              disabled={disabled || aiDisabled}
```

and the rewrite `Button`'s from `disabled={rerunning || disabled}` to:

```tsx
              disabled={rerunning || disabled || aiDisabled}
```

Leave the `MentionInstructionEditor`'s `disabled={disabled || rerunning}` **unchanged** — that is
the whole point of the new prop.

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `multishot-beat-card.tsx`. (The prop is optional with a default, so no existing call site breaks.)

Run: `npx eslint src/components/nodes/multishot-beat-card.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/multishot-beat-card.tsx
git commit -m "feat(multishot): aiDisabled gates a beat's rewrite without freezing its editor (D242)"
```

---

### Task 3: Buffer, save, and interlock the focus view

**Files:**
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `planIsDirty(saved, draft)` from Task 1; `aiDisabled` on `MultishotBeatCard` from Task 2; the pre-existing `savePromptOutputAction(nodeId: string, output: unknown): Promise<void>` from `src/lib/actions/nodes.ts`.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Add the imports**

Add to the existing `@/lib/nodes/multishot-plan` import (currently
`import { renderPlan, refsCitedIn, type MultishotPlan } from "@/lib/nodes/multishot-plan";`):

```ts
import { renderPlan, refsCitedIn, planIsDirty, type MultishotPlan } from "@/lib/nodes/multishot-plan";
```

And add a new import beside the other `@/lib/actions` imports:

```ts
import { savePromptOutputAction } from "@/lib/actions/nodes";
```

- [ ] **Step 2: Compute `dirty` and add the save handler**

Immediately after the `beatRows` `useMemo` block, add:

```ts
  // D240 — hand edits are BUFFERED in planDraft and land in the node_versions row only on Save.
  // They used to patch the canvas store on every keystroke and never reach the database at all,
  // while `/api/nodes/[id]/upstream-images` and resolve-prompt.ts both read the version row — so
  // an edited look or beat showed on the canvas and was then silently dropped at the boundary,
  // and Video Gen billed a render against the last AI-generated plan.
  const dirty = planIsDirty(plan, planDraft);
```

Then, immediately after `handleRestoreVersion`, add:

```ts
  /**
   * Persist the hand-edited plan onto the ACTIVE version, in place — no new version row. Same
   * call and same reasoning as the Motion Prompt node's handleSave (video-prompt-focus-view.tsx):
   * a hand edit is a correction to the plan the operator is holding, not a new candidate to
   * compare against, and minting a version per typo would bury the generated ones in the chips.
   */
  async function handleSavePlan() {
    if (!planDraft) return;
    try {
      await savePromptOutputAction(nodeId, planDraft);
      onPatch({ parsed: planDraft }); // mirror into the store for display + clear dirty
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }
```

- [ ] **Step 3: Stop patching the store on every keystroke**

Replace `updateLook` and `updateBeat` in full. They currently read:

```ts
  function updateLook(v: string) {
    if (!planDraft) return;
    const next: MultishotPlan = { ...planDraft, look: v };
    setPlanDraft(next);
    onPatch({ parsed: next });
  }

  function updateBeat(cutId: string, v: string) {
    if (!planDraft) return;
    const next: MultishotPlan = {
      ...planDraft,
      beats: planDraft.beats.map((b) => (b.cutId === cutId ? { ...b, text: v } : b)),
    };
    setPlanDraft(next);
    onPatch({ parsed: next });
  }
```

Replace with (the `onPatch` calls move to `handleSavePlan`):

```ts
  function updateLook(v: string) {
    if (!planDraft) return;
    setPlanDraft({ ...planDraft, look: v });
  }

  function updateBeat(cutId: string, v: string) {
    if (!planDraft) return;
    setPlanDraft({
      ...planDraft,
      beats: planDraft.beats.map((b) => (b.cutId === cutId ? { ...b, text: v } : b)),
    });
  }
```

- [ ] **Step 4: Arm the sheet's close-confirm**

In the `<PromptFocusShell>` props, replace these three lines:

```tsx
      // Every field on this node patches the moment it changes — there is no separate Save
      // step to lose, so there is nothing to confirm on close.
      dirty={false}
```

with:

```tsx
      // D240 — hand edits to the plan are buffered until Save, so closing with unsaved ones must
      // confirm. (Until D240 every field patched on change and there was nothing to lose.)
      dirty={dirty}
```

- [ ] **Step 5: Lock out the version chips while dirty**

Replace the `restoring` prop on `PromptFocusShell`:

```tsx
      restoring={restoring || !!refining}
```

with:

```tsx
      // `dirty` joins the gate for the same reason `refining` is in it: a restore replaces
      // planDraft wholesale from a version the operator picked, silently discarding the hand
      // edits they have not saved yet (D242).
      restoring={restoring || !!refining || dirty}
```

- [ ] **Step 6: Lock out the whole-sequence refine and Generate**

On the whole-sequence `RefineWithAI` in the tab strip, change:

```tsx
                      disabled={isReadOnly || !!refining}
```

to:

```tsx
                      disabled={isReadOnly || !!refining || dirty}
```

On the Generate button at the foot of the Input column, change:

```tsx
                        disabled={generating || isReadOnly || cuts.length === 0 || !!refining}
```

to:

```tsx
                        disabled={generating || isReadOnly || cuts.length === 0 || !!refining || dirty}
```

- [ ] **Step 7: Lock out the look's AI actions — but not its editor**

On the look block's `RefineWithAI`, change `disabled={isReadOnly || !!refining}` to:

```tsx
                                  disabled={isReadOnly || !!refining || dirty}
```

On the look's rewrite (`RefreshCw`) `Button`, change `disabled={!!refining || isReadOnly}` to:

```tsx
                                  disabled={!!refining || isReadOnly || dirty}
```

Leave the look's `MentionInstructionEditor` `disabled={isReadOnly || !!refining}` **unchanged** —
the operator must be able to keep editing the text they have not saved.

- [ ] **Step 8: Pass `aiDisabled` to each beat card**

On `<MultishotBeatCard>`, add the new prop beneath the existing `disabled` line, leaving
`disabled` exactly as it is:

```tsx
                              disabled={isReadOnly || (!!refining && refining.cutId !== beat.cutId)}
                              aiDisabled={dirty}
```

- [ ] **Step 9: Add the Save bar at the foot of the Output column**

The Output column is currently one `div` that is both the flex column and the scroller:

```tsx
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
```

Split it into an `overflow-hidden` column wrapping a scroller plus a `shrink-0` footer — the same
shape the Input column beside it already has. Change that opening tag to:

```tsx
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
```

and at the matching close of that column — the `</div>` that currently sits immediately before the
`</div>` closing the `flex min-h-0 overflow-hidden` row — close the scroller and add the footer:

```tsx
                    </div>

                    {/* Save, at the foot of the column it acts on — the same placement rule the
                        Generate button follows at the foot of the Input column. Rendered only
                        with a plan on screen, which is also the only state that can be dirty. */}
                    {mode === "result" && (
                      <div className="shrink-0 border-t border-border px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" onClick={handleSavePlan} disabled={!dirty}>
                            Save
                          </Button>
                          {dirty && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              Unsaved changes
                            </span>
                          )}
                        </div>
                        {/* Says why every rewrite button just dimmed. Only rendered while dirty,
                            which is the only state in which they are. */}
                        {dirty && (
                          <p className="mt-1.5 text-[0.65rem] text-muted-foreground">
                            Save or discard your edits to rewrite with AI.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
```

- [ ] **Step 10: Verify it compiles and lints**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `multishot-prompt-focus-view.tsx`. A JSX nesting error here means the split in Step 9 closed the wrong `</div>` — recount the tags.

Run: `npx eslint src/components/nodes/multishot-prompt-focus-view.tsx src/components/nodes/multishot-beat-card.tsx`
Expected: no errors.

- [ ] **Step 11: Re-run the unit tests**

Run: `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/components/nodes/multishot-prompt-focus-view.tsx
git commit -m "fix(multishot): save hand-edited plans to the version row, not just the store (D240-D242)

updateLook/updateBeat wrote component state and the canvas store; every
downstream reader (upstream-images, resolve-prompt) reads the node_versions
row. So an edited look or beat showed on the canvas and was discarded at the
boundary — Video Gen previewed and billed against the last generated plan.

Edits now buffer into planDraft and persist on an explicit Save, matching the
Motion Prompt node. While dirty, every path that replaces the plan wholesale
(refine, rewrite, re-generate, restore) is locked out; the editors stay live."
```

---

### Task 4: Manual verification and the ADR log

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, append after D239)

**Interfaces:**
- Consumes: the working feature from Task 3.
- Produces: nothing.

- [ ] **Step 1: Run the app**

Run: `npm run dev:next`
Expected: dev server on http://localhost:3000.

- [ ] **Step 2: Walk the money path**

On a canvas with a Multishot → Multishot Prompt → Video Gen lane and a generated plan:

1. Open the Multishot Prompt node, edit a beat's text. → The **Save** button enables, the red **Unsaved changes** pill appears, the hint line appears, and every refine/rewrite/Re-generate button and the version chips go dim. The beat text is **still editable** — type another character to confirm.
2. Press **Escape**. → The sheet asks to confirm before discarding.
3. Cancel, click **Save**. → "Saved" toast; the pill and hint clear; the AI buttons re-enable.
4. Close, open the connected **Video Gen** node, expand **Motion prompt** under Connected. → It shows the edited text. (Before this change it showed the pre-edit generated plan.)

- [ ] **Step 3: Append the ADR entries**

Append to §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`, after D239,
following that section's existing Decision / Why / Rejected format:

```markdown
### D240 — A Multishot plan's hand edits are buffered and saved explicitly *(recorded 2026-09-09; refines D231)*

**Decision.** `updateLook` / `updateBeat` write `planDraft` only. An explicit **Save** persists the
whole plan onto the ACTIVE version via `savePromptOutputAction` — in place, no new version row —
and only then mirrors it into the canvas store. `planIsDirty` (field-wise: `look`, beat count, each
`cutId`/`text`; never `version`) drives the button, the pill, and the sheet's close-confirm.

**Why.** This node was the only prompt node whose hand edits never reached the database. They went
to component state and the zustand store; `upstream-images/route.ts` and `resolve-prompt.ts` both
read the `node_versions` row. So an edited look or beat showed on the canvas and was dropped at the
boundary — Video Gen previewed *and billed a paid render against* the last AI-generated plan. Not a
display bug: a generation from text the operator believed they had replaced.

**Rejected.** A new `saveMultishotPlanAction` (a rename of `savePromptOutputAction`, and a second
entry to keep in sync in `impersonation-audit-view.ts`); autosaving each keystroke to the version
row (a write per character on the money path, and no way to abandon an experiment); comparing plans
with `JSON.stringify` (key-order dependent, and silently starts comparing fields added later).

### D241 — The Save bar sits at the foot of the Output column *(recorded 2026-09-09; refines D240)*

**Decision.** A `shrink-0 border-t` footer under the Output column's scroller: `Save`, the red
"Unsaved changes" pill, and while dirty the line *"Save or discard your edits to rewrite with AI."*
Structurally identical to the Generate button's footer on the Input column beside it.

**Why.** The file's own rule is that an action sits at the foot of the column it acts on, and the
edited fields are in this column. The label is `Save`, verbatim from the Motion Prompt node, because
the whole point is that the two nodes now edit the same way.

**Rejected.** Per-card Save buttons (one plan is one output; three edits would mean three
round-trips and three chances to leave one unsaved); Save in the header beside the version chips
(away from the fields it acts on).

### D242 — A dirty plan locks out every wholesale-replacement path *(recorded 2026-09-09; refines D234)*

**Decision.** While the plan has unsaved edits, the whole-sequence refine, the look's refine and
rewrite, every beat's refine and rewrite, Re-generate, and the version chips are all disabled, with
a line stating why. **The editors stay live** — `MultishotBeatCard` gains a narrow `aiDisabled`
prop for this, because its existing `disabled` also locks its `MentionInstructionEditor` and would
otherwise freeze a beat the instant it was typed into.

**Why.** The same hazard the file already guards twice (one refine in flight at a time; a restore
beating an in-flight refine): a response computed against a snapshot taken before an edit resolves
afterwards and overwrites it with no error at all. A hand edit is one more such snapshot.

**Rejected.** A confirm dialog before each rewrite (a dialog on a frequent action, and it makes the
loss recoverable rather than impossible); auto-saving before a refine (quietly commits edits the
operator was trying out — the exact thing a Save button exists to prevent). Accepted cost: fixing a
typo now takes a Save before Re-generate.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D240-D242 — explicit Save for the Multishot plan"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 Buffer, then save; reuse `savePromptOutputAction` | Task 3, steps 1-3 |
| §3.2 `planIsDirty` pure comparison, `version` excluded | Task 1 |
| §3.2 `dirty={dirty}` on the shell, stale comment replaced | Task 3, step 4 |
| §3.3 Save bar at the foot of the Output column, label `Save`, pill copied not extracted | Task 3, step 9 |
| §3.4 Interlocks on refine / rewrite / generate / restore | Task 3, steps 5-8 |
| §3.4 `aiDisabled` — editors stay live | Task 2; Task 3 steps 7-8 |
| §3.5 No downstream code change | Task 4, step 2 verifies it |
| §4 Unit tests | Task 1 |
| §5 ADR entries D240-D242 | Task 4, step 3 |

**Type consistency:** `planIsDirty(saved, draft)` — argument order is saved-then-draft in the
definition (Task 1 step 3), the tests (Task 1 step 1) and the call site (Task 3 step 2).
`aiDisabled` is spelled identically in Task 2 steps 1-3 and Task 3 step 8. `handleSavePlan` is
defined and referenced under one name in Task 3 steps 2 and 9.

**Placeholder scan:** no TBD/TODO; every code step carries its literal replacement text.
