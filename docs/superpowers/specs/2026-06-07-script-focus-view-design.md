# Script focus view — design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)
**Area:** Script node → parsed reel script display/editing

## Problem

The Script node parses a finished reel **script** into a structured object (`data.parsed`), today
rendered read-only by [`ReelOutput`](../../../src/components/nodes/reel-output.tsx) inside a narrow
side `Sheet`. The parsed script has ~13 parts (objective, schedule, visual-script shots, on-screen
text, voiceover, music, caption, CTA, QC notes, product links, …) and the cramped sheet can't hold
them comfortably. We need a roomy surface to **read and lightly edit** the parsed script.

Terminology (kept distinct throughout):
- **parsed script** — the structured object in `data.parsed` (the output of parsing).
- **original script** — the raw text the user pasted/uploaded (`data.source`).
- **Script focus view** — the new full-screen surface for the parsed script.

## Research basis

For AI-**extraction** UIs the field converged on: dual-pane source↔fields, linked highlighting,
per-field provenance/confidence, and progressive disclosure (Shape of AI – Verification; Elicit –
Living Documents; Google Document AI HITL). We deliberately scope DOWN from the full verification
workflow to a roomy **view + edit** surface (user decision), keeping the original script as
on-demand reference rather than an always-on linked pane.

## Goals

- A full-screen, editorial, single-column document of the parsed script.
- Click-to-edit inline editing of every field, committed by an explicit **Save**.
- The **original script** available on demand (collapsed by default).
- No verification workflow, no source↔field linking, no per-field provenance (explicitly out).

## Non-goals

- No approve/edit/reject or confidence UI.
- No source-span highlighting / character offsets.
- No drag-reorder of list items.
- No new API route or DB schema change.
- No per-edit version history (manual edits do not create `node_versions` rows).

## Design

### A. Surface & launch

- A full-screen overlay built on the shadcn **`Dialog`** (Base UI registry, `render` prop) — keeps
  the canvas underneath; `Esc` / `‹ Back` closes.
- The existing node **`Sheet` is unchanged** in role: title, original-script input, slice toggles,
  Extract, and a small inline preview. After a parse, the Sheet gains an **`Expand ⤢`** button that
  opens the Script focus view.
- Default layout: **single-column** editorial document, centered, generous margins.
- Header toggle **`Show original ▸`** slides in the read-only original script as a left reference
  panel; **`◂ Hide`** collapses it. This is local UI state only (one boolean) — not persisted.

### B. Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/components/nodes/script-focus-view.tsx` | Dialog shell: header (Back, Show original, Save, dirty state), layout, source-toggle state, draft state | `script-document`, `setScriptValue` |
| `src/components/nodes/script-document.tsx` | Render the parsed script as editable sections; raw-JSON fallback for odd shapes | `editable-field` |
| `src/components/nodes/editable-field.tsx` | One reusable click-to-edit primitive (text / textarea / list-item) | — |
| `src/lib/nodes/script-edit.ts` | Pure helpers: `setScriptValue(obj, path, value)`, list `addItem`/`removeItem` | — |
| `src/components/nodes/script-node.tsx` (modify) | Add the `Expand ⤢` trigger after a parse; open the focus view | `script-focus-view` |

- `script-document` **replaces** `ReelOutput` everywhere: the Sheet's small inline preview also
  renders via `script-document` (read-only mode), and `ReelOutput` is **retired**.
- `editable-field` is the editing workhorse; every section composes it rather than re-implementing
  click-to-edit.

### C. Data flow, editing & persistence — buffered editor

1. Opening the focus view seeds a **local draft** = a structural copy of `data.parsed`.
2. Editing a field (`editable-field` commit) updates the **draft** immutably via
   `setScriptValue(draft, path, value)` — node data is NOT touched yet.
3. **Dirty tracking:** the view compares draft vs. the opened `data.parsed`. Save is enabled only
   when they differ; an "Unsaved changes" indicator reflects state.
4. **Explicit Save** commits: `updateNodeData(id, { parsed: draft })`. The existing canvas autosave
   then persists `data.parsed` to the DB (same mechanism as title/slice edits). No new endpoint.
5. **Discard / Cancel** reverts the draft to the last saved `data.parsed`.
6. Closing (`‹ Back` / `Esc`) with unsaved edits prompts a confirm-discard.

Editing model details:
- Click-to-edit: fields render as read-only text; click → input/`textarea`; Enter/blur commits to
  the draft (Esc cancels that field's edit). Editorial look, document feel.
- **List sections** (visual-script shots, on-screen-text body lines, QC notes, product links):
  edit existing items **+ add/remove** an item. No drag-reorder.
- Empty values (the strict parse returns `""`/`[]`) render as a muted placeholder ("Add objective…")
  that is still click-to-edit — never a wall of blank inputs.

### D. Error handling & fallback

- **Odd / non-script `data.parsed`:** `script-document` preserves
  [ReelOutput's existing guard](../../../src/components/nodes/reel-output.tsx#L41-L47) — if the shape
  doesn't look like a reel script, render read-only raw JSON instead of erroring (editing disabled
  in that fallback).
- **No parsed script yet:** the `Expand ⤢` trigger only appears once `data.parsed` exists.
- **Confirm-discard** guards accidental loss of unsaved edits on close.

## Data flow diagram

```
Sheet (after parse) ──Expand ⤢──▶ Script focus view (Dialog)
  open: draft = copy(data.parsed)
  edit: editable-field ▶ setScriptValue(draft, path, value)   [draft only]
  Save: updateNodeData(id, { parsed: draft }) ▶ canvas autosave ▶ DB
  Back/Esc dirty ▶ confirm-discard ; Discard ▶ draft = data.parsed
```

## Testing

- **Pure helpers (TDD, Vitest):** `setScriptValue` (set scalar at nested path incl. array index;
  returns new object, no mutation; missing-path safety), `addItem`/`removeItem` (immutable, correct
  index handling, empty-list edges).
- **Components** (`script-focus-view`, `script-document`, `editable-field`): verified via
  `npx tsc --noEmit`, `npm run lint`, and a manual run — consistent with the Task 5 approach.
- **Manual acceptance:** Expand opens full-screen; edit objective + a shot, Save persists (reopen
  shows saved); Discard reverts; Show original toggles the reference panel; odd parse shows JSON.

## Design-system notes (Yuvabe "light editorial premium")

- Document feel over form feel: read-only text by default, purple `primary` only for active/focus and
  the Save CTA. Neutrals carry the layout. ~3 type sizes. Motion easing `cubic-bezier(0.22,1,0.36,1)`.
- `Dialog` content full-bleed with generous internal margins; section labels use `.text-eyebrow`.

## Files touched

- Create: `script-focus-view.tsx`, `script-document.tsx`, `editable-field.tsx`,
  `src/lib/nodes/script-edit.ts` (+ its test)
- Modify: `script-node.tsx` (Expand trigger; swap inline preview to `script-document`)
- Remove: `reel-output.tsx` (retired; replaced by `script-document`)
