# Camera + Speed visual controls (Motion/Video Prompt node)

**Date:** 2026-07-23
**Status:** Approved (design). Implementation pending (test-first).
**Type:** Frontend design spec. Refines the presentation of the `camera` and `speed` groups in the
Video Prompt node's focus view. **Renderer-only** — no data, prompt, or API change.

---

## 1. Why

The Motion prompt's two motion controls — **Camera** (9 options) and **Speed** (4 options) — are
currently plain `Select` dropdowns ([video-controls-row.tsx](../../../src/components/nodes/video-controls-row.tsx)).
Camera movement is inherently **visual** (a push-in vs an orbit vs a crane is something you *see*,
not read), so it should use the same "show-don't-tell" image tiles we shipped for the image Prompt's
shot controls (Lens/Composition/Lighting). Speed is a small 4-way choice better served by inline
chips than a dropdown (fewer clicks, always visible). This brings the Video Prompt to visual parity
with the Image Prompt.

## 2. Decisions (from the brainstorm)

- **Reuse the shot-controls system.** Camera renders through the existing
  [shot-tile-strip.tsx](../../../src/components/nodes/shot-tile-strip.tsx) `ShotTileStrip` (the shared
  shell behind Lens/Composition/Lighting) — same Auto header chip, per-tile tooltips, and
  selected-tile emphasis (full ring + inverted label pill). Speed reuses
  [param-chip-group.tsx](../../../src/components/nodes/param-chip-group.tsx) `ParamChipGroup`.
- **`ShotTileStrip` gains two small, additive capabilities** (both default-off, so Lens/Composition/
  Lighting are unaffected):
  1. a **`columns` prop** — lay tiles out as a CSS grid instead of a single flex row. Camera has 8
     tiles (Auto excluded) and needs a **4×2 grid**; the shot strips keep their single row.
  2. **placeholder support** — when a tile's image source is `""`, render a muted square with a small
     centered icon instead of a broken `<img>`.
- **Renderer-only.** [video-controls.ts](../../../src/lib/nodes/video-controls.ts) is untouched: same
  option `value`s, same `prose`, same `value`/`onChange` contract. `renderVideoControls` /
  `compilePrompt` output is byte-for-byte identical.
- **Image mapping (locked with the operator).** 6 of 8 camera options get a curated image from
  `public/camera-controls/`; 2 have no natural image and get a placeholder. `pan-right` and
  `tilt-down` are intentionally unused (single-direction is enough to convey the move):

  | Camera option | Image |
  |---|---|
  | `auto` (Auto) | — (header chip) |
  | `push-in` (Push in) | `/camera-controls/zoom-in.webp` |
  | `pull-back` (Pull back) | `/camera-controls/zoom-out.webp` |
  | `orbit` (Orbit) | `/camera-controls/tracking-shot.webp` |
  | `pan` (Pan) | `/camera-controls/pan-left.webp` |
  | `tilt` (Tilt) | `/camera-controls/tilt-up.webp` |
  | `crane` (Crane) | `/camera-controls/crane.webp` |
  | `static` (Static) | **placeholder** |
  | `handheld` (Handheld) | **placeholder** |

- **Tooltip/caption copy is free.** Each option already carries `prose` in `VIDEO_CONTROLS`
  (e.g. `push-in → "a slow push-in toward the subject"`). Reuse it verbatim as the per-tile tooltip
  and the caption — no new copy to write or research.
- **Layout: stack, don't sit side-by-side.** 8 image tiles need the full column width, so
  `VideoControlsRow` changes from two side-by-side dropdowns to **Camera (full-width grid) stacked
  above Speed (chip row)**.

## 3. Layout

```
 🎥 Camera                                   [ ✦ Auto ]     header: FieldLabel left, Auto chip right
 ┌────┐ ┌────┐ ┌────┐ ┌────┐
 │ ▨  │ │ img│ │ img│ │ img│                 row 1: Static(placeholder) · Push in · Pull back · Orbit
 └────┘ └────┘ └────┘ └────┘
 ┌────┐ ┌────┐ ┌────┐ ┌────┐
 │ img│ │ img│ │ ▨  │ │ img│                 row 2: Pan · Tilt · Handheld(placeholder) · Crane
 └────┘ └────┘ └────┘ └────┘
  Push in                                     tile label (selected → inverted pill)
 A slow push-in toward the subject            caption: prose of the selected option

 �speed Speed
 [ Auto ] [ Subtle ] [ Moderate ] [ Dynamic ]  chip group (ParamChipGroup)
```

- Camera tiles in a **4-column grid** (2 rows of 4). Order follows `VIDEO_CONTROLS` (minus Auto):
  static, push-in, pull-back, orbit, pan, tilt, handheld, crane — placeholders sit in their natural
  positions (matching the old dropdown order), not grouped at the end.
- When `camera === "auto"`: no tile ring; Auto chip is active; caption reads
  `Camera move chosen by the model`.
- Speed chips: `Auto / Subtle / Moderate / Dynamic`, active chip in brand purple (existing
  `ParamChipGroup` style — the "Studio softbox" reference).

## 4. Components

### 4.1 `src/lib/nodes/camera-preview.ts` (new) — pure, React-free, tested
Sibling of `composition-preview.ts`. Sources tiles from the `camera` group of `VIDEO_CONTROLS`.

- `CAMERA_TILES: VideoControlOption[]` — the 8 tiles in order (Auto filtered out).
- `CAMERA_AUTO: VideoControlOption` — the Auto option (header chip label).
- `CAMERA_IMAGES: Record<string, string>` — the 6 mapped images (table above). Unmapped values
  (`static`, `handheld`) are absent.
- `cameraImage(value): string` — `CAMERA_IMAGES[value] ?? ""` (`""` → placeholder).
- `cameraLabel(value): string` — the full option label from `VIDEO_CONTROLS`.
- `cameraTooltip(value): string` — the option's `prose` (e.g. "a slow push-in toward the subject");
  Auto → "Let the model choose the camera move."
- `cameraCaption(value): string` — capitalized `prose` for the selection; Auto →
  "Camera move chosen by the model".

### 4.2 `src/components/nodes/shot-tile-strip.tsx` (edit) — two additive props
- New optional props: `columns?: number` and `placeholderIcon?: LucideIcon`.
- **Container:** when `columns` is set, render `<div className="grid gap-1.5"
  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>`; otherwise the current
  `<div className="flex gap-1.5">`. (Inline style because Tailwind can't see a dynamic `grid-cols-N`.)
- **Tile width:** grid tiles use `w-full` (the cell is already `1fr`); flex tiles keep `flex-1`.
- **Placeholder:** in the tile's media frame, when `mediaSrc(opt.value) === ""` render a
  `bg-muted` square with a centered muted `placeholderIcon` (default: the strip's `icon`) instead of
  the `<img>`. Everything else (ring/scale emphasis, label pill, tooltip, caption) is unchanged.
- Lens/Composition/Lighting pass neither new prop → identical behavior (single row, always-image).

### 4.3 `src/components/nodes/camera-select.tsx` (new) — thin wrapper
Mirrors `CompositionSelect`. Renders `ShotTileStrip` with `icon={Video}`, `label="Camera"`,
`tiles={CAMERA_TILES}`, `autoOption={CAMERA_AUTO}`, `columns={4}`,
`tileLabel={cameraLabel}`, `tooltip={cameraTooltip}`, `caption={cameraCaption}`,
`mediaSrc={cameraImage}`. It does **not** override `placeholderIcon`, so placeholders fall back to
the strip's own `icon` (a muted `Video`) — a neutral "camera move, no preview" look.

### 4.4 `src/components/nodes/video-controls-row.tsx` (rewrite)
Replace the two-dropdown row with a stacked layout:
- `<CameraSelect value={controls.camera} onChange={v => onChange({ ...controls, camera: v })} />`
- a Speed block: `FieldLabel` (Gauge, "Speed") + `ParamChipGroup` over the `speed` group's options,
  `value={controls.speed}`, `onValueChange={v => onChange({ ...controls, speed: v })}`.
No prop-shape change to `VideoControlsRow`; `video-prompt-focus-view.tsx` is untouched.

## 5. Tests (written first)

- `camera-preview.test.ts` (pure): `CAMERA_TILES` = the 8 values in order, no `auto`; `CAMERA_AUTO`
  is `auto`; `cameraImage` maps the 6 known values to their exact `/camera-controls/*.webp` paths
  and returns `""` for `static`/`handheld`/unknown; `cameraCaption("auto")` names the model;
  `cameraTooltip` non-empty for every tile.
- `ShotTileStrip` grid/placeholder additions and the two new components are markup — verified by
  `tsc` + `eslint` + manual QA (consistent with the existing selectors; the suite has no jsdom/RTL).

## 6. Scope cuts / non-goals

- **Camera + Speed only.** No other video controls.
- **No new copy** — tooltips/captions reuse existing `prose`.
- **No data/prompt/API change** — `video-controls.ts`, `renderVideoControls`, `params_used.controls`,
  and the video-generate path are unchanged.
- `pan-right` / `tilt-down` remain unused (single direction conveys the move).

## 7. Verification

- `camera-preview` unit tests green; `tsc` and `eslint` clean; existing suite unbroken.
- Manual: open a Video/Motion Prompt focus view → Camera shows a 4×2 image grid (6 photos + 2
  placeholders) + an Auto chip; Speed shows 4 chips → selecting a tile updates ring + caption and
  persists to `nodes.data.controls` → Generate still sends the correct `controls` (unchanged prompt).
- Visual QA at the real focus-view width: grid legible, no overflow; brand purple only on the active
  ring/label/chip (design-system compliance).
