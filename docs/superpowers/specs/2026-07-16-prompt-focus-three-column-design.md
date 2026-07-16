# Prompt Focus View — three-column layout

**Date:** 2026-07-16
**Branch:** `worktree-minimal-agent`
**Status:** design → plan
**Supersedes the layout of:** [`prompt-focus-view.tsx`](../../../src/components/nodes/prompt-focus-view.tsx) "Prompt" pane only.
**Related:** [shot-type badge design](2026-07-16-shot-type-badge-design.md) (complementary; the badge still lands on connected rails).

## Problem

In the current Prompt focus view, the connected **Shot's text is hidden** behind a rail
click: selecting "Shot" swaps the *entire* detail pane to `ConnectedDetailView`, so the
operator loses the instruction box and the Lens/Composition/Lighting controls. But the shot
text is exactly what you read to *decide* those camera/lighting values. It must be visible
**while** composing.

## Goal

Restructure the **"Prompt" mode** of the focus view into three columns so the shot text is
always on screen next to the compose controls:

```
┌─────┬───────────────┬──────────────┐
│RAIL │ SHOT TEXT     │ GENERATED    │   center-top: shot text (read-only, always)
│Prom │ (read-only)   │ PROMPT       │   center-bottom: instruction + Lens/Comp/Lighting
│Shot │───────────────│ (output,     │   right: generated prompt (versions, save)
│prod │ INSTRUCTION   │  versions,   │
│ref  │ +Lens/Cmp/Lt  │  save)       │
│ref  │ [Generate]    │              │
└─────┴───────────────┴──────────────┘
```

(Chosen arrangement — user-approved: shot ref + compose in the **center**, output on the **right**.)

## Scope

- **Only the `selected === "prompt"` branch** of `prompt-focus-view.tsx` changes.
- `selected === "details"` and `selected === "request"` remain **full-pane takeovers**,
  unchanged.
- No API, store, or data-flow changes. All data already flows in:
  - shot text: `preview.connected.find((c) => c.type === "shot")?.text` (already fetched by
    the existing `compile-preview` effect).
  - instruction, controls, output, versions: existing props/state.

## Layout detail

The `prompt` branch becomes a 2-column flex row (the rail is already column 1 outside it):

### Center column — "Compose against the shot"
- **Top (grows, scrolls):** read-only shot text.
  - Header: `NodeIcon type="shot"` + the shot's label (+ shot-type badge from the sibling
    spec, if present).
  - Body: `whitespace-pre-wrap` shot text, muted, in a bordered `bg-muted/20` panel like
    `ConnectedDetailView`.
  - **No shot connected:** muted placeholder — "Connect a Shot to see its text and steer the
    camera & lighting." (Reuse the empty-state tone already used for `upstream.length === 0`.)
  - **Multiple shots:** show the first `type === "shot"` input (Prompt nodes carry one shot
    in practice); do not invent a picker in this pass.
- **Bottom (fixed):** the existing Instruction block moved verbatim —
  `MentionInstructionEditor` + `ShotControlsRow` + the Generate button. No logic change.

### Right column — output
- The existing "Generated prompt" block moved verbatim: eyebrow + `PromptVersionChips`,
  the skeleton / empty / result states, `Textarea`, Save + "Unsaved changes".
- **When a non-shot connected input is selected in the rail** (`isNodeSelected` and the
  selected node's `type !== "shot"`): this right column shows that input's
  `ConnectedDetailView` **instead of** the generated prompt, so file/ref detail still has a
  home. Selecting the Shot rail item is now a **no-op scroll/highlight** (its text is already
  pinned in the center) — or we simply drop the Shot from the clickable rail detail set.
  Decision: **keep Shot in the rail but make its click a no-op** (least surprising; the item
  still communicates "a Shot is connected").

## Component structure

`prompt-focus-view.tsx` is already ~660 lines. To avoid growing it and to keep one purpose
per file, extract the two new column bodies:

- `prompt-shot-reference.tsx` — the read-only shot panel (props: `text`, `label`,
  `shotType?`). Pure presentational.
- The compose block and output block can stay inline initially, but if the `prompt` branch
  exceeds ~120 lines after the change, extract `prompt-compose-column.tsx` and
  `prompt-output-column.tsx`. Prefer extraction — it keeps the file reviewable.

All controls remain shadcn primitives (no native elements). Motion/spacing per the Yuvabe
system; columns divided by `border-border`, `max-w-6xl` container preserved.

## Testing

- Manual: open a Prompt node with a connected Shot → shot text visible center while typing
  the instruction and changing Lens/Composition/Lighting; Generate → output appears right.
- Manual: Prompt node with **no** Shot → placeholder shown, compose still works.
- Manual: click a connected file/ref → its detail shows in the right column; shot + compose
  stay put. Details / Sent-to-model still take the full pane.
- Regression: version chips, restore, save, eval/approval (Details) unchanged.

## Out of scope

- Multi-shot picker.
- Any change to Details / Sent-to-model modes.
- The image-gen / video-prompt focus views (their rails still get the shot-type badge per the
  sibling spec, but no three-column change).
