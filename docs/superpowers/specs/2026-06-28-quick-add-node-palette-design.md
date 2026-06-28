# Quick-Add Node Palette + Keyboard Shortcuts — Design

**Date:** 2026-06-28
**Status:** Proposed
**Author:** brainstormed with Claude

## Problem

Adding a node to the canvas today requires a right-click to open
`CanvasContextMenu` and a mouse click on a type. There is no keyboard path.
For a creative tool used at speed, mousing to add every node is friction.

We want a fast, discoverable, UX-conventional way to add nodes from the
keyboard, grounded in how professional node editors behave (n8n `Tab`,
Blender `Shift+A`, command palettes in Linear/VS Code).

## Goals

- **Keyboard-first add:** open an add-node surface without the mouse.
- **Spawn at the cursor:** the new node lands where the user is looking, not
  screen-center.
- **Discoverable:** new users see the full list; the surface doubles as
  feature discovery.
- **Fast for experts:** type-to-filter, plus single-letter mnemonics for
  instant creation.
- **One surface:** right-click and the keyboard open the *same* add-node UI.

## Non-goals

- App-wide command palette (export, navigate, settings). This is *add node*
  only. A `Cmd/Ctrl+K` global command surface can come later and reuse this.
- Reworking how nodes connect/auto-wire on creation (the existing
  `script → kb` auto-connect in `handleAddNode` stays as-is).

## Decisions

- **D-A. Trigger key: `/`** opens the palette at the cursor when the canvas
  pane is focused. `/` is a familiar "insert" affordance (Notion) and does not
  collide with browser focus navigation the way `Tab` would.
- **D-B. Unify menus.** Right-click (`onPaneContextMenu`) and `/` open the
  **same** Command panel. The current list body of `canvas-context-menu.tsx`
  is replaced by the new palette; positioning/dismiss logic is reused.
- **D-C. Full mnemonics now.** Each node type has a single-letter mnemonic,
  shown as a badge in each palette row **and** usable as an instant shortcut
  (press the letter with the canvas focused → create that node at the cursor,
  without opening the palette).
- **D-D. Use shadcn `Command` (Base UI variant).** Matches the `base-nova`
  registry (`components.json`) and the existing `@base-ui/react/*` import
  style. Pulls in `cmdk` (not currently a dependency) for type-to-filter,
  fuzzy match, arrow nav, and Enter-to-select.

## Mnemonic map

Collision-free across the 8 addable types (two start with "video"):

| Key | Node          | Key | Node          |
|-----|---------------|-----|---------------|
| `S` | Script        | `D` | Draw          |
| `F` | File          | `I` | Image Gen     |
| `N` | Note (text)   | `V` | Video Prompt  |
| `P` | Prompt        | `G` | Video Gen     |

(`kb` is not user-addable and is excluded, matching today's context menu.)

## UX behavior

### Opening
- **`/`** with the canvas focused → palette opens at the **last pointer
  position over the pane**, search input auto-focused, full node list visible.
- **Right-click** on the pane → same palette opens at the click position
  (existing `screenToFlowPosition` conversion).
- The "Paste image" affordance (clipboard image → File node) is preserved as a
  top item when an image is on the clipboard.

### Inside the palette
- Type to filter (cmdk fuzzy match over labels).
- ↑/↓ to move selection, Enter or click to create.
- Each row: Lucide icon + label + mnemonic badge (right-aligned).
- Esc or click-outside dismisses without creating.

### Instant mnemonics (palette closed)
- A bare letter from the map (e.g. `s`) with the canvas focused creates that
  node at the **last pointer position over the pane** and selects it.
- **Guard (critical):** the handler must ignore the keystroke when the user is
  typing — i.e. when `document.activeElement` is an `<input>`, `<textarea>`,
  or `contenteditable` element (node title/body editing). Without this guard,
  typing "s" into a text node would spawn a Script node.
- Mnemonics are **not** modified keys (no Cmd/Ctrl), so they coexist with the
  existing `Cmd/Ctrl+D` duplicate shortcut. They only fire when the palette is
  closed; while the palette is open, letters filter the list.

### After creation (all paths)
- New node is added via the existing `addNode(type, position, id)` store action
  with a fresh `crypto.randomUUID()`.
- `script` keeps its auto-connect to the `kb` node (existing
  `handleAddNode` behavior — this logic is reused, not duplicated).
- The new node is selected; the palette closes.

## Architecture & components

```
canvas.tsx
  ├─ tracks lastPointerFlowPos   (onPaneMouseMove → screenToFlowPosition)
  ├─ useKeyPress("/")            → open palette at lastPointerFlowPos
  ├─ mnemonic keydown handler    → guarded instant create
  ├─ onPaneContextMenu           → open palette at click pos (unchanged trigger)
  └─ <QuickAddMenu open position onSelect onClose hasClipboardImage />

components/canvas/quick-add-menu.tsx   (new)
  - wraps shadcn <Command> (input + grouped list) in a positioned panel
  - owns: filtering, keyboard nav (via cmdk), off-screen flip positioning
  - emits onSelect(type) / onClose()
  - single source of the node-type option list (icon, label, type, mnemonic)

components/ui/command.tsx               (new — added from Base UI registry)
  - shadcn Command primitive (cmdk-backed)

lib/canvas-node-options.ts             (new, small)
  - exported ADD_NODE_OPTIONS: { type, label, icon, mnemonic }[]
  - single source consumed by quick-add-menu and the mnemonic handler,
    so the menu list and the shortcut map can never drift apart
```

`canvas-context-menu.tsx` is removed (its body is superseded by
`QuickAddMenu`; its positioning/dismiss logic moves into `QuickAddMenu`).

### Why a shared options module
The mnemonic keydown handler and the palette rows must agree on which key maps
to which type. Putting `ADD_NODE_OPTIONS` in one module (with `mnemonic` as a
field) makes that impossible to break and keeps the canvas wiring thin.

## Data flow

```
keypress "/" ─┐
right-click ──┼─→ setQuickAdd({ open, position })
              │
QuickAddMenu ─┴─→ onSelect(type) ─→ handleAddNode(type, position)
                                       ├─ addNode(type, position, uuid)
                                       ├─ if script: connectNodes(kb, uuid)
                                       └─ select new node; close palette

bare letter ─(guarded)→ handleAddNode(type, lastPointerFlowPos)
```

## Edge cases & error handling

- **Typing in a node:** mnemonic handler returns early when an editable
  element is focused (see guard above). `/` likewise must not open the palette
  while editing — same guard.
- **No pointer position yet** (palette opened before any mouse move): fall back
  to the center of the current viewport via `screenToFlowPosition` of the pane
  center.
- **Off-screen palette:** reuse the existing flip-left/flip-top logic from
  `canvas-context-menu.tsx` so the panel stays on screen near edges.
- **Palette open + `/` pressed again:** toggles closed (command-palette
  convention).
- **Clipboard image present:** "Paste image" appears as a distinct top entry;
  selecting it runs the existing paste→File-node flow.

## Testing

- **Unit (options module):** `ADD_NODE_OPTIONS` has 8 entries, unique
  mnemonics, unique types, every `type` is a valid registered node type.
- **Component (QuickAddMenu):** renders all options; typing filters; Enter on a
  filtered item calls `onSelect` with the right type; Esc calls `onClose`;
  mnemonic badge shown per row.
- **Integration (canvas):**
  - `/` opens the palette; selecting "Script" adds a script node at the stored
    position and auto-connects to kb.
  - bare `s` with canvas focused creates a Script at the last pointer position.
  - bare `s` while a textarea is focused does **nothing** (guard).
  - right-click opens the same palette.
- Follow the project's existing test setup/conventions (TDD per repo norms).

## Rollout / scope

Single implementation plan. Order:
1. Add `Command` (Base UI) component + `cmdk` dep.
2. Add `lib/canvas-node-options.ts` (with tests).
3. Build `QuickAddMenu` (with tests).
4. Wire `canvas.tsx`: pointer tracking, `/` open, mnemonic handler (guarded),
   right-click → same palette; remove `canvas-context-menu.tsx`.
5. Integration tests + manual verification.
