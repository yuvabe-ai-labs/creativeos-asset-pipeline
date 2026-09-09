# Multishot Prompt — explicit Save, and the stale downstream prompt it fixes

*Design, 2026-09-09. Originates D240–D242. Refines D231 (the Multishot Prompt node) and
D234 (per-beat refine).*

## 1. The bug

The Multishot Prompt node is the only prompt node in the app whose **manual edits never reach
the database**.

`updateLook` and `updateBeat` in `src/components/nodes/multishot-prompt-focus-view.tsx` write to
two places, and neither is the one that matters downstream:

```ts
function updateBeat(cutId: string, v: string) {
  const next = { ...planDraft, beats: /* … */ };
  setPlanDraft(next);        // local component state
  onPatch({ parsed: next }); // the zustand canvas store
}
```

Every downstream reader goes to the **`node_versions` row**, not the store:

| Reader | Line | Reads |
|---|---|---|
| Video Gen's "Motion prompt" preview | `src/app/api/nodes/[id]/upstream-images/route.ts:92` | `connectedPromptNode.activeOutput` |
| The money path (what is actually generated) | `src/lib/video-gen/resolve-prompt.ts:81` | `promptNode.activeOutput` |

So a hand-edited look or beat shows on the canvas and in this node's own Prompt tab, and is
then **silently discarded** at the boundary. Video Gen previews *and bills a render against*
the last AI-generated plan. This is not a display bug; it is a paid generation from text the
operator believes they replaced.

Generation and refine are unaffected — `/api/nodes/[id]/multishot-prompt` writes a version row
itself. Only hand edits are lost.

## 2. What Motion Prompt already does

`src/components/nodes/video-prompt-focus-view.tsx` is the pattern to match:

```ts
const dirty = (output ?? "") !== draft && draft.trim() !== "";

async function handleSave() {
  await onSaveOutput(draft);   // → savePromptOutputAction → updateActiveVersionOutput
  onPatch({ parsed: draft });  // mirror into the store; clears dirty
  toast.success("Saved");
}
```

with a `Button variant="outline"` labelled **Save**, a red "Unsaved changes" pill beside it, and
`dirty` handed to `PromptFocusShell` so closing the sheet confirms first.

Edits update the **active version in place** — no new version row. Carried over unchanged: a
hand edit is a correction to the plan the operator is holding, not a new candidate to compare
against, and minting a version per typo would bury the generated ones in the chip strip.

## 3. Design

### 3.1 Buffer, then save (D240)

`updateLook` / `updateBeat` drop the `onPatch` call and write `planDraft` only. `onPatch` moves
to `handleSavePlan`, alongside the persist:

```ts
async function handleSavePlan() {
  if (!planDraft) return;
  try {
    await savePromptOutputAction(nodeId, planDraft);
    onPatch({ parsed: planDraft });
    toast.success("Saved");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Save failed");
  }
}
```

**No new server action.** `savePromptOutputAction(nodeId, output: unknown)` already calls
`updateActiveVersionOutput` and already has an impersonation-audit label. Per AGENTS.md
("import, don't redefine") it is reused as-is; a `saveMultishotPlanAction` would be a rename of
an existing function, and a second thing to keep in sync in `impersonation-audit-view.ts`.

`updateActiveVersionOutput` throws when the node has no active version. Unreachable here: the
Save bar renders only under `mode === "result"`, which requires a plan, which only ever arrives
with a version row.

### 3.2 `planIsDirty` — a pure comparison (D240)

Added to `src/lib/nodes/multishot-plan.ts`:

```ts
export function planIsDirty(
  saved: MultishotPlan | null,
  draft: MultishotPlan | null,
): boolean
```

Field-wise — `look`, beat count, then each beat's `cutId` and `text` — rather than
`JSON.stringify` comparison. Stringify is order-dependent on keys and would report a plan dirty
because the server happened to serialise `beats` before `look`; it also silently starts
comparing any field later added to `MultishotPlan`, whether or not that field is operator-editable.

`MultishotPlan` is `{ version: 1; look: string; beats: MultishotBeat[] }`. `version` is a literal
and is deliberately **not** compared — it is not an operator-editable field, and a plan whose only
difference is a schema-version bump is not an unsaved edit.

Boundary cases: a null `draft` is never dirty (nothing to save); a non-null `draft` against a
null `saved` is dirty (a generated plan not yet mirrored to the store).

The view then passes `dirty={dirty}` to `PromptFocusShell`, replacing the current hardcoded
`dirty={false}` and the comment above it, which is about to stop being true:

> *Every field on this node patches the moment it changes — there is no separate Save step to
> lose, so there is nothing to confirm on close.*

### 3.3 Where the Save bar sits (D241)

At the **foot of the Output column**, as a `shrink-0 border-t` footer under that column's
scroller — structurally identical to the Generate button at the foot of the Input column in the
same file, which that file already justifies as *"at the foot of the column it acts on"*.

```
┌ OUTPUT ────────────────────────────┐
│ Generated plan        [v1][v2][v3] │
│ ▸ Look & atmosphere    [AI] [⟳]    │
│ ───────────────────────────────────│
│ 1  0-3s   Beat text…      [AI][⟳]  │
│ 2  3-6s   Beat text…      [AI][⟳]  │
├────────────────────────────────────┤
│ [ Save ]  ● Unsaved changes        │  ← shrink-0 border-t
└────────────────────────────────────┘
```

This requires splitting today's single Output `div` (which is both the flex column and the
scroller) into an `overflow-hidden` column wrapping a `flex-1 overflow-y-auto` scroller plus the
footer — the exact shape the Input column already has.

Label is **"Save"**, matching Motion Prompt verbatim. The pill is the same red
`Unsaved changes` span, copied rather than abstracted: two call sites is the threshold in
AGENTS.md, and the second one is being added here — so extraction waits for a third.

The bar belongs to the Breakup sub-tab, not to the Prompt sub-tab. Switching to Prompt with
unsaved edits is not a loss risk: the shell's close-confirm is armed by the same `dirty`, and
the Prompt tab renders `renderPlan(planDraft, …)` so the edits are visibly there.

### 3.4 Dirty locks out the AI, and restore (D242)

Every path that replaces the plan wholesale is disabled while `dirty`:

- whole-sequence `RefineWithAI`
- the look's `RefineWithAI` and its rewrite (`⟳`) button
- each `MultishotBeatCard` (its own refine and rewrite)
- the Generate / Re-generate button
- the version chips — `restoring={restoring || !!refining || dirty}`

While `dirty`, the Save bar carries the reason in place of nothing — a muted line reading
**"Save or discard your edits to rewrite with AI."** — so the dimming is never unexplained. It
renders only when `dirty`, since that is the only state in which anything is dimmed by this rule.

This is the same class of guard the file already applies twice — one refine in flight at a time,
and a restore beating an in-flight refine — both for the identical reason: a response computed
against a snapshot taken before an edit resolves afterwards and overwrites it with no error at
all. A hand edit is one more such snapshot hazard.

Accepted cost: tweaking one word now requires a Save before Re-generate. Chosen over a confirm
dialog on a frequent action, and over auto-saving before a refine — the latter quietly commits
edits the operator may have been trying out, which is the thing a Save button exists to prevent.

### 3.5 Downstream revalidation — no code

Video Gen's `persistThenRefresh` re-fetches `/api/nodes/[id]/upstream-images` on every open
(`video-gen-focus-view.tsx:635`). Once the plan is in the version row, both the preview and
`resolve-prompt.ts` read it. Nothing further is needed.

Rejected: extending `useNodeVersionUpdates` so an already-open Video Gen refreshes live. Its
filter is on the video-gen node's **own** id, so it would have to learn its upstream node ids —
real plumbing for a window that barely exists, since one focus view is open at a time.

## 4. Testing

`planIsDirty` gets unit tests in the existing `src/lib/nodes/__tests__/multishot-plan.test.ts`:
identical plans, a look edit, a beat-text edit, a differing beat count, a `cutId` mismatch at the
same index, null draft, null saved.

The view changes have no test harness — no focus view in this repo has one — and are verified by
running the app: edit a beat → Save → open the connected Video Gen → its Motion prompt preview
shows the edit.

## 5. ADR entries to append to §7

- **D240** — A Multishot plan's hand edits are buffered and saved explicitly, not patched live.
- **D241** — The Save bar sits at the foot of the Output column, beside a dirty pill.
- **D242** — A dirty plan locks out every wholesale-replacement path (refine, regenerate, restore).
