# Post editor — Canva-style shell

**Date:** 2026-08-05
**Status:** Design approved by the user 2026-08-05; ready for implementation planning.
**Type:** Design spec (UX/layout rework of an already-shipped node type).
**Builds on:** `2026-08-03-post-node-design.md` (original design, D101–D115) and
`2026-08-04-post-editor-ux-v2-design.md` (the Canva-parity feature pass).
**Sequenced as:** Plan 1 of 3. Plan 2 = creative primitives (ellipse/line/arrow/star, draw tool).
Plan 3 = "looks good" essentials (smart guides/snapping, zoom, image crop + filters, text effects).

---

## 1. Why

The Post editor now has the *features* of a poster tool — multi-select, grouping, alignment,
context menus, undo/redo — but not the *shape* of one. Its chrome is a bottom-left `+` popover, a
template picker that hijacks the screen on open, and two fixed side panels. The user's verdict after
hand-testing: *"instead of + at bottom I need canva like layout and ui."*

This spec reworks the editor shell to match the mental model every designer already has from Canva:
a left tool rail whose items open a flyout panel, a canvas that starts clean, and an explicit,
non-destructive path to templates.

## 2. Feature audit — Canva vs. this editor

Recorded so Plans 2 and 3 have an agreed backlog rather than being re-derived later.

**Present today:** text (family/size/weight/colour/align/line-height/letter-spacing), rectangles
(fill, gradient, corner radius, stroke), images (cover/contain, radius, reset-to-natural-ratio),
icons (41 Lucide + 7 brand marks), groups, multi-select, six-way alignment, undo/redo, layer list
with rename and drag-reorder, right-click context menu, four templates, four formats, PNG export.

**Missing, ranked by impact on output quality:**

| Gap | Why it matters | Plan |
|---|---|---|
| Smart guides / snapping | The single biggest lever on whether an amateur layout looks aligned. Every placement today is freehand. | 3 |
| Shape variety (ellipse, line, arrow, triangle, star) | Circles and rules are staples of social layouts; we ship one primitive. | 2 |
| Draw / pen tool | Explicitly requested. | 2 |
| Zoom / fit-to-screen | Canvas is locked to one on-screen size; no way to work in close. | 3 |
| Image crop + adjustments (brightness/contrast/saturation) | Table stakes for product photography. | 3 |
| Text effects (shadow, outline, highlight) | What makes a headline readable over a photo. | 3 |
| Flip horizontal/vertical, duotone | Common quick wins. | 3 |
| Colour palette / eyedropper | Brand-consistent colour picking. | 3 |

**Shell gaps (this plan):** no tool rail, no flyout panels, templates modal hijacks the screen on
open and force-applies, no connected-nodes surface, right inspector restructures itself per layer
kind.

## 3. Layout

```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to canvas    Untitled post    [ig-square▾] ↶ ↷ [Download]│
├────┬─────────────┬──────────────────────────────┬──────────────┤
│ ▣  │             │                              │  TEXT        │
│Tmpl│   flyout    │                              │  ─────────   │
│ ▣  │   panel     │          canvas              │  Font  ▾     │
│Elem│   (w-64)    │                              │  Size  49    │
│ ▣  │             │                              │  Colour ▓    │
│Text│  scrollable │                              │  Align ≡     │
│ ▣  │             │                              │              │
│Conn│             │                              │  (fixed w-56)│
│ ▣  │             │                              │              │
│Layr│             │                              │              │
└────┴─────────────┴──────────────────────────────┴──────────────┘
```

- **Rail** — 56px, a vertical strip of icon buttons with micro-labels. Items, top to bottom:
  **Templates, Elements, Text, Connected, Layers**. The Draw item joins in Plan 2; it is not
  rendered as a disabled stub in this plan.
- **Flyout panel** — 256px (`w-64`), opens beside the rail. Clicking a rail item opens its panel;
  clicking the *same* item again closes it. The panel does **not** auto-close when the user returns
  to the canvas, so repeated placement (add three icons in a row) needs no re-opening.
- **Canvas** — unchanged rendering; simply gets whatever horizontal space the open panels leave.
- **Right inspector** — stays, at its current fixed `w-56`, with a normalised shell (§6).

The existing bottom-left `+` add-menu (`post-add-menu.tsx`) is **removed**; the rail replaces it.

## 4. Opening state — a clean canvas

Today `post-focus-view.tsx` lazily initialises `pickerOpen` to `true` whenever the scene has no
layers, so a fresh Post node opens behind a full-bleed template picker.

**New behaviour:** that modal and its `pickerOpen` state are deleted. A Post node opens showing a
white canvas containing only the auto-placed connected image (the existing auto-place effect is
unchanged). The Templates panel is open in the rail by default, so the next step stays discoverable,
but **no template is ever applied without an explicit click**.

## 5. Templates panel and the override dialog

The template grid moves from the modal into the flyout panel. Picking a template opens an
`AlertDialog` (the shadcn primitive; `src/components/ui/alert-dialog.tsx`):

> **Apply "Lower third"?**
> This replaces your current layout. Your connected image is kept.
> `[Cancel]` `[Apply]`

On confirm, the template's seeded layers replace all existing layers **except** image layers whose
`src.kind === "node"` — the same connected-image preservation `handlePickTemplate` already
implements today, kept verbatim. Cancel is a no-op.

The dialog shows unconditionally, including on a pristine canvas. A "skip the warning when nothing
would be lost" rule was considered and rejected: it needs a definition of "pristine" that survives
undo/redo and auto-placement, and the dialog is cheap.

## 6. Right inspector — normalised, not relocated

A Canva-style contextual toolbar above the canvas was considered and rejected in favour of keeping
the existing right panel, which stays at a fixed `w-56` and always renders (empty, single, and
multi-select states alike — already true as of the UX v2 plan's Task 15).

What changes is only its *internal* consistency: every layer kind renders the same shell — a
`text-eyebrow` kind label, then uniformly-spaced labelled sections — so switching selection changes
the panel's contents without restructuring its rhythm. This addresses the original complaint
(*"when text is selected the edit layout is completely different"*) without moving the panel.

## 7. Connected-nodes panel

A new panel listing every directly-connected image-bearing node (Image Gen / File / Draw), as
thumbnails with the source node's title beneath. `post-focus-view.tsx` already receives exactly this
data as its `connectedImageNodes: { nodeId, url }[]` prop — the panel is a new view over existing
data, requiring no new plumbing into the canvas store.

Two ways to place an image, both landing on the existing `addImage({ kind: "node", nodeId }, …)`
action:

- **Click** — adds the image centred, at a default size.
- **Drag and drop** — HTML5 drag from the thumbnail, dropped onto the Konva stage container. The drop
  point (converted from client coordinates to the stage's normalised 0–1 space via the existing
  `pxToNormalized` helper) becomes the new layer's centre.

Out of scope: past uploads, and images from unconnected nodes elsewhere on the canvas.

## 8. File structure

`post-focus-view.tsx` is already ~450 lines and would roughly double. It splits into a shell plus one
file per panel, following this codebase's one-component-per-file rule:

| File | Responsibility |
|---|---|
| `post-tool-rail.tsx` (new) | The icon rail; renders items, reports the active one. |
| `post-tool-panel.tsx` (new) | Flyout shell; switches on the active tool. |
| `post-panel-templates.tsx` (new) | Template grid + override `AlertDialog`. |
| `post-panel-elements.tsx` (new) | Shapes + icon presets (absorbs most of `post-add-menu.tsx`). |
| `post-panel-text.tsx` (new) | Text presets — heading / subheading / body. |
| `post-panel-connected.tsx` (new) | Connected-node thumbnails; click + drag-drop. |
| `post-panel-layers.tsx` (new) | Thin wrapper around the existing `PostLayerList`. |
| `post-focus-view.tsx` (modified) | Shrinks to shell/orchestrator: header, rail+panel state, canvas, inspector. |
| `post-add-menu.tsx` (deleted) | Content moves into the Elements and Text panels. |
| `post-template-picker.tsx` (deleted) | Replaced by `post-panel-templates.tsx`. |

## 9. Data model

**Unchanged.** No new layer kinds, no new persisted fields, no migration. Per **D10**'s narrow-waist
JSONB pattern, nothing here touches the database. The active rail tool is ephemeral local component
state and is deliberately *not* persisted — reopening a Post node always starts from the same place.

## 10. Testing

Per this codebase's established convention (Vitest runs in `environment: "node"`; there is no jsdom,
so no `.tsx` file in this repo is unit-tested):

- Every new component is verified by `npx tsc --noEmit` only.
- Any genuinely pure helper extracted along the way (e.g. converting a drop's client coordinates into
  normalised canvas space, if it lands in `src/lib/post/`) gets a `describe`/`it` Vitest test.
- The existing 177-test suite must stay green; this plan changes no pure logic, so no existing test
  should need editing. A test that *needs* changing is a signal that this plan has silently altered
  behaviour it claimed not to.

## 11. Explicitly out of scope

- Everything in Plans 2 and 3 (new primitives, draw tool, snapping, zoom, crop/filters, text effects).
- Brand Kit (still a stub), AI captions, compliance checks, approval flow, publishing.
- Persisting panel state, resizable panels, collapsible rail.
- OS-clipboard integration, and any change to export or the node-graph wiring.

## 12. Decisions

This spec's decisions are recorded in the single ADR log —
`2026-05-30-creativeos-staging-roadmap.md` §7 — as **D116–D121**, with full
Decision / Why / Rejected / Originated entries. In brief:

| | |
|---|---|
| **D116** | Left chrome is one icon rail + one shared flyout panel; the `+` add-menu is deleted. |
| **D117** | A Post node opens on a clean canvas; templates never auto-apply. |
| **D118** | Applying a template always confirms, and always preserves connected-node images. |
| **D119** | Layer properties stay in the fixed right inspector, normalised per kind. |
| **D120** | The layer list is a rail item in the shared flyout. |
| **D121** | The connected-nodes panel is a view over the existing `connectedImageNodes` prop. |
