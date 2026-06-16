# Draw node — in-canvas sketching → image asset

**Date:** 2026-06-16
**Status:** Designed (not implemented)
**Area:** Canvas → Draw node

## Problem

Designers storyboard and sketch to work out composition and reference framing before
generating images/video. Today that happens outside the canvas — they sketch elsewhere,
export, and upload the result as a File node. There is no way to *draw inside* CreativeOS
and feed the drawing straight into a Prompt or Image Gen node.

This adds an experimental **Draw node**: a node that opens a focus view with a drawing
surface, lets the designer sketch with a mouse or tablet, and on save exports the drawing
as a PNG that behaves exactly like a File image node downstream (vision input to a Prompt
node, or a reference to an Image Gen node).

## Goals

- New `"draw"` node type, modeled as a **special File node** (the same framing the PRD uses
  for the Script node) whose output is an image.
- Focus view with a raster drawing surface: **pen, eraser, undo, clear**, mouse + tablet.
- **Draw on top of an image:** optionally add a manual underlay (upload/paste) and sketch
  over it; the eraser rubs out ink only, never the underlay.
- On **Save**, flatten underlay + ink to one PNG and store it via the **existing** file
  upload route, populating `fileUrl` + `fileKind: "image"` so downstream consumption is
  untouched.
- Connect `draw → prompt` and `draw → image-gen`, mirroring the File image node.
- Sketch reaches the model as a real **vision attachment** for prompt generation.

## Non-goals

- **Wired underlay** (connecting an upstream image *node* into the Draw node to trace over)
  — deferred to a fast-follow. v1 underlay is manual upload/paste only.
- **Layer-preserving persistence** — v1 persists a single *flattened* PNG. Storing the
  transparent ink layer separately (for clean cross-session ink-only erasing) is a
  documented future refinement.
- **Vector / scene serialization** (tldraw/Excalidraw-style editable objects). v1 is raster.
- **Pressure-sensitive variable stroke width** — Pointer Events expose `pressure`, but v1
  uses a fixed width per pen size. Polish later.
- **Third-party drawing library.** v1 is a plain raster `<canvas>` (zero deps) — see Library
  decision.

## Library decision

Plain raster `<canvas>` + Pointer Events, **no drawing dependency**.

- The stack is React **19.2.4** / Next **16.2.6** — bleeding edge. Third-party React drawing
  components (react-sketch-canvas, Excalidraw) risk lagging peer-deps and become a
  maintenance burden on framework bumps. A plain canvas is immune to that.
- The needed features are cheap on raw canvas: eraser = `globalCompositeOperation =
  "destination-out"`; export = `toBlob()`; re-edit = reload the saved PNG.
- We build the small toolbar ourselves, which means it matches the Yuvabe design system
  rather than fighting an opinionated embedded UI.
- If strokes ever feel too mechanical, `perfect-freehand` (a ~3 KB pure function, no React
  coupling) can prettify the line later without changing the architecture.

## Design

### A. Data shape

All metadata lives in `nodes.data` JSONB (no `node_versions` — like the File node in
reference-only mode). Defined in `src/lib/canvas-nodes.ts` as `DrawNodeData`.

| Field | Type | Notes |
|---|---|---|
| `title` | `string?` | Editable by the user ("Untitled sketch") |
| `fileUrl` | `string?` | Flattened composite PNG — **the image handed downstream** |
| `fileKind` | `"image"?` | Always `"image"` when present |
| `filename` | `string?` | e.g. `"sketch.png"` |
| `underlayUrl` | `string?` | Optional manual reference image traced over (v1) |

`fileUrl` / `fileKind` deliberately reuse the File image fields so the consumption layer
treats a Draw output identically to a File image.

### B. Connections + plumbing

`VALID_CONNECTIONS` in `canvas-nodes.ts` gains:

```ts
draw: ["prompt", "image-gen"],
```

(`image-gen` is not built yet; File already lists it — harmless and forward-compatible.)

Two one-line widenings make the sketch a real model input:

- `src/lib/nodes/resolve-inputs.ts` — forward `fileUrl` / `fileKind` for `type === "draw"`
  as well as `"file"` (around lines 56–58); add `draw: "Sketch"` to `TYPE_LABEL`.
- `src/lib/nodes/compose-message.ts` — `isVisionAttachment` accepts `type === "draw"`. A
  Draw node has no extraction/`useLlm` mode, so a present `fileUrl` is always a vision
  attachment.

### C. Drawing surface & layering

Two layers at runtime, one image at rest:

- **Underlay** — the optional reference image, drawn first.
- **Ink canvas** — a transparent canvas on top; all strokes go here. Eraser uses
  `destination-out` on the ink canvas only, so it never touches the underlay.
- **Frame** — default **9:16** (vertical reel format), letterboxed/centered in the focus
  view so the frame stays a true aspect ratio regardless of window size. The sketched
  composition maps to the format the image/video model will generate.
- **Input** — the **Pointer Events API** (`pointerdown`/`pointermove`/`pointerup`) unifies
  mouse, pen, and touch; `pointerType` distinguishes them. One handler, no per-device paths.

On **Save**: composite underlay + ink onto an export canvas (`drawImage(underlay)` then
`drawImage(ink)`) → `toBlob()` → PNG.

### D. Focus view + toolbar

A bottom `Sheet` at 92 vh, matching the File/Script focus views exactly (this *is* the
"panel from the bottom"). Controlled overlay: `<DrawFocusView open onOpenChange … />`.

Bottom toolbar (a `shadow-card` panel that animates up with the design-system easing):

- **Pen** — 3 stroke widths; swatches: black (default), red, blue (red/blue earn their
  place for storyboard arrows & annotations).
- **Eraser** — toggles `destination-out` on the ink layer.
- **Undo** — in-session snapshot stack.
- **Clear** — wipes the ink layer, keeps the underlay.
- **+ Add reference** — manual underlay upload/paste (v1 scope).
- **Save** — the single primary-purple CTA; all other tools neutral.

Save flow: composite → `toBlob()` → `new File([blob], "sketch.png")` → `FormData` → POST the
existing `/api/nodes/:id/file` route → `updateNodeData({ fileUrl, fileKind: "image",
filename })` → `sonner` toast → card thumbnail updates; downstream sees the new image.

### E. Storage & persistence

- **Output / re-edit state** — the flattened PNG, stored via the existing file route →
  `fileUrl`. Re-opening loads that PNG back onto the canvas as the starting bitmap, so the
  designer can keep drawing.
- **Underlay** — `underlayUrl` persisted so the reference survives reopen.
- **Reuse** — the existing `POST /api/nodes/:id/file` route (extension/size validation, old-
  file cleanup, Supabase Storage) is used **unchanged**; PNG is an allowed extension. No new
  route. No new bucket.
- **v1 trade-off (intentional)** — the clean ink-only eraser is guaranteed *within* an
  editing session. After close/reopen, ink + underlay are a merged bitmap, so a *later*
  erase paints into the merged image. Fine for rough storyboard frames; avoids any
  vector/scene format. Layer-preserving persistence is a future refinement.
- `flowToPersisted` / `nodeRowToFlow` need no special handling — all fields live directly in
  `data` JSONB (no `parsed`/version hydration for this node).

### F. Components

| File | Responsibility |
|---|---|
| `src/components/nodes/draw-node.tsx` | Mini canvas node — header, title, sketch thumbnail, status dot, "Open ↗" |
| `src/components/nodes/draw-focus-view.tsx` | Bottom `Sheet` — drawing surface + toolbar, save handler, add-reference |
| `src/components/nodes/use-drawing-canvas.ts` | Hook — pointer handling, stroke drawing, eraser flag, undo stack, composite/export |

Registration:

- `nodeTypes` in `src/components/canvas/canvas.tsx` gains `draw: DrawNode`.
- The add-node context menu (`canvas-context-menu`) gains a "Draw" entry.

### G. Pure logic to extract (for unit testing)

- `compositeLayers(underlay, ink) → flattened` — pure given canvas/image sources.
- Vision-gate + input-forwarding widenings (tested via existing test files).

## Testing

Following the project's TDD norm: new pure logic is unit-tested (Vitest); canvas
pixel-pushing is verified manually.

- **Unit:**
  - `VALID_CONNECTIONS` — `draw → prompt` / `draw → image-gen` allowed; `draw → script`
    rejected (extend `src/lib/canvas-nodes.test.ts`).
  - `compose-message` — a `type: "draw"` upstream with a `fileUrl` becomes an `image_url`
    part (extend the compose-message test).
  - `resolve-inputs` — `fileUrl` forwarded for draw upstreams.
  - `use-drawing-canvas` — undo push/pop, eraser-mode flips composite op, export yields a
    non-empty blob (synthetic pointer events).
- **Manual:** add Draw node → Open → draw → Save → thumbnail + `fileUrl` set; reload →
  drawing survives; connect to Prompt node → Generate → sketch sent as a vision attachment;
  add reference underlay → draw over it → eraser leaves underlay intact.
- `npx tsc --noEmit` clean for the new code.

## Design-system notes

- Card uses `shadow-card`, `border-border`, `bg-card`; status dot follows the File/Script
  pattern (purple = has sketch, muted = empty); header uses `font-display` + `text-eyebrow`.
- Toolbar panel is a `shadow-card` surface with `neutral-200` border; animates up with the
  `cubic-bezier(0.22,1,0.36,1)` easing (via `motion/react` or CSS).
- Purple `#5829c7` only on the **Save** CTA and the active-tool indicator — sparingly.
- Icons: Lucide, 1.5 stroke (`Pencil`, `Eraser`, `Undo2`, `Trash2`, `ImagePlus`).

## Future refinements (out of v1)

1. **Wired underlay** — allow `file → draw` / `image-gen → draw` so a generated frame can be
   sketched over and fed back (the iterate-on-output loop). Requires Draw as a connection
   *target* + "which input is the underlay" resolution.
2. **Layer-preserving persistence** — store the transparent ink PNG separately for clean
   cross-session ink-only erasing.
3. **`perfect-freehand`** strokes + Pointer `pressure` for a more natural line.
4. **Aspect presets** (1:1, 16:9) beyond the 9:16 default.
