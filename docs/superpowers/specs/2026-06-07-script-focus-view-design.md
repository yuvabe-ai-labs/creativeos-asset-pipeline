# Script focus view — design (v2: Sheet-free, 3-state)

**Date:** 2026-06-07 (revised)
**Status:** Approved (pending spec review)
**Area:** Script node → parsed reel script display/editing

## Problem

The Script node parses a finished reel **script** into a structured object (`data.parsed`).
The original v1 flow split work across a side `Sheet` (input/parse) and an inline read-only
preview. That split is being **replaced**: the node's `Open` now launches a single full-screen
**Script focus view** that owns the whole lifecycle — upload, parse, review, and edit. The Sheet is
removed.

Terminology (kept distinct):
- **parsed script** — the structured object in `data.parsed` (output of parsing).
- **original script** — the raw text uploaded/pasted (`data.source`).
- **Script focus view** — the single full-screen surface for the Script node.

## Goals

- Clicking the node's **Open** launches the full-screen focus view directly (no Sheet).
- The focus view is a **three-state machine: EMPTY → SKELETON → PARSED.**
- **EMPTY:** upload `.md/.txt` or paste, a title field, and brand-context slice toggles.
- **Auto-parse:** uploading fires extraction immediately; pasting fires it on blur. No Extract button.
- **SKELETON:** a shimmer placeholder shaped like the document while the model runs.
- **PARSED:** the editable document with explicit **Save**, **Re-extract**, **Replace script**, and
  **Show original**.
- Click-to-edit inline editing; manual edits buffered and committed by explicit Save.

## Non-goals

- No Sheet (removed). No verification workflow, no source↔field linking, no per-field provenance.
- No drag-reorder of list items. No new API route or DB schema change.
- No per-edit version history (manual edits don't create `node_versions` rows; parses do, via the
  existing route).

## Design

### A. Surface, launch & node

- The canvas **Script node shrinks to a launcher**: title (or "Untitled script"), a parsed/not status
  dot, an **Open** affordance, and the React Flow handles. No Sheet, no inline preview.
- **Open** opens a full-screen overlay on the shadcn **`Dialog`** primitives (`@base-ui/react/dialog`)
  — canvas stays underneath; `Esc` / `‹ Back` closes (confirm-discard if there are unsaved edits).
- The focus view chooses its state on open: `parsing` → SKELETON; else `data.parsed` present →
  PARSED; else → EMPTY.

### B. State machine

```
        upload / paste(blur)            parse success
EMPTY ───────────(auto-parse)──▶ SKELETON ───────────▶ PARSED
  ▲                                  │  parse error        │ Replace script
  └──────────────────────────────────┴─────────────────────┘
```

- **EMPTY:** `ScriptEmptyState` — upload/paste, title, slice toggles (default recommended). Submitting
  a non-empty source persists it and starts a parse.
- **SKELETON:** `ScriptSkeleton` — shimmer rows shaped like the document.
- **PARSED:** `ScriptDocument` (existing) + header actions: Save (explicit, manual edits),
  Re-extract (re-run parse, e.g. after slice change), Replace script (→ EMPTY), Show original.

### C. Components & boundaries

| Unit | Responsibility | Status |
|---|---|---|
| `src/components/nodes/script-node.tsx` | Launcher: title + status dot + Open; renders focus view; no Sheet | rework |
| `src/components/nodes/script-focus-view.tsx` | Dialog shell + state machine; owns `source`, title, slices, the parse fetch, draft/Save | rework |
| `src/components/nodes/script-empty-state.tsx` | Upload/paste + title + slice toggles; raises `onSubmit(source)` | new |
| `src/components/nodes/script-skeleton.tsx` | Loading placeholder shaped like the document | new |
| `src/components/nodes/slice-toggles.tsx` | Reusable brand-context chip row (extracted from the node) | new |
| `src/components/nodes/script-document.tsx` | Editable/read-only parsed-script renderer | unchanged |
| `src/components/nodes/editable-field.tsx` | Click-to-edit primitive | unchanged |
| `src/lib/nodes/script-edit.ts`, `src/lib/nodes/reel-script.ts` | Pure helpers + type/guard | unchanged |

`slice-toggles.tsx` is the DRY extraction: both the node's old inline chips and the EMPTY state used
the same `KB_PARSE_SLICES` map — now one component.

### D. Data flow, parse & persistence

1. **EMPTY → parse:** on upload (immediately) or paste (on blur), the focus view calls
   `updateNodeData(id, { source })` then `POST /api/nodes/:id/parse` with `{ source, slices }`
   (existing endpoint). State → SKELETON.
2. **Success:** `updateNodeData(id, { parsed: output })`, seed the editable **draft** from `output`
   (clean), state → PARSED. The route logs a `node_versions` row + sets active (unchanged).
3. **Error:** toast the message, return to EMPTY with `source` retained.
4. **Manual edits (PARSED):** mutate the draft immutably via `setScriptValue`/`addItem`/`removeItem`;
   **Save** commits `updateNodeData(id, { parsed: draft })`. Dirty tracking enables Save; closing with
   unsaved edits prompts confirm-discard.
5. **Re-extract:** re-runs step 1's parse with the current `source` + slices (overwrites parsed).
6. **Replace script:** clears to EMPTY (keeps `source` editable) for a new upload/paste.

### E. States & fallback

- **EMPTY** when no `source` and no `parsed`. **SKELETON** while a parse is in flight. **PARSED** when
  `parsed` exists.
- **Odd/non-script `parsed`:** `ScriptDocument` falls back to read-only raw JSON (existing guard).
- **Confirm-discard** guards unsaved manual edits on close.

## Testing

- **Pure helpers** stay TDD'd (`script-edit`, `reel-script` guard) — already done.
- **Components** (`script-node`, `script-focus-view`, `script-empty-state`, `script-skeleton`,
  `slice-toggles`): verified via `npx tsc --noEmit`, `npm run lint`, production `npm run build`, and a
  manual run.
- **Manual acceptance:** add a Script node → Open → EMPTY; upload a `.md` → SKELETON → PARSED; edit a
  field, Save persists (reopen shows it); Re-extract re-runs; Replace script returns to EMPTY; Show
  original toggles the reference panel; Back with unsaved edits confirms discard.

## Design-system notes (Yuvabe "light editorial premium")

- Document feel over form feel; purple `primary` only for active/focus, Save, and chip-active.
- Skeleton uses neutral shimmer (no spinner walls). Motion easing `cubic-bezier(0.22,1,0.36,1)`.
- Full-bleed `Dialog` popup with generous internal margins; section labels use `.text-eyebrow`.

## Migration note

This supersedes the v1 (Sheet + inline preview) design in the same file. `ReelOutput` was already
retired in v1 implementation; the Sheet block in `script-node.tsx` is removed here. The pure helpers,
`EditableField`, and `ScriptDocument` built in v1 are reused unchanged.
