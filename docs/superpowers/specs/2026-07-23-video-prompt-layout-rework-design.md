# Video Prompt focus view — compose/output layout rework

**Date:** 2026-07-23
**Status:** Approved (design). Implementation pending.
**Type:** Frontend layout spec. Restructures the "Prompt" pane of
[video-prompt-focus-view.tsx](../../../src/components/nodes/video-prompt-focus-view.tsx).
**Pure layout** — no data, prompt, API, or state change.

---

## 1. Why

The current Motion prompt compose pane stacks Frame + Instruction + Camera/Speed in a cramped top
strip with the generated output below — the connected still is tiny (`w-40`), and the new visual
Camera grid is squeezed. Rework it into a **two-panel compose/output split** (mirroring the image
`prompt-focus-view.tsx`): a wider **left compose column** (bigger Frame beside Camera/Speed, then
Instruction) and a **right output column** for the generated motion prompt.

## 2. Decisions

- **Keep the left rail** (Prompt / Connected / Details / Sent-to-model) unchanged. The rework is only
  inside the `selected === "prompt"` detail pane.
- **Two columns in the Prompt pane** (drop its `max-w-3xl` cap so both columns have room):
  - **Left — compose (~58%)**, scrollable:
    - Top row: **Frame** (its own ~`w-48` column, image shown larger) **beside Camera + Speed**
      (`VideoControlsRow`, `flex-1`).
    - Below (full column width): **Instruction** (`MentionInstructionEditor`) + **Generate** button.
  - **Right — output (~42%)**, scrollable: **Generated motion prompt** — version chips, empty /
    skeleton / result states, and Save (moved here from below).
- **Camera grid → 3 columns** (was 4). At the narrower left-column width, 3-per-row keeps the tiles
  legible; 8 tiles → rows of 3 / 3 / 2. One-line change in `CameraSelect` (`columns={3}`).
- **Eval / Approval stay under the Details rail item** — out of scope for this layout pass.
- **Behavior unchanged.** All state, handlers, `runGenerate`, version/restore/save, and the compiled
  prompt are untouched — only the JSX structure of the Prompt pane moves.

## 3. Layout

```
[rail] │  LEFT — compose (~58%)              │  RIGHT — output (~42%)
       │  ┌────────┬─────────────────────┐   │  ┌────────────────────┐
       │  │ Frame  │ 🎥 Camera (3-col)   │   │  │ Generated motion   │
       │  │ (w-48) │ ⏱ Speed (chips)     │   │  │ prompt + chips     │
       │  ├────────┴─────────────────────┤   │  │ empty/skeleton/    │
       │  │ ✎ Instruction                │   │  │ result + Save      │
       │  │ [ Generate motion prompt ]   │   │  │                    │
       │  └──────────────────────────────┘   │  └────────────────────┘
```

## 4. Components

### 4.1 `src/components/nodes/camera-select.tsx` (edit)
Change `columns={4}` → `columns={3}`.

### 4.2 `src/components/nodes/video-prompt-focus-view.tsx` (edit — `selected === "prompt"` block only)
Replace the single-column `max-w-3xl` stack (frame+instruction+controls on top, output below) with a
full-width two-column flex:
- **Left column** (`w-[58%]`, `border-r`, `overflow-y-auto`):
  - Top row (`flex gap-5`): the **Frame** block (`w-48 shrink-0`; eyebrow "Frame" + the `visionFrame`
    image at a larger size, or the dashed "Connect an approved image…" placeholder) **beside**
    `VideoControlsRow` (`flex-1`; the row renders its own Camera/Speed headers).
  - Below the top row (full column width): eyebrow "Instruction" + `MentionInstructionEditor` + the
    Generate `Button`.
- **Right column** (`flex-1`, `overflow-y-auto`): the "Generated motion prompt" header +
  `PromptVersionChips` + the existing `mode` branches (skeleton / empty / result `Textarea` + Save).
- All existing handlers/props are reused verbatim; nothing else in the file changes.

## 5. Tests

Pure layout / markup — verified by `tsc` + `eslint` + manual QA. `camera-preview` tests are
unaffected (the `columns` value is a component prop, not covered by unit tests).

## 6. Verification

- `tsc` + `eslint` clean; existing suite unbroken.
- Manual: open a Motion prompt focus view → Frame is larger (left), Camera (3-col grid) + Speed sit
  beside it, Instruction + Generate below, and the generated prompt renders in the right column →
  generate / restore / save all still work → compiled prompt unchanged.
- No horizontal overflow at the real focus-view width; scroll contained per column.
