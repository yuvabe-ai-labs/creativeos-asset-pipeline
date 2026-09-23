# Multishot — adding and removing shots on the node

*Design, 2026-09-23. Originates D279, D280. Refines D230 (the no-Total cut ladder), D231 (the
Multishot Prompt node) and D235 (per-model capabilities). Reverses the 2026-09-03 and
2026-09-04 operator requests that unwired `addCut` / `removeCut`.*

## 1. The problem

A Multishot node's shot count cannot be changed on the node. Adding or removing a shot means
editing the **Script**, re-parsing it, and re-fanning-out — which is a detour through a document
that governs every other generation on the canvas, to change one clip.

The Script document already has "Add shot" and "Remove shot"
(`src/components/nodes/script-document.tsx:216-240`). The Multishot node has neither, even
though it is where cut text, voiceover and seconds are already authored.

The logic is not missing. `addCut` and `removeCut` exist in
`src/lib/nodes/multishot-cuts.ts:174-195`, fully implemented and under test, with **no callers**
— they were deliberately unwired on two operator requests (2026-09-03, 2026-09-04) and their
doc comments say so. This design re-wires them.

## 2. Scope

**In:** add a shot (insert-after, and append), remove a shot. In the **focus view only**, under
an explicit **Save / Cancel** (§9) covering every edit the view makes.

**Out, decided not deferred-by-accident:**

| Not doing | Why |
|---|---|
| Reorder | Not asked for. Insert-after covers the "it belongs at position 2" case that would otherwise be reorder's only job here. |
| Duplicate | Not asked for. Cheap to add later once insert exists. |
| Controls on the card | The card is a deliberate read-only glance at 320px. Its own header comment records that the Shot node's four conditional controls on a 224px card are "exactly what splitting the node type was meant to end". |

## 3. What breaks downstream, and what does not

A Multishot Prompt's `plan` is a list of beats keyed on `cutId`. Changing the shot count breaks
the join in two directions.

**A cut with no beat is the dangerous one.** Both `renderPlan` and `checkPlanLimits`
(`src/lib/nodes/multishot-plan.ts:195`, `:331`) resolve a beat with `byId.get(cut.id) ?? ""`.
An uncovered cut therefore renders as a **shot with empty text**, passes every character-budget
check, and reaches the provider. The money path
(`src/app/api/nodes/[id]/video-generate/route.ts:98-117`) checks the model, the ladder
(`checkLadder`) and the character budgets (`checkPlanLimits`) — and **never checks that the plan
covers every cut**. It would bill a blank shot.

**A beat with no cut is harmless.** `renderPlan` walks the *cuts*, so an orphaned beat is simply
never rendered. `multishot-prompt-focus-view.tsx:279` already handles it on the display side
(`from: null`, BUG-006) rather than inventing a `0–0s` timecode.

### 3.1 This hole is not reachable today

Worth stating, because it changes what the guard in §5 is: it is **new-feature guarding, not a
bug fix**. Cut *count* can change today by exactly two routes, and neither reaches billing:

- **Fan-out** creates a fresh node with no prompt attached yet.
- **`setGenerationMode`** (the shot↔multishot flip) rebuilds cuts with fresh ids, but drops the
  node's outgoing edges in the same transaction (`src/lib/canvas-store.ts:612-619`) — on the
  stated ground that "a prompt written for a cut ladder does not describe a continuous take".
  The prompt node is left disconnected, so `resolve-prompt.ts` hard-errors on `cuts.length === 0`
  rather than rendering empty shots.

This feature is the first route that changes the shot count **while the prompt stays connected**.
The guard has to land with it, in the same change, not after.

## 4. Cut primitives — `src/lib/nodes/multishot-cuts.ts`

### 4.1 `insertCut(cuts, index, cap)`

Generalises the append-only `addCut`. `index` is the position the new cut takes; `cuts.length`
appends. Both existing guards move across unchanged:

- refused when `headroomOf(cuts, cap) < cap.minCutSeconds` — a new shot is funded by unspent
  seconds under the ceiling, never by shortening a neighbour. This is the same rule that makes
  `resizeCut` leave neighbours alone, and it is the module's stated reason for existing.
- refused when `cap.maxCuts !== null && cuts.length >= cap.maxCuts` — on Kling a 7th shot is a
  vendor rejection, not a quality hint.

The new cut is `newCut("", cap.minCutSeconds)`: empty text, and **no `voiceover` key**.
`undefined` and `[]` are different states throughout this module (`cutsFromShots`' own note), and
a new shot has not been declared silent.

`addCut(cuts, cap)` is kept as `insertCut(cuts, cuts.length, cap)` — its tests already exercise
both guards, and "append" reads better than an index at the chip's call site.

### 4.2 `canAddCut(cuts, cap): LadderCheck`

The *reason* half, so the UI never renders a dead control:

- ladder full → `` `${cap.maxTotalSeconds}s maximum reached. Shorten a shot to make room.` ``
- cut cap → `` `${cap.label} allows ${cap.maxCuts} shots.` ``

Returns the existing `LadderCheck` shape, so it composes with the sentences the focus view
already renders.

`insertCut` keeps enforcing independently. The UI check exists to write the sentence, not to hold
the invariant — a guard that lives only in a component is a guard that a second caller silently
skips.

**Tension with D97 noted deliberately.** D97 is "reject and explain rather than prevent", and it
is why every model stays selectable in the model `Select` even when `checkLadder` will refuse the
ladder. Here the affordance is *disabled with its reason stated beside it*, which is the
explaining half without the pointless click. The distinction: a model choice is a setting the
operator may want to hold while they fix the ladder; "add a 7th shot to a 6-shot model" has no
state worth holding.

### 4.3 `removeCut(cuts, index)` — unchanged

Already correct: refuses on the last cut, and nobody inherits the freed seconds — they become
headroom another shot can grow into.

### 4.4 Comments

The `DEFERRED — nothing calls this today` blocks on both functions become wrong the moment this
ships. They get rewritten, not left lying. Their *history* (that the affordance was removed twice
on operator request, and why the logic was kept) moves into D279 so the reversal is recorded
where reversals are recorded.

## 5. Plan coverage — `src/lib/nodes/multishot-plan.ts`

One pure function, the single place the question is answered:

```ts
export function planCoverage(
  plan: MultishotPlan,
  cuts: MultishotCut[],
): { unwritten: string[]; orphaned: string[] }
```

- `unwritten` — cut ids with no beat, **or a blank beat**. Blank counts because `renderPlan`
  resolves a missing beat to `""`: an empty beat and an absent one are the same shipped artifact,
  and a check that distinguishes them would pass the case it exists to catch.
- `orphaned` — beat `cutId`s no longer in `cuts`. Reported for display, never an error.

**Derived, never stored, and the plan is never written from a Multishot-node edit.** The plan
lives on a *different* node, in its `node_versions` row. Writing it from here would cross a node
boundary from a component that does not own it, and would trip `planIsDirty` into claiming
unsaved edits the operator never made.

### 5.1 Rejected alternatives

| Rejected | Why |
|---|---|
| Mutate the plan at edit time (insert an empty beat, drop the orphan) | Cross-node write from the Multishot node into the Multishot Prompt's version row. Also lights up `planIsDirty`, so the operator is told they have unsaved changes they did not make. |
| Stamp a `cutsRevision` on the node; the prompt node compares | Coarse — says "stale" without saying *which* shot, so the operator cannot act on it. A text-only edit bumps it too, producing false staleness on a plan that is genuinely complete. |
| Re-run `parsePlan` on the money path instead | `parsePlan` rejects the plan **whole** on an orphaned beat ("The writer referenced a shot that isn't in this node"). Removing a shot would invalidate a plan that renders perfectly well. Coverage is the narrower question, and the narrower question is the right one. |

## 6. The money path — `video-generate/route.ts`

A third guard, beside `checkLadder` and `checkPlanLimits`, and **above** `insertGeneration` and
`reserveCredits` for the reason that block already records: a rejected request must neither
record a generation nor touch the org's credit balance.

```
Shot 4 has no written prompt. Re-generate the Multishot Prompt, or write that shot.
```

One shot named, the first one — matching `checkLadder`'s own stated rule that an operator fixes
one thing at a time and a stacked list reads as a failure rather than an instruction.

Orphaned beats alone must still pass. A test asserts that explicitly, so a later tightening to
`parsePlan` cannot silently start refusing them.

## 7. Copy that stops being true

`checkLadder`'s cut-cap reason (`src/lib/nodes/multishot-models.ts:195`) currently ends
**"Regroup the shots on the Script."** — which is the detour this design removes.

> `${cuts.length} shots · ${cap.label} allows ${cap.maxCuts}. Remove a shot, or switch the model.`

That sentence renders verbatim on three surfaces — the Multishot card, the Multishot focus view,
and Video Gen's disabled Generate — so it must name an action reachable from all three. "Remove a
shot" is now reachable from the first two and describes the fix for the third.

## 8. The focus view — `multishot-focus-view.tsx`

Per card, in the `Shot N` header row: a ghost `+` (insert after this shot) and a ghost `X`, both
`opacity-0` → `group-hover:opacity-100` → `focus-visible:opacity-100`. This is the
`VoLinesEditor` idiom and it is there for the same reason: a six-shot strip should read as six
shots, not as twelve buttons.

`X` renders only when `cuts.length > 1`. A single-shot ladder showing a delete control that
refuses is worse than no control.

End of the strip: the dashed-primary **"Add shot"** chip, matching `script-document.tsx:238`
exactly — same border, same hover, same `Plus` icon.

When `canAddCut` fails, both add affordances are disabled and its reason **replaces** the
existing `{cap.maxTotalSeconds}s maximum reached.` line already rendered above the strip. One
sentence, in the place that sentence already lives.

Numbering is positional (`Shot {i + 1}`) so it renumbers itself. Ids are stable, so every
surviving beat keeps its binding — which is the property `MultishotCut.id`'s own doc comment says
it exists for.

All three act on the **draft** (§9), not on `onChange` directly.

## 9. Buffered edits — Save and Cancel

Every edit this view makes is buffered in a draft and committed by an explicit **Save**, matching
`script-focus-view.tsx`. Until then the node card, the connected Multishot Prompt and every
downstream reader continue to see the saved ladder.

### 9.1 What the Script does, and what carries over

| Piece | `script-focus-view.tsx` | Here |
|---|---|---|
| Draft state | `useState<ReelScript>(parsed ?? {})` | `useState<{ cuts, targetModel }>` |
| Reseed on open | render-time reset against a `seed` sentinel (`:98-102`) — React's documented alternative to a reset effect | same |
| Dirty | `JSON.stringify(draft) !== JSON.stringify(parsed)` (`:111`) | same shape, see §9.3 |
| Pill | red "Unsaved changes" (`:284-288`) | same |
| Save | `variant={dirty ? "default" : "outline"}`, `disabled={!dirty}` (`:304-311`) | same |
| Close | `requestClose()` → "Discard unsaved changes?" `AlertDialog` (`:184-196`) | same |

### 9.2 Where it cannot be literal — Save is not a DB write

The Script's Save is `await onSaveOutput(draft)` → `updateActiveVersionOutput` → its
`node_versions` row. **The Multishot node has no version row**, and there is no
`saveMultishotOutputAction`: its cuts live in node `data`, persisted by canvas autosave. Every
node in the app with a buffered Save (script, prompt, video-prompt, multishot-prompt) is a node
whose truth is a version row; this is the first that is not.

So Save here is the existing synchronous `setCuts`/`setTargetModel` pair — one
`updateNodeData(id, { cuts, totalSeconds: totalOf(cuts), targetModel })` call. It follows that:

- **no `async`, no `try`/`catch`, no error toast** — there is nothing that can reject.
- **no "Saved" toast.** The Script earns one because a row was written. Here the durable write is
  autosave's, and it has not happened yet; a toast would claim it had. The pill clearing and the
  card behind the sheet updating are the feedback, and they are truthful.

This asymmetry is the one thing a reader will trip on, so it is stated in the component and in
D280 rather than left to be rediscovered.

### 9.3 Dirty

`JSON.stringify` on `{ cuts, targetModel }`, matching the Script. Adequate here and **not** the
field-wise comparison `planIsDirty` uses: that function's own note explains it avoids stringify
because key order and later-added fields would make it lie — but it compares two independently
*constructed* objects (a server plan against a client one). Both sides here descend from the same
stored object by structural edits, so key order is stable by construction.

`MultishotCut.voiceover` is the one field where `undefined` and `[]` differ (§4.1), and
stringify preserves that distinction — an absent key and an empty array do not serialise alike.

### 9.3b The draft logic is a pure module, not component state logic

The repo has **no jsdom and no `@testing-library`** — `vitest.config.ts` sets
`environment: "node"`, and the one existing `.test.tsx`
(`mention-instruction-editor.test.tsx`) tests *exported pure functions* from a component file
rather than rendering anything. So "test the focus view's dirty/Save behaviour" has to mean
testing a pure module, and the draft logic is extracted into
**`src/lib/nodes/multishot-draft.ts`** accordingly.

This is the house pattern rather than a workaround: `src/lib/nodes/delete-confirm.ts` states it
outright — "Pure (no React) so it is unit testable and the dialog stays a thin presentational
shell."

### 9.4 Cancel

`variant="ghost"`, enabled only when dirty, reseeds the draft from the saved node data. The
`AlertDialog` close-confirm stays as well — Cancel is the deliberate exit, the confirm catches the
accidental one.

### 9.5 The guided next step

`GuidedNextButton` sits in this header and navigates away to create the Multishot Prompt — which
would be written against the **saved** cuts while the operator holds unsaved ones. It is gated on
`dirty` through the same `requestClose` confirm, worded for what is actually about to happen:

> **Discard unsaved shot edits?** · The Multishot Prompt will be written against the shots as they
> were last saved.

The Script's own `Fan out` is deliberately *not* the precedent here: it also reads saved data, but
fanning out creates nodes the operator can see and delete, whereas this one spends credits on a
writer call.

## 10. The prompt view — `multishot-prompt-focus-view.tsx`

The display side already handles the orphan direction. This adds the other:

- **Input column** — a cut with no beat renders its card with a "Not written yet" note under the
  shot text.
- **Output column** — the same sentence the route enforces, so the refusal is visible *before*
  the operator clicks Generate on Video Gen, not after.

Generating the *prompt* is not blocked by an unwritten shot — re-generating is the fix, and
blocking the fix on the problem it fixes is a deadlock. Only the video path refuses.

This view reads the **saved** cuts, never the Multishot view's draft. A half-finished ladder
never reaches it, so "unwritten shot" here always describes a real, committed gap rather than an
edit in progress.

## 11. Read-only, lineage, undo

- **Read-only (D33):** `isReadOnly` hides both affordances entirely, and Save/Cancel with them.
  Strict, matching every other control in this view.
- **Lineage:** `seededFrom` is untouched by an add or a remove. Fan-out matches on the exact
  `shotIndexes` set, not on cut count, so a hand-edited node still reads as "already on canvas" —
  it is neither duplicated nor clobbered by a later fan-out.
- **Undo:** the canvas has none (`src/lib/post/history.ts` is the post editor's alone). Before
  §9 this made removing a shot — and its voiceover lines — unrecoverable, and the design accepted
  that on the grounds that the Script's own "Remove shot" X imposes no confirm either.
  **Cancel retires that.** A removal is revertible up to Save, so no per-shot confirm is needed
  and none is added; the one confirm is the discard dialog, which covers every edit at once.

## 12. Tests

| File | Cases |
|---|---|
| `multishot-cuts.test.ts` | `insertCut` at 0, middle, end; refused at ceiling; refused at `maxCuts`; new cut has no `voiceover` key; `addCut` still appends; `canAddCut` returns each reason |
| `multishot-plan.test.ts` | `planCoverage`: exact cover, missing beat, **blank beat**, orphaned beat, both at once |
| `video-generate/route.test.ts` | 400 on an unwritten shot, asserting **no generation row and no credits reserved**; an orphaned beat alone still passes |
| `multishot-models.test.ts` | the cut-cap reason's new wording |
| `multishot-draft.test.ts` (§9.3b) | `draftIsDirty` false on a fresh draft; true after an add, a remove, a text edit, a seconds edit and a model switch; `undefined` vs `[]` voiceover stays distinguishable; `commitDraft` returns `cuts`, `totalSeconds` and `targetModel` in one object with `totalSeconds === totalOf(cuts)` |

## 13. Decisions to record

**D279 — Shots are added and removed on the Multishot node; the plan's coverage is checked, not
synced.** Reverses the 2026-09-03 / 2026-09-04 removals of `addCut` / `removeCut` from the UI.
The Multishot node owns its ladder; the Multishot Prompt's plan is joined to it by `cutId` and
that join is **verified at the boundary** (`planCoverage`, enforced on the money path) rather
than kept in lockstep by writes. Rejected: mutating the plan at edit time; a `cutsRevision`
stamp; re-running `parsePlan` on the money path. Refines D230, D231, D235.

**D280 — The Multishot focus view buffers its edits behind Save/Cancel, and its Save is a store
write, not a version write.** The cut ladder and the target model are one draft, so a model
switch previews its ceiling against the draft cuts and Cancel reverts both. Unlike every other
buffered-Save view in the app, the Multishot node has no `node_versions` row — Save is a
synchronous `updateNodeData` that autosave later persists, so it takes no `await`, cannot fail,
and deliberately emits **no "Saved" toast**, because the durable write has not happened at that
moment. Cancel also supersedes D279's acceptance of unrecoverable shot removal. Refines D230,
D279; follows `script-focus-view.tsx`'s draft/dirty/discard pattern.
