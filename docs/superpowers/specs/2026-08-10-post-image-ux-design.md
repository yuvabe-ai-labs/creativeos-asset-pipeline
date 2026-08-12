# Post node — image UX and preview fidelity

**Date:** 2026-08-10
**Status:** approved, executing directly (see §8)

## 1. Problem

Five reported defects, four of which trace to two root causes.

1. The node card's preview does not match the post you edited.
2. Dragging a Brand Kit image produces a huge, laggy drag image.
3. The Brand Kit's loading state is a bare "Loading…".
4. Connected images drag the same way — same bug as (2).
5. Brand colours are not worth having yet.

## 2. Root cause — the card preview is a second renderer

`post-layers-preview.tsx` re-implements the Konva canvas in DOM. Where the two disagree:

| Divergence | Effect |
|---|---|
| `layer.shape` never read (0 occurrences in the file) | Ellipse, triangle, star, diamond, line and arrow all draw as **rectangles** |
| `rotation` never applied | A rotated layer renders unrotated, in the wrong place |
| Group transform ignored | The canvas cancels a group's origin box (`scaleX = layer.w / origin.w`, `post-group-layer.tsx:77`); the preview does not, so a moved or resized group renders displaced |
| Text → a coloured bar | Deliberate for template tiles; wrong on a card meant to show *your* post |
| Icons → a grey block | Same |

The shape gap is the diagnostic one: seven shape primitives shipped days ago and the preview kept drawing rectangles without anyone forgetting a step. **The drift is structural, not an oversight**, and closing these five gaps by hand only resets the clock until the next canvas feature.

## 3. Fix — capture the real stage

The editor already has the true Konva stage mounted. Capture it rather than approximating it.

```ts
// src/lib/post/thumbnail.ts

/** Scale factor that fits the stage's longest edge into `maxPx`. Never upscales — a stage
 *  already smaller than the target stays 1:1 rather than being blown up and re-compressed. */
export function thumbnailPixelRatio(stageW: number, stageH: number, maxPx: number): number;

/** The stage flattened to a small JPEG data URL, or null if the canvas cannot be read. */
export function captureThumbnail(stage: Konva.Stage, maxPx?: number): string | null;
```

**JPEG at ~200px, quality 0.72, composited onto white.**

- *Not PNG:* a 200px PNG of a real post is 40–80KB of base64 — roughly fifteen times the node's own layer data, carried on every post node in the canvas payload. JPEG at this size is ~6–10KB.
- *Composited onto white:* a post with no background layer has a transparent stage, and JPEG renders transparency black. The capture fills a temporary 2D canvas white, draws the stage onto it, then encodes. White is what `post-stage.tsx:273` (`bg-white`) already shows behind the artboard, so the thumbnail matches what the operator sees.
- *Never upscales:* re-encoding a small stage larger only costs bytes.

**Captured on editor close, not on every save.** The card is not visible while the editor is open, so freshness during editing buys nothing; folding ~10KB into every two-second autosave would be waste. Two requirements:

- **Deselect first.** Konva's Transformer handles are real nodes and bake into the image. `usePostExport` already does `flushSync(() => onDeselect())` for this exact reason; the capture follows it.
- **Capture while mounted**, before `onOpenChange(false)` unmounts the stage.

**Failure is silent.** A tainted canvas or a missing stage returns null and writes nothing; the DOM preview remains. A card that cannot produce a thumbnail is not an error worth interrupting anyone over.

`thumbnail` is not owned by `usePostEditor` (which owns `layers`, `format`, `templateId` and writes all three back on every debounced save), so a direct `onPatch` is safe — unlike the format field, where a direct patch was silently reverted.

### Card precedence

1. The exported PNG, when `renderState` is `exported` — truest available: real fonts, full resolution.
2. The captured thumbnail.
3. The DOM preview — for posts nobody has opened since this ships.
4. The empty-state icon.

The DOM preview is kept, not deleted: it still serves the Templates panel, where a schematic is the right level of detail and four offscreen Konva stages would be absurd.

## 4. Fix — the drag image

`startElementDrag` sets its drag image by cloning the tile:

```ts
ghost.innerHTML = e.currentTarget.innerHTML;
```

For a picture tile that clones an `<img class="size-full">` into a container with no width of its own, so `100%` resolves against nothing and the image lays out at its **intrinsic** size. A 2000px logo becomes a 2000px drag image that the compositor carries on every pointer move. Shapes, icons and text presets feel fine because they are small vector content — which is exactly why the bug looked like it only affected pictures.

**Fix:** when the tile contains an `<img>`, build a fixed `size-10` thumbnail instead of cloning. Source it from `currentSrc` — the URL the browser actually fetched — so it reuses the decoded bitmap rather than starting a second load mid-gesture. Non-image tiles keep the clone. Add `max-w-[220px]` so a long text preset cannot produce a wide chip.

This fixes items 2 and 4 together; both panels go through this one function.

## 5. Fix — panel weight and drag churn

- `loading="lazy"` and `decoding="async"` on the Brand and Connected grids, matching `reference-image-picker/image-tile.tsx`.
- `setIsDropTarget` fires on every `dragover` (~60/s). Make it a no-op once set.

## 6. Fix — loading skeleton

Shaped like the panel it becomes — a chip row and a grid of tiles — so the layout does not jump when data lands. Uses the existing `src/components/ui/skeleton.tsx`.

## 7. Fix — defer brand colours

Removed from `SECTIONS` exactly as Details was: one line, with a comment recording why and how to restore it. The KB stores colours as model-extracted prose (`"turmeric gold #C8A000"`), so most clients have no hex at all and the section is empty for them; where it is not, the values are a guess. A palette worth clicking needs colours somebody entered deliberately, which the KB does not store.

`extractHexes`, its tests, and the API's `colours` field all stay.

## 8. Non-goals

- **Server-side thumbnails.** Tiles still fetch full-resolution originals; lazy loading defers that cost rather than removing it. The repo has no `sharp` and no `next/image` configuration, so this is its own project.
- **Closing the DOM preview's five gaps.** Superseded for the card by §3. The Templates panel keeps the schematic deliberately.
- **A separate implementation plan document.** Six changes, one new pure function, an approved design — a plan doc would restate this spec at greater length. Executing directly against these sections.

## 9. Testing

Vitest runs `environment: "node"`, so `.tsx` is `tsc`-verified only, and `captureThumbnail` needs a real canvas.

| Unit | Cases |
|---|---|
| `thumbnailPixelRatio` | Landscape and portrait both fit the long edge; never exceeds 1 for an already-small stage; a zero dimension returns a safe ratio rather than `Infinity`/`NaN` |

Everything else is verified by `npx tsc --noEmit`, `npx eslint`, the existing `src/lib/post` suite, and hand-testing.

## 10. Decisions for the ADR log (D136+)

- **D136** — The node card shows a thumbnail captured from the real Konva stage, not a DOM re-render.
- **D137** — Thumbnails are JPEG on white at ~200px, stored on the node, captured on editor close.
- **D138** — The DOM layers preview is retained for the Templates panel only.
- **D139** — Brand colours are deferred; the KB does not store deliberate palette data.
