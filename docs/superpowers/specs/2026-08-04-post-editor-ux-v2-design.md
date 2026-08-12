# Post editor UX v2 — Canva-parity pass

**Date:** 2026-08-04
**Status:** Design approved by the user 2026-08-04; ready for implementation planning.
**Type:** Design spec (UX/feature pass on an already-shipped node type).
**Builds on:** `docs/superpowers/plans/2026-08-03-post-node.md` (the 22-task build this iterates on)
and `docs/superpowers/specs/2026-08-03-post-node-design.md` (original design, D101-D115).

---

## 1. Why

The Post node (poster editor, react-konva-based) shipped and was hand-tested by the user against a
real image. The core plumbing works end-to-end — connected-image auto-place, template seeding,
selection, drag/resize/rotate, the inspector — but the editing experience itself falls short of
Canva, which is the explicit bar the user set: *"take all inspiration from Canva... the ux is very
bad."* This spec is a UX-completeness pass, not a rebuild. Eleven concrete complaints, grouped into
eight workstreams below.

## 2. Scope decisions already made with the user

- **Multi-select + grouping**: in scope. Align and group/ungroup only make sense with multi-select,
  and the user explicitly chose "add real multi-select" over scoping align down to single-layer.
- **Shape primitives**: NOT expanding. "More icons/shapes" means more icon presets and more styling
  range (stroke added) on the existing rectangle shape — not new shape kinds (ellipse/line/star).
- **Image proportion**: shift-drag locks aspect ratio during resize, plus a one-click "reset to
  natural ratio" action. Not a free-form crop tool.

## 3. Workstream 1 — Debounced save + no-lag typing

**Problem:** `usePostEditor`'s `onChange` fires a full `onPatch` round-trip (→ `updateNodeData` →
canvas store → autosave chain) on every commit. Every inspector text/number field currently commits
on every keystroke (`post-focus-view.tsx`'s inspector `onChange` handler calls `updateLayerLive` +
`commitLayerChange()` synchronously per change event) — so typing "32" into the font-size field
fires two full save round-trips. This is very likely the reported lag, and was independently flagged
as a Minor finding in the prior final review.

**Fix:**
- Wrap the `onChange` callback passed into `usePostEditor` in a 2-second debounce (trailing edge) —
  local editing stays instant (the stage renders off the hook's own `layers` state, not off the
  round-trip), only the outer persistence write is throttled.
- Inspector text/number/color inputs (`post-inspector-text.tsx`, `post-inspector-shape.tsx`) commit
  on **blur** (or `Enter`), not on every `onChange` event. Live-updates the visible layer via
  `updateLayerLive` as the user types (so the canvas still feels responsive) but only calls
  `commitLayerChange()` once, on blur — matching how every other discrete-vs-gesture action in this
  hook already works.

## 4. Workstream 2 — Cleanup

- Remove the "Copy image brief" button and its `copyZoneHint` wiring from `post-template-picker.tsx`.
- The CTA "pill" shape currently has no text of its own — a designer selects it and finds no text
  field in the inspector, which is the reported confusion. Fix: every template that seeds a CTA pill
  seeds it as a **group** (see Workstream 4) containing a shape layer (the pill) + a text layer
  ("Shop Now" / "Learn More", editable, centered) — so it behaves like a real button from the moment
  it's placed, not a shape the designer has to figure out how to label.

## 5. Workstream 3 — Toolbar & inspector consistency

- The header toolbar becomes persistent and includes visible **Undo**/**Redo** buttons (wired to
  `canUndo`/`canRedo`, already computed by `usePostEditor` but currently unrendered — this was flagged
  as dead UI surface in the prior review), disabled when there's nothing to undo/redo. Order:
  Undo, Redo, then the existing Preview / Publish (disabled) / Download.
- The right inspector panel keeps a **fixed width and consistent header treatment** across all
  states — empty ("select a layer"), single-layer, and multi-select — so selecting something doesn't
  restructure the surrounding layout, only fills in the panel's content.

## 6. Workstream 4 — Multi-select + grouping

**Selection model:** `usePostEditor`'s `selectedId: string | null` becomes `selectedIds: string[]`
(rename call sites accordingly). `selectLayer(id)` replaces the selection with `[id]`;
`toggleLayerSelection(id)` (new) adds/removes `id` from the current selection for shift-click.

**Rubber-band select:** dragging on empty stage area draws a selection rectangle (a plain Konva
`Rect` with dashed stroke, not persisted as a layer); on release, select every layer whose bounding
box intersects it.

**Multi-node Transformer:** Konva's `Transformer` already supports attaching to multiple nodes
(`transformer.nodes([...])` accepts an array) — `post-stage.tsx`'s existing sync effect extends from
"resolve one node from `nodeRefs`" to "resolve every id in `selectedIds`."

**Grouping:** add a new `PostLayer` variant:
```typescript
export type GroupLayer = LayerBase & { kind: "group"; childIds: string[] };
```
`PostLayer` becomes `TextLayer | ShapeLayer | ImageLayer | IconLayer | GroupLayer`. A group's own
`x/y/w/h` is the bounding box of its children at creation time; children keep their own `x/y/w/h` as
offsets normalized against the group's box (so moving/resizing the group moves/scales children
together — same math Konva's own nested-`Group` transform already provides for free via the
coordinate system, so this is mostly "render a `GroupLayer` as a Konva `Group` containing its
children's own renders," not new geometry math).
- **Group** (multi-select, 2+ layers, context menu or `Cmd/Ctrl+G`): creates a `GroupLayer` with the
  selected ids as `childIds`, removes those layers from the top-level array, inserts the group at the
  frontmost selected layer's position, selects the new group.
- **Ungroup** (a `GroupLayer` selected, context menu or `Cmd/Ctrl+Shift+G`): removes the group,
  reinserts its children at the group's former position (in their original relative order), selects
  all the former children.

**Align** (context menu, requires a selection):
- Left / Center-horizontal / Right / Top / Middle-vertical / Bottom.
- With 2+ layers selected: aligns relative to the selection's combined bounding box.
- With exactly 1 layer selected: aligns relative to the canvas (0..1 normalized space).

## 7. Workstream 5 — Right-click layer context menu

Right-clicking a layer (or an active multi-select) on the stage opens a `ContextMenu` (the same
shadcn/Base UI primitive this codebase's existing `NodeContextMenu` — canvas-level, node cards —
already uses; same visual language, a different trigger surface). Contents:

| Item | Enabled when |
|---|---|
| Cut / Copy / Paste | always (paste disabled if clipboard empty) |
| Duplicate | always |
| Delete | always |
| Lock / Unlock | always (label flips per current state) |
| Bring to Front / Forward / Backward / Send to Back | always |
| Group | 2+ layers selected |
| Ungroup | exactly one `GroupLayer` selected |
| Align (submenu: Left/Center/Right/Top/Middle/Bottom) | 1+ layers selected |

Copy/Paste uses an in-memory clipboard (module-level ref, not the OS clipboard) holding a deep copy
of the selected layer(s); Paste inserts fresh-id copies offset by the same nudge used by
`duplicateLayer` (+0.02/+0.02), selects the pasted layers.

The left panel's hover-action row (already built: hide/lock/duplicate/delete) and this new context
menu both call the same underlying `usePostEditor` actions — no duplicated logic, two entry points
into one action set.

## 8. Workstream 6 — Left panel improvements

- **Inline rename**: double-click a layer's name in the list swaps it for an `EditableField` (the
  same click-to-edit component already used for node titles elsewhere in this app), committing to
  `layer.name` on blur/Enter.
- **Drag-and-drop reorder**: replaces `]`/`[` as the primary way to reorder (those keyboard shortcuts
  stay as a secondary path, unchanged). Dragging a row to a new position calls `reorderLayer` with
  the equivalent explicit index.
- **Multi-select sync**: shift/ctrl-click in the list adds to `selectedIds`, mirroring the stage's
  shift-click; selecting on the stage highlights the same rows in the list.

## 9. Workstream 7 — More icons, more shape styling

- Expand `LUCIDE_PRESET` in `post-add-menu.tsx` from ~6 entries to a categorized set (communication,
  commerce, arrows/UI, misc) of roughly 30-40 real, existing `lucide-react` icon names.
- Expand `SIMPLE_PRESET` to add X (Twitter), YouTube, and TikTok alongside the current four
  (Instagram/Facebook/WhatsApp/LinkedIn) — verify each exists in the installed `simple-icons`
  package (16.28.0) before adding, same verification discipline as the original icon-resolution task.
- Add an optional **stroke** to `ShapeLayer`: `stroke?: { color: string; width: number }`, rendered
  via Konva `Rect`'s native `stroke`/`strokeWidth` props, editable in `post-inspector-shape.tsx`
  (an on/off toggle + color + width, matching the existing solid/gradient toggle's visual pattern).

## 10. Workstream 8 — Image proportion handling

- **Shift-drag proportional resize**: Konva's `Transformer` has native support for this — while a
  resize anchor is being dragged with the Shift key held, constrain the resize to the node's current
  aspect ratio. Wire this via the `Transformer`'s `keepRatio`-related anchor-drag handling (check the
  installed Konva version's exact API for shift-modifier detection during `onTransform` — depending
  on the version this may need a small custom `anchorDragBoundFunc` reading `event.evt.shiftKey`
  rather than a static prop, since `keepRatio: true` alone would lock ALL resizes, not just
  shift-held ones).
- **Reset to natural ratio**: a new action (inspector button on image layers + context-menu item),
  available only for image layers where the loaded image's natural dimensions are known: recomputes
  the layer's `w`/`h` to match the image's natural aspect ratio, keeping the box's center point fixed
  and keeping `w` (or whichever dimension is larger) unchanged — i.e. un-stretch without moving or
  wildly resizing the layer.

## 11. Explicitly out of scope for this pass

- New shape primitives (ellipse/line/star) — confirmed out per user's answer.
- OS-level clipboard integration for copy/paste (in-memory only).
- Persisting/restoring rubber-band selection state across reloads (selection is always ephemeral,
  same as today).
- Everything already out of scope for the Post node generally: Brand Kit, AI captions, compliance,
  approval, publishing.

## 12. Testing

Per this codebase's established convention for this feature (no jsdom, no browser testing available
this session): every genuinely pure piece gets a Vitest test —
- `groupLayers`/`ungroupLayers` (new pure functions in `src/lib/post/layers.ts`).
- Align math (`src/lib/post/align.ts`, new — computing target x/y for a given alignment mode against
  a bounding box).
- The natural-ratio-reset math (extends `src/lib/post/image-fit.ts` from the prior fix batch).
- The debounce utility itself, if hand-rolled rather than an existing dependency (check first —
  `use-debounce` or similar may already be a reasonable small addition, or a simple `setTimeout`
  wrapper is fine given this codebase has no existing debounce utility to reuse per an earlier grep
  of this session).
React/Konva component wiring (multi-select, context menu, drag-reorder, toolbar) stays
verified-by-`tsc`-only, consistent with every other component in this feature.
