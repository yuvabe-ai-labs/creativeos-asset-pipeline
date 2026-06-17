# Draw node — in-canvas sketching → image + composition instructions

**Date:** 2026-06-16
**Status:** Implemented (`feat/draw-node`)
**Area:** Canvas → Draw node

> **Shipped deltas (this spec captures the original design; the build added):** an
> **aspect-ratio dropdown** (9:16 · 1:1 · 16:9, not 9:16-only); a **10× eraser** (40px vs 4px
> pen); opening a saved node shows the existing sketch as a **read-only thumbnail reference**
> (instead of the deferred faint-backdrop idea) and **Save confirms before overwriting**; the
> focus view is a **canvas-hero layout** (canvas + flat controls + instructions as one section,
> canvas the only shadowed element; saved sketch a thumbnail aside). Eraser uses a white pen on
> the white-fill buffer (no transparent holes), as designed. The data model, plumbing, one-shot
> model, and no-CORS rule are unchanged. Full list: see the plan's *Post-implementation
> refinements* — `docs/superpowers/plans/2026-06-16-draw-node.md`.

## Problem

Designers storyboard and sketch to work out composition before generating images/video.
Today that happens outside the canvas — they sketch elsewhere, export, and upload the result
as a File node. There is no way to *draw inside* CreativeOS and feed the drawing straight
into a Prompt or Image Gen node.

This adds an experimental **Draw node**: a node that opens a focus view with a simple drawing
surface and a "composition instructions" notes field. The designer sketches a rough
composition (mouse or tablet), types what they mean, and on **Save** the drawing is exported
as a PNG. Downstream, the node behaves like a File image node **plus** a Note node: the sketch
becomes a vision input, and the instructions become a text block — both feeding the same
Prompt / Image Gen node.

## Goals

- New `"draw"` node type, modeled as a **special File node** (the same framing the PRD uses
  for the Script node) whose output is an image.
- Focus view with a single drawing surface: **pen (black / red / green), eraser, clear**;
  mouse + tablet.
- A **composition-instructions** textarea bundled into the node; it travels downstream as a
  text block alongside the sketch.
- On **Save**, flatten the canvas to one white-background PNG and store it via the **existing**
  file upload route, populating `fileUrl` + `fileKind: "image"` so downstream consumption is
  untouched.
- Connect `draw → prompt` and `draw → image-gen`, mirroring the File image node.
- Sketch reaches the model as a real **vision attachment**; instructions reach it as text.

## Non-goals (deliberate v1 cuts — see Future refinements)

- **Re-editability** — v1 is **one-shot**. Reopening the focus view starts a fresh canvas;
  the card keeps showing the last saved thumbnail. This is the single biggest simplifier: we
  never draw the saved (cross-origin) PNG back onto a canvas, so we sidestep the entire
  canvas-taint / CORS problem and need no undo-snapshot system.
- **Draw on top of an image** (manual or wired underlay) — no compositing layers in v1.
- **Undo / redo**, **stroke-width picker**, **layers**, **vector / scene serialization**.
- **Pressure-sensitive variable stroke width** (Pointer Events expose `pressure`; not used).
- **Third-party drawing library** — v1 is a plain raster `<canvas>` (zero deps).

## Library decision

Plain raster `<canvas>` + Pointer Events, **no drawing dependency**.

- The stack is React **19.2.4** / Next **16.2.6** — bleeding edge. Third-party React drawing
  components (react-sketch-canvas, Excalidraw) risk lagging peer-deps and become a
  maintenance burden on framework bumps. A plain canvas is immune to that.
- The needed features are cheap on raw canvas: pen = stroke a path; eraser =
  `globalCompositeOperation = "destination-out"`; clear = `clearRect` + refill white; export
  = `toBlob()`.
- We build the small toolbar ourselves, so it matches the Yuvabe design system rather than
  fighting an opinionated embedded UI.
- If strokes ever feel too mechanical, `perfect-freehand` (a ~3 KB pure function, no React
  coupling) can prettify the line later without changing the architecture.

## Design

### A. Data shape

All metadata lives in `nodes.data` JSONB (no `node_versions` — like the File node in
reference-only mode). Defined in `src/lib/canvas-nodes.ts` as `DrawNodeData`.

| Field | Type | Notes |
|---|---|---|
| `title` | `string?` | Editable ("Untitled sketch") |
| `fileUrl` | `string?` | Flattened PNG — **the image handed downstream** |
| `fileKind` | `"image"?` | Always `"image"` when present |
| `filename` | `string?` | e.g. `"sketch-1718539200000.png"` |
| `instructions` | `string?` | Composition instructions — **the text handed downstream** |

`fileUrl` / `fileKind` reuse the File image fields and `instructions` mirrors the Text node's
content field, so persistence mappers (`flowToPersisted` / `nodeRowToFlow`) need no special
handling. There is exactly **one** stored image per node (the flattened sketch).

### B. Connections + plumbing

`VALID_CONNECTIONS` in `canvas-nodes.ts` gains:

```ts
draw: ["prompt", "image-gen"],
```

(`image-gen` is not built yet; File already lists it — harmless and forward-compatible.)

Three small widenings make the sketch + instructions real model inputs:

- `src/lib/nodes/node-output.ts` — add a `case "draw"` to `getNodeOutput` returning
  `String(node.data.instructions ?? "").trim()` (so the composition text becomes the node's
  downstream text, exactly like the `"text"` case).
- `src/lib/nodes/resolve-inputs.ts` — forward `fileUrl` / `fileKind` for `type === "draw"`
  as well as `"file"` (around lines 56–58); add `draw: "Sketch"` to `TYPE_LABEL`.
- `src/lib/nodes/compose-message.ts` — `isVisionAttachment` accepts `type === "draw"`. A
  Draw node has no extraction/`useLlm` mode, so a present `fileUrl` is always a vision
  attachment.

Net effect: one Draw node contributes **both** a text block (`instructions`) and a vision
`image_url` part (the sketch) to a connected Prompt node.

### C. Drawing surface

A single white-background raster `<canvas>`, **one-shot**:

- **Resolution** — fixed **720 × 1280** (9:16, vertical reel format). Displayed scaled-to-fit
  (CSS), so the saved aspect is deterministic regardless of window size. Pointer coordinates
  map to canvas pixels via one ratio from `getBoundingClientRect()`.
- **Background** — filled white on init and on clear, so the exported PNG is a clean
  white-on-black sketch (clear reference for vision; no transparency surprises).
- **Pen** — black (default), red, green; one fixed stroke width.
- **Eraser** — paints **white** (`strokeStyle = "#ffffff"`, normal `source-over`). Because the
  background is always white and there are no layers/underlay in v1, a white pen *is* the
  eraser — and unlike `destination-out` it never punches transparent holes into the exported
  PNG. (`destination-out` is reserved for the future layered/underlay refinement.)
- **Clear** — `clearRect` then refill white.
- **Input** — the **Pointer Events API** (`pointerdown`/`pointermove`/`pointerup`) unifies
  mouse, pen, and touch in one handler; `setPointerCapture` keeps strokes smooth past the
  canvas edge.

On **Save**: `canvas.toBlob(type: "image/png")` → one PNG. No layer compositing (single
canvas), so export is a one-liner and never touches a cross-origin image.

### D. Focus view + toolbar

A bottom `Sheet` at 92 vh, matching the File/Script focus views exactly (this *is* the
"panel from the bottom"). Controlled overlay: `<DrawFocusView open onOpenChange … />`.

Layout: the 9:16 canvas centered in the body; a toolbar row + the instructions textarea
docked near the bottom; Save in the header (like File's Replace/Remove actions).

- **Color swatches** — black / red / green; the active color is ringed.
- **Eraser** — toggle button; active state ringed.
- **Clear** — wipes the canvas back to white (confirm via `AlertDialog`, matching File's
  remove confirm).
- **Composition instructions** — a `Textarea` (controlled), committed to `data.instructions`
  on change/blur via `onPatch`.
- **Save** — the single primary-purple CTA; all tools neutral.

Save flow: `canvas.toBlob()` → `new File([blob], `sketch-${Date.now()}.png`, { type:
"image/png" })` → `fileNodeService.upload(nodeId, file)` (the existing service/route) →
`onPatch({ fileUrl, fileKind: "image", filename })` → `sonner` toast → card thumbnail
updates; downstream sees the new image.

> A unique `sketch-${timestamp}.png` filename per save avoids the public-URL caching gotcha
> (overwriting the *same* storage path returns an identical URL the browser would cache). The
> existing route deletes the previous `data.fileUrl` object before uploading, so no orphans
> accumulate.

### E. Storage & persistence

- **One image per node** — the flattened sketch, stored via the existing
  `POST /api/nodes/:id/file` route, used **unchanged** (PNG is an allowed extension; it
  validates size, cleans up the old object, returns the public URL).
- **Instructions** — stored in `data.instructions` (JSONB), persisted by autosave.
- **One-shot** — reopening shows a fresh white canvas (the previous sketch is not reloaded
  onto the canvas — that is what keeps us free of CORS/taint). The node **card** still shows
  the last saved thumbnail from `fileUrl`, and the instructions textarea still shows the saved
  text. Saving again replaces the image.
- `flowToPersisted` / `nodeRowToFlow` need no special handling — all fields live directly in
  `data` JSONB (no `parsed`/version hydration for this node type).

### F. Components

| File | Responsibility |
|---|---|
| `src/components/nodes/draw-node.tsx` | Mini canvas node — header, title, sketch thumbnail, status dot, "Open ↗" |
| `src/components/nodes/draw-focus-view.tsx` | Bottom `Sheet` — canvas + toolbar + instructions + Save |
| `src/components/nodes/use-drawing-canvas.ts` | Hook — pointer handling, pen/eraser/clear, `toBlob` export |

Registration:

- `nodeTypes` in `src/components/canvas/canvas.tsx` gains `draw: DrawNode`.
- `defaultData` in `src/lib/canvas-store.ts` gains a `case "draw"` → `{ title: "" }`.
- The add-node menu (`src/components/canvas/canvas-context-menu.tsx`) gains a "Draw" entry.

### G. Pure logic to extract (unit-tested)

- `src/lib/nodes/draw-canvas.ts` → `drawingContextSettings(tool, color)` returns the canvas
  context settings for the current tool: `{ globalCompositeOperation, strokeStyle }` —
  `"source-over"` + the color for the pen, `"destination-out"` for the eraser. This isolates
  the only branchy drawing logic into a pure, testable function; the hook just applies it.

## Testing

Functional core is unit-tested (Vitest); the canvas/DOM shell is verified manually.

- **Unit:**
  - `VALID_CONNECTIONS` — `draw → prompt` / `draw → image-gen` allowed; `draw → script`
    rejected (extend `src/lib/canvas-nodes.test.ts`).
  - `getNodeOutput` — a `type: "draw"` node returns its `instructions` text; empty when blank
    (extend `src/lib/nodes/node-output.test.ts`).
  - `compose-message` — a `type: "draw"` upstream with a `fileUrl` becomes an `image_url`
    part; one without a `fileUrl` does not (new `src/lib/nodes/compose-message.test.ts`).
  - `drawingContextSettings` — pen → `source-over` + color; eraser → `destination-out`
    (new `src/lib/nodes/draw-canvas.test.ts`).
- **Manual / `tsc`:** `resolve-inputs` widening (server-only) verified by `tsc` + the e2e run.
- **Manual e2e:** add Draw node → Open → draw with each color + eraser + clear → type
  instructions → Save → card thumbnail + `fileUrl` set, instructions persisted; reload →
  thumbnail + instructions survive (canvas fresh); connect to a Prompt node → Generate → the
  request carries the sketch as a vision attachment and the instructions as text.

## Design-system notes

- Card uses `shadow-card`, `border-border`, `bg-card`; status dot follows the File/Script
  pattern (purple = has sketch, muted = empty); header uses `font-display` + `text-eyebrow`.
- Toolbar lives on a `shadow-card` surface with `neutral-200` border; the active color/tool
  uses a `ring-primary` indicator. Purple `#5829c7` only on the **Save** CTA and the active
  indicator — sparingly.
- Icons: Lucide, 1.5 stroke (`Pencil`, `Eraser`, `Trash2`, `ImagePlus` unused in v1).

## Future refinements (out of v1)

1. **Re-editability** — reload the saved PNG to keep drawing, which requires handling
   canvas-taint via `crossOrigin="anonymous"` + Supabase CORS, plus an undo-snapshot system.
2. **Draw on top of an image** — manual underlay first, then **wired** underlay
   (`file → draw` / `image-gen → draw`) so a generated frame can be sketched over and fed
   back (the iterate-on-output loop). Needs Draw as a connection *target* + layer compositing.
3. **`perfect-freehand`** strokes + Pointer `pressure` for a more natural line; more colors /
   stroke widths.
4. **Aspect presets** (1:1, 16:9) beyond the 9:16 default.
