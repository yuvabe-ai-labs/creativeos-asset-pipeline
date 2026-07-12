# Simplify the Prompt focus view around editing & generation (YUV-187, folds in YUV-165)

**Date:** 2026-07-12
**Status:** Implemented — but the **Compose/Details tab** structure below was **superseded during
implementation by a left-rail master–detail** (Base UI `Tabs` didn't switch reliably inside the
bottom-sheet flex layout). The *content* decisions here still hold (instruction + shot controls,
labelled 16px output, `v1 v2…` version chips, Brand KB, review, model request, YUV-165 folded in);
only the container changed from tabs → a rail (Prompt · connected nodes · Details · Sent to model).
Model request renders as `line`-variant tabs. All controls are shadcn primitives. See **ADR D40** for
the shipped shape.
**Type:** Design spec (adds **D40**). A UX-simplification pass on the Prompt focus view.
**Decision record:** ADR **D40** (`2026-05-30-creativeos-staging-roadmap.md` §7 — appended).
**Tickets:** **YUV-187** (simplify around prompt editing/generation) and **YUV-165** (generated
output hard to find) — 165 is **folded in and delivered by this spec**, not built separately.
**Builds on / preserves:** the existing focus-view shell (bottom `Sheet`, `max-w-5xl` body, drag
handle, "Back to canvas" header — unchanged), **D29** (approval is a version flag), the eval signal,
**D33** (read-only sessions via `useCanvasEditable`), **D35/D36** (`GuidedNextButton` stays in the
header). **No backend, data-fetching, or generation-logic change** — this is a pure UI reorganization
plus one new section label.
**Origin:** the two tickets describe the same symptom (the output is buried under eval/approval/
model-request controls). Brainstormed down to: split the view into a **Compose** tab (the 90% path:
write → generate → read) and a **Details** tab (everything secondary), using the existing
`components/ui/tabs.tsx` segmented control. Hiding the clutter makes the output dominant, which is
exactly YUV-165's ask — so 165 needs no separate change.

---

## 1. Problem

The Prompt focus view (`prompt-focus-view.tsx`) shows *everything at once*:

- **Left panel (45%):** version history, Brand KB slice toggles, shot controls, connected inputs.
- **Right panel (55%):** an Instruction zone (flex 3) over an Output zone (flex 7) whose top is a
  stack of `InlineEvalBar` → `InlineApprovalBar` → `ModelRequestPanel`, with the **actual generated
  prompt textarea last**, at the bottom.

Two consequences:

1. **(YUV-187)** The primary job — writing, compiling, generating, and reading a prompt — competes
   with secondary metadata/approval/evaluation/model-request controls that most sessions never touch.
2. **(YUV-165)** The generated output has *no section header* and sits beneath the eval/approval/
   model-request stack, so it is easy to miss — especially before the user knows where to look.

## 2. Goal

Make the Prompt focus view **primarily about writing, compiling, generating, and reading the
prompt**, with everything secondary reachable but out of the way behind one explicit affordance.

- The default view is a single centered column: **Instruction → Generate → Generated prompt**.
- The generated-prompt output gets an eyebrow label and is the **most visually prominent element**
  (satisfies YUV-165's acceptance criteria).
- Brand KB, shot controls, connected inputs, version history, eval, approval, and the model-request
  panel all move to a **Details** tab, default-closed.
- Approval/eval state stays *legible* without opening Details, via a small **read-only status pill**
  in the header (a signal, not a control — preserves the "hide controls unless opened" intent).

## 3. Non-goals

- **No logic changes.** `runGenerate`, `fetchVersions`, `handleEvalDecision`, `saveApproval`,
  `handleRestoreVersion`, `handleSave`, `toggleSlice`, the compile-preview effect, and the
  shot-control seeding effect are **moved, not modified**. Same routes, same actions.
- **No new components** beyond a thin tab scaffold and the status pill. Eval/approval/model-request/
  version/connected components are reused verbatim.
- **No change to the on-canvas Prompt node**, the generate route, or version/approval persistence.
- **Not** applying the same treatment to the Video Prompt focus view in this cut. YUV-165 named
  `video-prompt-focus-view.tsx` too; see §8 — we close 165 for the Prompt view and file the Video
  Prompt view as a fast follow so this branch stays single-purpose.

## 4. Design

### 4.1 Structure — one segmented control, two tabs

Wrap the body in the existing `Tabs` (`components/ui/tabs.tsx`, `variant="default"` → the segmented
pill). Two tabs: `Compose` (default `value`) and a second tab whose **label reflects the connected
count** — `Details · {upstream.length} connected` (e.g. "Details · 2 connected"; the tab `value`
stays `details`). The `TabsList` lives in the header row. The `detailNode` drill-in
(`ConnectedDetailView`) becomes scoped **inside** the Details tab rather than overlaying the whole
body.

```
┌─ Prompt focus (bottom sheet, 92vh, max-w-5xl body) ─────────────┐
│ ← Back to canvas                                                │
│ Title (editable)   ( Compose | Details )  💲cost [pill] Save ▸  │
├─────────────────────────────────────────────────────────────────┤
│  COMPOSE (default)                    DETAILS                    │
│  ┌───────────────────────┐            ┌──────────────────────┐   │
│  │ ✎ INSTRUCTION         │            │  Brand KB slices     │   │
│  │ [textarea]            │            │  Connected inputs    │   │
│  │ [ shot controls row ] │            │  Eval bar            │   │
│  │ [ ✨ Generate prompt ]│            │  Approval bar        │   │
│  ├───────────────────────┤            │  Model request       │   │
│  │ ✨ GENERATED PROMPT  ·v1 v2 [v3]·   └──────────────────────┘   │
│  │ [BIG output textarea] │       ▲ version chips:               │
│  │ [.....................│         hover = details, click = switch│
│  │ [.....................│                                       │
│  └───────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Compose tab (the 90% path)

A single centered column (`max-w-3xl`, since the left panel is gone):

- **Instruction** — the existing eyebrow (`PencilLine` + "Instruction"), the instruction textarea
  (keep the `instructionDraft` local-mirror caret fix, verbatim), then the **shot controls row**
  (`ShotControlsRow`) — moved up here because the controls *shape the generation*, so they belong
  with the instruction, not buried in Details — then the Generate button (label logic unchanged:
  "Generating…" / "Re-generate" / "Generate prompt"). The shot-control seeding effect is unchanged;
  `onChange` still writes `onPatch({ controls })`.
- **Generated prompt** — a **new** eyebrow (`Sparkles` + "Generated prompt") matching the Instruction
  header style, with a compact **version chip strip** right-aligned in the same row (§4.2.1), above
  the output textarea. The output textarea is the dominant element: it fills the remaining height.
  `mode` states are unchanged — `skeleton` (9 shimmer rows), `empty` (dashed placeholder), `result`
  (the editable `draft` textarea). **No eval/approval/model-request render here.**

This directly satisfies **YUV-165's** acceptance criteria: eyebrow label present, output textarea is
the most prominent element, empty/skeleton states unaffected — and the eval/approval/model-request
still exist (in Details), they just no longer dominate.

### 4.2.1 Version chips (replaces the left-panel history list)

A new compact component `PromptVersionChips` renders the versions as a small inline strip — `v1 v2
v3…`, the active one filled (primary), the rest ghost — in the "Generated prompt" header row. It
replaces `PromptVersionHistory`'s full list on this surface.

- **Hover/focus** a chip → its details surface via the existing `components/ui/popover.tsx` (there is
  no `hover-card` primitive in this repo; use `Popover` for the richer content, or `tooltip.tsx` if
  the detail collapses to one line): label/index, model used, timestamp, and eval decision if any
  (the fields `PromptVersionHistory` already surfaces, from the `VersionSummary` already fetched).
- **Click** a chip → switch to that version via the **existing** `handleRestoreVersion(versionId)`
  (same route, same `setActiveVersionId` + `fetchVersions` + `onPatch({ parsed })`), with the same
  `restoring` disabled state. Switching the version updates the output textarea, the header status
  pill, and (in Details) the eval/approval/model-request for that version — all off existing state.
- Hidden when there are 0 versions (empty state unchanged). Loading uses the existing skeleton.

### 4.3 Details tab (`Details · N connected`)

The remainder, reusing existing components untouched (reusing the `LeftSection` eyebrow-header helper
already in the file), in reading order:

- **Brand KB** — `SliceToggles`, with the existing "Edit Brand KB" external link.
- **Connected inputs** — `ConnectedInputsCard` (+ its `ConnectedDetailView` drill-in, now local to
  this tab), and its existing loading skeleton. This is the count the tab label surfaces.
- **Eval** — `InlineEvalBar`, existing guard `mode === "result" && !!activeVersionId`.
- **Approval** — `InlineApprovalBar`, existing guard + `canApprove = editable && identity?.role ===
  "senior"`.
- **Model request** — `ModelRequestPanel`, existing guard `mode === "result" && activeRequest`.

**Not** in this tab (they moved to Compose): shot controls (→ instruction zone, §4.2), version
history (→ chips, §4.2.1). **Usage/cost stays in the header** (§4.4), not here.

Because generation reads the current node data (slices persist through `onPatch`), the Generate
button on Compose works regardless of the active tab — a user can toggle Brand KB slices in Details,
switch back to Compose, and generate.

### 4.4 Header + status pill

Header row: Back · editable Title · **segmented Compose / Details·N control** · **status pill** ·
**`UsagePopover` (cost/usage — stays in the header, unchanged)** · Save (when `mode === "result" &&
dirty`) · `GuidedNextButton`.

The **status pill** is read-only, renders only when `mode === "result"`, and reflects approval state:

| `approvalStatus` | Pill |
|---|---|
| `pending` | neutral "Pending review" |
| `approved` | primary/positive "Approved" |
| `changes_requested` (or eval `fail`) | warning "Needs changes" |

Styling follows the design system (soft neutral/positive/amber, `text-eyebrow`-scale, no large fill).
Clicking the pill switches to the **Details → Review** group. It exposes **no control** — it is a
signal that keeps senior reviewers oriented without violating YUV-187's "hide unless explicitly
opened." (Design decision: keep the pill — chosen over a fully-minimal Compose with no state signal.)

### 4.5 Read-only sessions (D33)

Unchanged. `editable` already gates Generate and approval; tabs are orthogonal. Both tabs render in a
read-only session; the gated controls stay disabled exactly as today.

## 5. Component & file structure

**New component (always extracted — genuinely new + self-contained):**

- `prompt-version-chips.tsx` — the inline `v1 v2 v3…` strip with per-chip hover-detail popover and
  click-to-switch (§4.2.1). Props: `versions: VersionSummary[]`, `activeVersionId`, `restoring`,
  `onSwitch(versionId)`. Pure view over data the container already holds; `onSwitch` is the existing
  `handleRestoreVersion`.

**Container:** `src/components/nodes/prompt-focus-view.tsx` keeps all state and handlers (no logic
moves out). If the two tab bodies push the file past the ~200-line component guideline (it is already
~635 lines), extract two presentational children in the **same folder**:

- `prompt-compose-tab.tsx` — instruction (+ `ShotControlsRow`) → Generate → "Generated prompt"
  (eyebrow + `PromptVersionChips`) → output textarea. Props: draft/instruction handlers, `controls` +
  `onControlsChange`, `mode`, `generating`, `editable`, `runGenerate`, `placeholder`, and the version
  props for the chips.
- `prompt-details-tab.tsx` — Brand KB slices, Connected inputs, Eval, Approval, Model request. Props:
  the existing slices/upstream/preview/eval/approval data and their handlers.

The children are pure view. This is the "split at ~200 lines, no prop drilling beyond one level" rule
from `docs/component-structure.md`. The two tab extractions are a **refactor to enable the feature**,
not speculative — do them only if the inlined version exceeds the guideline; `prompt-version-chips`
is extracted regardless.

## 6. Data flow

Unchanged from today. On open: the versions fetch + compile-preview effect run (keyed
`[open, nodeId, slices]`); shot-control seeding effect runs once. Generate/restore/save/eval/approval
all hit the same routes/actions and update the same local state. The only new state is the **active
tab** (`useState<"compose" | "details">("compose")`), local to the container. Switching tabs does not
refetch.

## 7. Testing (test-first)

Component-level (the change is structural), asserting the reorganization holds:

1. **Default tab** — on open, Compose is active; Instruction textarea, **shot controls**, and
   Generate button render on Compose.
2. **YUV-165 label** — in `result` mode a "Generated prompt" eyebrow renders and the output textarea
   shows the output; in `empty` mode the dashed placeholder renders (unchanged).
3. **Version chips (§4.2.1)** — in `result` mode with ≥1 version, the `v1 v2…` strip renders on
   Compose with the active version marked; clicking a non-active chip calls `handleRestoreVersion`
   with that id; with 0 versions the strip is absent.
4. **Secondary hidden on Compose** — eval bar, approval bar, model-request panel, Brand KB toggles,
   and connected-inputs card are **not** in the Compose tab's DOM by default.
5. **Details reveals the remainder** — the second tab's label reads `Details · {n} connected`;
   activating it renders Brand KB toggles + connected inputs, and (in `result` mode with an active
   version) eval + approval + model request. Shot controls and version history are **not** in Details.
6. **Cost stays in header** — `UsagePopover` renders in the header on both tabs (when versions exist).
7. **Status pill** — hidden in `empty`/`skeleton`; in `result` it reflects `approvalStatus`
   (`pending`/`approved`/`changes_requested`) and clicking it activates Details.
8. **Read-only (D33)** — with `editable=false`, Generate and approval controls stay disabled.

No route/action tests change (no backend change).

## 8. Rollout / ticket bookkeeping

- **YUV-187** — delivered by this spec.
- **YUV-165** — delivered by §4.2 (eyebrow + prominence) **for the Prompt focus view**; close it
  referencing this spec. Its second file, `video-prompt-focus-view.tsx`, is a **fast follow** (same
  eyebrow + prominence treatment, and optionally the same tab split) tracked separately so this
  branch stays single-purpose. Note that on the Video Prompt view if we only apply the 165 label (not
  the full tab split), do it as the minimal 165 change there.
