# Visual Lens Selector (Prompt node shot controls)

**Date:** 2026-07-21
**Status:** Approved (design). Implementation pending (test-first).
**Type:** Frontend design spec. Refines the presentation of the `lens` group from
[2026-06-14-shot-controls-design.md](2026-06-14-shot-controls-design.md). **Renderer-only** — no
data, prompt, or API change.

---

## 1. Why

The `lens` shot control is currently a row of text pills (`Auto / Wide 24mm / … / Macro 100mm`) —
identical to Composition and Lighting. Focal length is the one control whose effect is inherently
**visual**: a longer lens crops tighter. Text pills make the operator *read and translate* "85mm"
into an expected framing. A **show-don't-tell** control — the same photo cropped progressively
tighter across the options — communicates the choice at a glance and makes the panel feel like a
creative tool rather than a form. (Ref supplied by the operator; the pattern is a tile row that
zooms from wide scene → macro detail.)

Scope is deliberately the **lens group only**. Composition and Lighting keep the existing text-pill
renderer.

## 2. Decisions (from the brainstorm)

- **Fixed demo image, not the live subject.** The tiles teach *what the control does*, so a single
  curated asset (the operator's product shot) cropped five ways is the smallest correct version. No
  dependence on a node having a subject image, no fallback branch.
- **Renderer swap only.** [shot-controls.ts](../../../src/lib/nodes/shot-controls.ts) is untouched:
  same option `value`s, same `prose`, same `value`/`onChange` contract. `compilePrompt` output is
  byte-for-byte identical. This is purely how the `lens` group *draws*.
- **Crop scale = focal-length ratio.** Zoom factor `= focalMm / 24`, so 24→1.0×, 35→1.46×,
  50→2.08×, 85→3.54×, 100→4.17×. Physically honest (how much a lens magnifies vs. the 24mm
  baseline) and free to compute — no per-tile assets, no image pipeline.
- **Auto is pulled out of the tile row** into a chip on the header row (as in the ref). The five
  focal lengths are the tiles; Auto has no meaningful crop.
- **No slider/connecting track** (cut). At the ~400px column width it is cramped and redundant with
  the selected-tile ring + caption. Selection is shown by the ring; the caption names the choice.
- **Compressed to fit the real container.** `ShotControlsRow` renders inside the focus-view center
  column at `max-w-md` (~400px usable), not the ref's ~1400px card. The design is a compact
  single-row strip of five small tiles, not five large ones.

## 3. Layout

```
 ⨂ Lens                                    [ ✦ Auto ]     header: FieldLabel left, Auto chip right
 ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
 │ img│ │ img│ │▓img│ │ img│ │ img│         5 tiles — ONE image, cropped tighter left→right
 └────┘ └────┘ └────┘ └────┘ └────┘         selected tile: primary/50 ring + primary/5 wash
  24mm   35mm   50mm   85mm  100mm          terse per-tile label (selected → text-primary)
         Standard 50mm · Natural perspective   caption: full label + short descriptor of selection
```

- ~5 tiles × ~64–68px + gaps ≤ ~400px → fits one row without wrap.
- When `value === "auto"`: no tile ring; Auto chip is the active one; caption reads
  `Auto · lens chosen by the model`.

## 4. Components

### 4.1 `src/components/nodes/lens-select.tsx` (new)
`LensSelect({ value, onChange }: { value: string; onChange: (v: string) => void })`.

- Sources its options from the `lens` group of `SHOT_CONTROLS` (single source of truth for labels /
  values) — splits `auto` out of the tile list, keeps the rest as tiles in order.
- Owns its header row: reuses `FieldLabel` (Aperture icon + "Lens") on the left, an **Auto chip**
  (shadcn `Button`, active when `value === "auto"`) on the right.
- Each tile is a shadcn `Button` (variant `outline`) sized as a square, `aria-pressed` when active,
  with a **non-interactive** `<img>` child (`object-cover`, `transform: scale(zoom)`,
  `object-position: center`) inside an `overflow-hidden` frame. Label span under the image.
  Note: `zoom = 1.0` (24mm) is the center-square cover crop, **not** the full letterboxed frame —
  the strip shows the *relative* wide→macro progression, so all tiles use `object-cover` uniformly.
- Caption line below the strip: `${label} · ${DESCRIPTOR[value]}`.
- `DESCRIPTOR` (UI-only presentational map, lives in this file): e.g. `wide-24 → "Wide angle"`,
  `wide-35 → "Wide"`, `standard-50 → "Natural perspective"`, `portrait-85 → "Telephoto, shallow
  depth"`, `macro-100 → "Extreme close detail"`, `auto → "lens chosen by the model"`.

### 4.2 Pure helper — `lensZoom(value: string): number`
Co-located in `lens-select.tsx` and exported for test. `focalMm = Number(value.split("-").pop())`;
`zoom = Number.isFinite(focalMm) ? focalMm / 24 : 1`. (`auto`/malformed → `1`.) This is the one bit
of logic worth unit-testing; everything else is markup.

### 4.3 `src/components/nodes/shot-controls-row.tsx` (edit)
In the `SHOT_CONTROLS.map`, special-case the lens group: render `<LensSelect value={controls.lens}
onChange={v => onChange({ ...controls, lens: v })} />` (it draws its own header). All other groups
keep the current `FieldLabel` + `ParamChipGroup`. No prop-shape change to `ShotControlsRow`.

### 4.4 Asset — `public/lens-preview.jpg`
A single landscape photo, subject centered (so center-zoom lands on the detail at macro), ideally
≥1500px wide (4.17× crop over a ~68px tile still samples ~280px of source — sharp). Operator drops
the Aurora product shot here. Until then a committed placeholder image keeps the component rendering
and tests green. The path is a module constant so swapping the asset is a one-line change.

## 5. Tests (written first)

- `lens-select.test.ts` (pure): `lensZoom("wide-24") === 1`, `lensZoom("standard-50") ≈ 2.083`,
  `lensZoom("macro-100") ≈ 4.167`, `lensZoom("auto") === 1`, malformed → `1`.
- Component interaction (matching existing component-test conventions in the suite): renders exactly
  5 tiles + 1 Auto chip; clicking the `portrait-85` tile calls `onChange("portrait-85")`; clicking
  Auto calls `onChange("auto")`; the tile matching `value` has `aria-pressed="true"`.

## 6. Scope cuts / non-goals

- **Lens only.** Composition and Lighting stay text pills. (An analogous visual treatment for them
  is a possible later refinement, explicitly out of scope now.)
- **No slider/track** (cut this round).
- **No live-subject cropping** — fixed demo asset only.
- **No data/prompt/API change** — `shot-controls.ts`, `compilePrompt`, `params_used.controls`, and
  the generate route are all unchanged.

## 7. Verification

- `lensZoom` unit tests + component interaction tests green; `tsc` and `eslint` clean; existing
  suite (78 files / 514 tests) unbroken.
- Manual: open a Prompt focus view → Lens shows five image tiles cropped progressively tighter +
  an Auto chip → selecting a tile updates the ring + caption and persists to `nodes.data.controls`
  → selecting Auto clears the ring → Generate still sends the correct `controls` (unchanged prompt).
- Visual QA at the real ~400px column width: single row, no wrap, no horizontal overflow; tiles
  legible; brand purple used only for the active ring/label (design-system compliance).
