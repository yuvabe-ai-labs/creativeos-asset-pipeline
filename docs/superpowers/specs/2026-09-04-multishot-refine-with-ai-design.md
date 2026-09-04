# Refine with AI on the Multishot Prompt node

**Status:** designed, not implemented
**Refines:** D231 (the plan is JSON), §8 of `2026-09-02-multishot-node-types-design.md`

---

## 1. What this adds

The Multishot Prompt node can already re-run the look block and any single beat. What it cannot do
is say **why** — the operator gets the same output from the same inputs, and the only way to steer a
rewrite is to go and edit the standing brief in the Input column.

This adds an ephemeral steer: a `✨` button on the look card, on every beat card, and on the output
column header, each opening a popover where the operator types "tighter, and show the sole" and
presses `⌘↵`. The note applies to that one rewrite and is then gone.

The pattern is the KB's **Refine with AI** (`src/components/kb/kb-field-row.tsx`), which the operator
already knows: Sparkles ghost button → popover → autofocused textarea → `⌘↵` → the field is
re-derived. Same shape, same words, three scopes instead of one.

## 2. Two existing defects this fixes

These are the reason the work is not simply "add a textarea".

### A per-beat re-run can silently eat hand-edits

The route currently appends the whole plan and asks the writer to *"Return every beat, with the
others unchanged"*, and the client then replaces `planDraft` wholesale. Instructions of that shape
are exactly the ones models drift on. When it drifts, beats the operator hand-edited are
overwritten, nothing detects it, and the version log records the drifted plan as intended output.

### A look re-run bills a whole plan and desynchronises the version log

`handleRerunLook` issues a plain full generate and then **throws every returned beat away**. Two
consequences: the operator pays for a full plan to keep one paragraph, and `insertVersion` records
the full returned plan while the node keeps only `look` — so **the recorded version is not what the
node holds**. Restoring that version would resurrect beats the operator never accepted.

Both fall out of the same root cause: the route has one schema and one merge strategy (replace), so
a narrow edit has to be expressed as a wide one.

## 3. Approach: narrow schema per scope, merged server-side

The route gains a scope. Each scope asks the model for **only the thing being rewritten**, and the
route merges that into the plan the client supplied, then validates the merged whole with
`parsePlan`.

| `scope` | Model returns | Route merges into |
|---|---|---|
| `"all"` | `MultishotPlan` — look + every beat | nothing; it is the whole plan |
| `"look"` | `{ look: string }` | `{ ...plan, look }` |
| `"cut"` | `{ text: string }` | that one beat's `text`, by `cutId` |

Three properties follow, and each is one of the defects above closing:

- **Untouched by construction.** A `"cut"` refine physically cannot alter another beat — the model
  is never asked for one. No drift check is needed because there is nothing to drift.
- **The version records what the node holds.** The merge happens before `insertVersion`, so the
  persisted plan is the plan the operator ends up with. Restoring a version is now truthful.
- **A refine cannot break the budget.** `parsePlan` runs on the merged whole against the node's
  cuts, so the invariant D231 established — every cut covered, exactly once, in cut order — holds
  for a narrow edit exactly as it does for a full generate.

The merge itself is a pure function in `src/lib/nodes/multishot-plan.ts`, beside `parsePlan` and
sharing its cut list:

```ts
export function mergeRefinedPlan(
  plan: MultishotPlan,
  scope: "look" | "cut",
  fragment: { look?: string; text?: string },
  cutId?: string,
): PlanParseResult;   // same shape as parsePlan — merge and validation are one step
```

Returning `PlanParseResult` rather than a plan means a merge that cannot be validated is refused the
same way a bad generation is, through one code path the route already handles.

**Rejected — keep the full schema and just add the note.** Smallest diff, but it preserves both
defects: drift can still overwrite hand-edits, and a look refine still bills a full generation.

**Rejected — diff and splice on the client.** Detects drift, but the client would be deciding what
to keep from a response the server already paid for and recorded, and the version would still hold
the un-spliced plan. The merge has to live where the version is written.

## 4. Route contract

`POST /api/nodes/:id/multishot-prompt` — additive; every existing field keeps its meaning.

```ts
{
  instruction?: string;            // the sequence steer (unchanged)
  slices?: KBSliceKey[];           // unchanged
  cutInstructions?: Record<string, string>;  // the standing per-cut briefs (unchanged)
  scope?: "all" | "look" | "cut";  // NEW — defaults to "all"
  note?: string;                   // NEW — the ephemeral steer, never persisted on the node
  cutId?: string;                  // required when scope is "cut"
  plan?: MultishotPlan;            // required when scope is "look" or "cut"
}
```

`onlyCutId` is **replaced** by `scope: "cut"` + `cutId`. It has exactly one caller
(`postMultishotPrompt`), so this is a rename, not a migration — leaving both would give the route two
ways to say the same thing and a rule about which wins.

Validation, all returning 400 with a plain reason:

- `scope: "cut"` with no `cutId`, or a `cutId` not in this node's cuts
- `scope: "look"` or `"cut"` with no parseable `plan` — "Generate the whole sequence first"
- `note` longer than 2000 characters, so an accidental paste cannot silently dominate the turn

### Where the note goes in the turn

Its own trailing block, never folded into the standing instruction:

```
Apply this change, and only this change: <note>

Everything else about the shot stays as it is.
```

A one-off steer and a permanent brief are different things, and a model that cannot tell them apart
will treat "try it darker" as part of the shot's definition on every later generate.

### Prompt and schema selection

`src/prompts/multishot-prompt-generate.ts` grows two narrow schema exports beside its existing one.
The **system prompt is shared** — the writer needs the same ladder guidance, avoid-list and
reference rules whatever it is rewriting. Only the schema and the closing instruction differ, per
the reusability rule in `AGENTS.md`.

```ts
export const MULTISHOT_LOOK_SCHEMA = { /* { look: string } */ };
export const MULTISHOT_BEAT_SCHEMA = { /* { text: string } */ };
```

For `"look"` and `"cut"` the turn also carries the current plan as context, so the rewrite still
cuts against its neighbours — that behaviour exists today for `onlyCutId` and is kept.

## 5. Credits and errors

Unchanged in shape. `runPromptGeneration` still owns reserve → generation row → call → settle/refund
→ version → activate, so a refine is a normal billed generation with a normal version row.

- **422** — the merged plan fails `parsePlan`. Thrown inside `call()`, so no version is written with
  a bad plan; the existing `PlanValidationError` path covers it unchanged.
- **402** — credit limit, unchanged.
- **On any failure the node's plan is left exactly as it was.** The client only assigns `planDraft`
  on success, which is already true and stays true.

A refine records `scope`, `cutId` and the `note` in `paramsUsed`. The note is *not* persisted on the
node — but a version that cannot say what was asked of it is useless to the eval flywheel, which is
the whole reason these rows exist (D22).

## 6. UI

### The control

`RefineWithAI` — one new component, three uses. Props: `suggestions`, `placeholder`, `busy`,
`disabled`, `onSubmit(note)`.

- Sparkles ghost button, `size-6`, top-right of its card — the same slot and treatment the beat
  card's existing re-run button uses.
- Popover (`align="end"`, `w-80`): heading, one line of help, suggestion chips, `Textarea`,
  `⌘↵ to submit` hint, submit button disabled while the note is empty.
- The note clears when the popover closes. Nothing to persist, nothing to clean up.

Uses shadcn `Textarea`, not a raw `<textarea>`. The KB's popover uses a raw one, which the controls
rule in `CLAUDE.md` forbids; it is left alone as out of scope rather than fixed silently here.

### Suggestion chips

Dashed-border primary chips, the `LOOK_PRESETS` treatment already in this repo. **Clicking fills the
textarea rather than submitting** — a suggestion is a starting point to edit, and one-click-to-spend
on a card that bills a generation is the wrong affordance.

Per scope, in `src/lib/nodes/refine-suggestions.ts`:

| Scope | Chips |
|---|---|
| Look | Warmer, lower sun · Overcast and soft · Tighter lens feel · Less contrast |
| Beat | Tighter framing · Slower move · Read the product clearly · Different angle |
| All | Punchier, faster cuts · Calmer, longer holds · Less product, more life |

They are steers a director would give, not adjectives — each names a change to a physical property,
which is what the writer can act on.

### The loader

- The card being refined dims its body and spins its own Sparkles button.
- **Every refine button on the node disables while any refine runs.** Two concurrent refines both
  resolve against the `planDraft` they captured at submit time, and the second to return would
  discard the first's result with no error. One in flight at a time.
- The existing `rerunningBeatId` / `rerunningLook` state generalises to one `refining: {scope, cutId}
  | null`, which is also what drives the disable.

### Placement

```
OUTPUT                                   [✨ Refine all]
╔═ LOOK & ATMOSPHERE ═══════════════ [✨] [↻] ═╗
║ Contemporary city, late afternoon, warm low ║
║ sun, 35mm handheld…                         ║
╚═════════════════════════════════════════════╝
┌─ [0-2s] ────────────────────────── [✨] [↻] ─┐
│ Tight on a hand lifting keys, the CHUPPS    │
│ V-Straps ▣ just visible…                    │
└─────────────────────────────────────────────┘
```

The plain `↻` re-run stays beside the new `✨`. It is the no-note path, one click, and removing it
would make the cheapest action require a popover and a decision.

## 7. Testing

Pure logic, unit-tested:

- `mergeRefinedPlan(plan, scope, cutId, fragment)` — the merge, extracted so it is testable without
  a route: a `"cut"` merge changes exactly one beat and leaves the others `toBe`-identical; a
  `"look"` merge changes only `look`; an unknown `cutId` is rejected.
- The merged whole still satisfies `parsePlan` against the cuts — including that a `"cut"` refine on
  a plan whose cut list changed underneath it fails, rather than writing a plan missing a beat.
- `note` composition — present only when non-empty, always its own block, never concatenated into
  the standing instruction.
- Suggestion catalogs — non-empty, unique, and no hype adjectives (the same check
  `LOOK_PRESETS` and `SEQUENCE_ROLES` already carry).

Route tests, in the existing style:

- 400 on `scope: "cut"` with no `cutId`; 400 on `"look"`/`"cut"` with no plan.
- `paramsUsed` records `scope`, `cutId` and `note`.
- A 422 from a bad merged plan leaves no successful version.

Not tested here: that the model honours the note. That is an eval question, and the version rows
this writes are what makes it answerable later.

## 8. What this does not change

- The plan schema (`MultishotPlan`), `renderPlan`, `refsCitedIn`, and the cut list as the single home
  of durations — all unchanged. A refine is a new way to *produce* a plan, not a new plan shape.
- The chip editor, both dialects, and reference binding by `@`-mention (D233). A refine's note is
  plain text; it does not accept references.
- `sequence-roles.ts` stays parked. The suggestion chips are a short catalog of directorial steers,
  not a revival of the role taxonomy, and nothing here imports it.
- The Input column. The standing sequence steer and per-cut instructions keep their current
  meaning; the note sits beside them rather than replacing either.

## 9. ADR entry to append to §7

**D234 — A refine is a narrow rewrite merged server-side.** The Multishot Prompt node's look, any
single beat, or the whole plan can be rewritten with an ephemeral note. Each scope asks the model
for only the fragment being rewritten and the route merges it into the supplied plan before
`parsePlan` and before `insertVersion`. *Why:* asking for the whole plan and instructing "leave the
rest unchanged" is an instruction models drift on, and the drift silently overwrote hand-edited
beats; a look re-run additionally billed a full plan and recorded a version the node did not hold.
*Rejected:* keeping the wide schema and adding a note (preserves both defects); splicing on the
client (the merge must live where the version is written). *Refines:* D231.
