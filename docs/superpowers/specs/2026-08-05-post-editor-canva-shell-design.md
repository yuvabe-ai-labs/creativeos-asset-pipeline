# Post editor — Canva-style shell

**Date:** 2026-08-05
**Status:** Design approved by the user 2026-08-05; revised same day after spec review
(sizes panel, expanded formats, real template library, plain-English inspector).
**Type:** Design spec (UX/layout rework of an already-shipped node type).
**Builds on:** `2026-08-03-post-node-design.md` (original design, D101–D115) and
`2026-08-04-post-editor-ux-v2-design.md` (the Canva-parity feature pass).
**Sequenced as:** Plan 1 of 3. Plan 2 = creative primitives (ellipse/line/arrow/star, draw tool).
Plan 3 = "looks good" essentials (smart guides/snapping, zoom, image crop + filters, text effects).

---

## 1. Why

The Post editor now has the *features* of a poster tool — multi-select, grouping, alignment,
context menus, undo/redo — but not the *shape* of one. Its chrome is a bottom-left `+` popover, a
template picker that hijacks the screen on open, two fixed side panels, a format dropdown showing
raw keys like `ig-square`, four token templates, and an inspector that asks designers to type
`rgba(0,0,0,0.72)` into a text box.

This spec reworks the shell to match the mental model every designer already has from Canva: a left
tool rail whose items open a flyout panel, a canvas that starts clean, an explicit non-destructive
path to templates, a real size picker, a template library worth using, and property controls a
non-technical person can operate.

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

**Shell, content and language gaps — all addressed by *this* plan:**

- No tool rail, no flyout panels; the `+` add-menu is the only way to add anything.
- Templates modal hijacks the screen on open and force-applies.
- No connected-nodes surface.
- Right inspector restructures itself per layer kind.
- **Only four formats**, and Instagram's best-performing feed size (4:5 portrait) is missing.
- **Raw keys leak into the UI.** `POST_FORMATS` already carries friendly labels
  ("Instagram square (1:1)"), but Base UI's `SelectValue` renders the raw *value* unless given a
  render function — so the header trigger displays `ig-square`. The dropdown items show the friendly
  label; the trigger does not. A real display bug, not merely a naming preference.
- **Only four templates**, chosen to prove the mechanism rather than to be reached for.
- **Technical property controls.** Gradient fill is two free-text boxes expecting CSS colour strings
  (`rgba(0,0,0,0)`), and gradient *angle* has no control at all — it is hardcoded to `0` at creation
  and can never be changed. Corner radius and border width are bare number inputs.

## 3. Layout

```
┌────────────────────────────────────────────────────────────────┐
│ ← Back to canvas       Untitled post          ↶ ↷   [Download] │
├────┬─────────────┬──────────────────────────────┬──────────────┤
│ ▣  │             │                              │  TEXT        │
│Tmpl│   flyout    │                              │  ─────────   │
│ ▣  │   panel     │                              │  Font  ▾     │
│Size│   (w-64)    │          canvas              │  Size  ―●―   │
│ ▣  │             │                              │  Colour ▓▓▓  │
│Elem│  scrollable │                              │  Align ≡     │
│ ▣  │             │                              │              │
│Text│             │                              │  (fixed w-56)│
│ ▣  │             │                              │              │
│Conn│             │                              │              │
│ ▣  │             │                              │              │
│Layr│             │                              │              │
└────┴─────────────┴──────────────────────────────┴──────────────┘
```

- **Rail** — 56px, icon buttons with micro-labels: **Templates, Size, Elements, Text, Connected,
  Layers**. The Draw item joins in Plan 2; it is not rendered as a disabled stub now.
- **Flyout panel** — 256px (`w-64`), opens beside the rail. Clicking a rail item opens its panel;
  clicking the *same* item closes it. The panel does **not** auto-close when the user returns to the
  canvas, so repeated placement needs no re-opening.
- **Header** — loses the format dropdown entirely (it moves to the Size panel), keeping back, title,
  undo/redo, Publish (disabled) and Download.
- **Right inspector** — stays at `w-56`, always rendered, with a normalised shell (§7).

The bottom-left `+` add-menu (`post-add-menu.tsx`) is **removed**; the rail replaces it.

## 4. Opening state — a clean canvas

Today `post-focus-view.tsx` lazily initialises `pickerOpen` to `true` whenever the scene has no
layers, so a fresh Post node opens behind a full-bleed template picker.

**New behaviour:** that modal and its `pickerOpen` state are deleted. A Post node opens showing a
white canvas containing only the auto-placed connected image (the existing auto-place effect is
unchanged). The Templates panel is open in the rail by default, so the next step stays discoverable,
but **no template is ever applied without an explicit click**.

## 5. Sizes

### 5.1 The format set

Ten formats, grouped by platform, each with a plain-English name. No key is ever shown to the user.

| Key (internal only) | Label shown | Pixels | Ratio |
|---|---|---|---|
| `ig-portrait` | Instagram post — portrait | 1080×1350 | 4:5 |
| `ig-square` | Instagram post — square | 1080×1080 | 1:1 |
| `ig-story` | Instagram story & reel | 1080×1920 | 9:16 |
| `facebook-post` | Facebook post | 1200×1500 | 4:5 |
| `linkedin-post` | LinkedIn post | 1200×627 | 1.91:1 |
| `linkedin-square` | LinkedIn post — square | 1080×1080 | 1:1 |
| `x-post` | X post | 1600×900 | 16:9 |
| `youtube-thumb` | YouTube thumbnail | 1280×720 | 16:9 |
| `pinterest-pin` | Pinterest pin | 1000×1500 | 2:3 |
| `a4-print` | A4 print (300 DPI) | 2480×3508 | ~1:1.41 |

`ig-portrait` is the notable addition: 4:5 is Instagram's best-performing feed size and was missing.
`linkedin` is renamed `linkedin-post` for symmetry; since `PostFormat` values are persisted in node
data, the rename needs a read-time fallback mapping old `"linkedin"` to `"linkedin-post"`.

### 5.2 The Size panel

Replaces the header dropdown. Formats are grouped under platform headings, each row showing a small
proportional ratio swatch, the friendly name, and the pixel dimensions as secondary text. The current
format is checked. Selecting a different one re-fits all layers automatically — normalised geometry
already handles this — and keeps the existing >0.3 aspect-delta warning toast.

### 5.3 Friendly language, enforced

No raw format key, layer `kind`, or other internal token is ever rendered. Concretely: the header
dropdown's `SelectValue` bug disappears with the dropdown itself, and the Size panel renders
`spec.label` directly rather than relying on a primitive's default value rendering.

## 6. Templates

### 6.1 Aspect-band awareness

Templates currently take `format` and ignore it, rendering one normalised layout at every size. With
ten formats spanning 9:16 to 16:9, that breaks down badly — and worse, `TextLayer.fontSize` is a
fraction of canvas **height**, so a 0.045 headline is 49px on a 1080-tall square and 86px on a
1920-tall story while the canvas stays 1080 wide. Text designed for one ratio is unusable at another.

Two changes:

1. **Font size is measured against the shorter edge.** `fontSizeToPx` switches from `containerH` to
   `min(containerW, containerH)`. For every square format this is identical to today's behaviour
   (`min == height`), so the change is a no-op for existing square posts — which is the default and
   the overwhelming majority of saved data. Non-square posts re-render at a corrected size, which is
   the point.
2. **Templates branch on an aspect band.** A new pure helper classifies any format as
   `portrait | square | landscape`; each template picks per-band values for a handful of numbers
   (margins, headline size, scrim height, CTA width). Not a separate layout per band — the same
   composition, tuned.

### 6.2 The library — 14 templates

The four existing templates stay (retuned per §6.1). Ten are added, chosen for what marketing teams
actually post rather than to demonstrate the mechanism:

| Template | What it's for |
|---|---|
| *Lower third* (existing) | Full-bleed photo, copy over a bottom scrim. The safe default. |
| *Inset card* (existing) | Copy in a floating card over the photo. |
| *Side column* (existing) | Photo one side, copy column the other. |
| *Split half* (existing) | Hard 50/50 photo/colour split. |
| **Bold quote** | Large centred pull-quote over a dimmed photo, with attribution. |
| **Product hero** | Product centred, name + price + CTA. E-commerce staple. |
| **Before / after** | Two labelled panels. Services: skincare, fitness, renovation. |
| **Carousel cover** | Big title + "swipe" affordance; carousels are the top-engagement format. |
| **Testimonial** | Quote, star row, name and role. |
| **Announcement** | "NEW" badge, headline, date, CTA. |
| **Numbered tips** | "5 ways to…" list layout — the most-saved content type. |
| **Sale offer** | Large discount badge, product, urgency line, promo code. |
| **Event** | Date block, title, time and place, CTA. |
| **Minimal frame** | Inset photo in a generous white frame with a small caption. Editorial. |

Every template seeds real placeholder copy (not "Headline"/"Body copy goes here" where something
more specific is honest), uses only existing primitives, and returns its CTA as a shape+text group
per the existing convention.

## 7. Right inspector — normalised *and* de-jargonised

A Canva-style contextual toolbar was considered and rejected; the panel stays where it is, at fixed
`w-56`, always rendered. Two changes:

**Structure.** Every layer kind renders the same shell — a `text-eyebrow` kind label, then
uniformly-spaced labelled sections — so switching selection changes contents without restructuring
rhythm. This addresses *"when text is selected the edit layout is completely different."*

**Language and controls.** Every control a non-technical person would stall on is replaced:

| Today | Becomes |
|---|---|
| Gradient = two free-text boxes taking `rgba(0,0,0,0.72)`; angle uncontrollable | A row of ready-made gradient swatches to click (dark-fade, warm, cool, brand…), plus a simple **Direction** control (↓ ↑ → ←) writing the angle. No colour strings typed. |
| Solid colour = a bare OS colour input | A swatch grid — brand purple, neutrals, black/white, plus recent colours — with the OS picker behind a "Custom…" swatch for the rare case. |
| "Corner radius", number box 0–999 | **Corners**, a `Slider` from Sharp → Rounded, with a Pill option at the top end. |
| "Width", number box (border) | **Border thickness**, a `Slider`. |
| "Size" free-number for text | A `Slider` plus a small numeric readout, so dragging is the primary gesture. |
| Labels like "Fit", "Opacity" | Plain phrasing: "How the image fills its box", "Transparency". |

`slider.tsx` already exists in `src/components/ui/`, so no new primitive is needed. Per CLAUDE.md,
every control remains a shadcn primitive.

## 8. Connected-nodes panel

A new panel listing every directly-connected image-bearing node (Image Gen / File / Draw) as
thumbnails with the source node's title beneath. `post-focus-view.tsx` already receives exactly this
data as `connectedImageNodes: { nodeId, url }[]`, so the panel is a new view over existing data with
no new plumbing into the canvas store.

- **Click** — adds the image centred, at a default size.
- **Drag and drop** — HTML5 drag from the thumbnail onto the Konva stage container; the drop point,
  converted to normalised 0–1 space via the existing `pxToNormalized` helper, becomes the layer's
  centre.

Out of scope: past uploads, and images from unconnected nodes elsewhere on the canvas.

## 9. The Post node card

The card on the canvas — `post-node.tsx` — was audited alongside the editor. Its problems are
*misrepresentation* rather than friction, which makes them more damaging than the inspector's jargon.

### 9.1 The preview can show a design you never made

The thumbnail is hardcoded `aspect-square … object-cover`. A story (9:16) or LinkedIn (1.91:1) post is
centre-cropped into a square, so the card shows a composition that is not the one you designed. With
ten formats (D122) this stops being imprecise and becomes wrong.

**Fix:** the preview box takes its aspect ratio from the node's own format, and uses `object-contain`
on a neutral field so the whole composition is visible rather than cropped.

### 9.2 The preview goes stale silently — and the fix was already half-built

The thumbnail renders `d.fileUrl`, the *last exported PNG*. Edit the design and the card keeps showing
the old export forever, with nothing to indicate it is out of date.

`PostNodeData.renderedAt` exists for exactly this. Its declaration in `canvas-nodes.ts` reads
*"drives the 'unrendered changes' badge (Task 24 staleness check)"*, and `post-node.service.ts` writes
it on every export — but **nothing reads it.** Task 24 never existed; the original plan ended at 22.

**Fix:** add a companion `layersUpdatedAt` stamp, written whenever layers change, and compare the two.

### 9.3 The status chip means the wrong thing

`hasRender = !!d.fileUrl` drives a "Rendered" / "Pending" chip — but that is *"has this ever been
exported?"*, not *"is this ready?"*. A finished design you haven't downloaded reads **Pending**, which
implies something is still processing. An edited-since-export design reads **Rendered**, which is
false.

**Fix:** a three-state vocabulary that says what is actually true.

| State | Condition | Chip |
|---|---|---|
| Never exported | no `fileUrl` | **Draft** |
| Exported, unchanged since | `renderedAt >= layersUpdatedAt` | **Exported** |
| Exported, edited since | `layersUpdatedAt > renderedAt` | **Edited since export** |

### 9.4 Smaller card fixes

- **"Empty — connect an image" is wrong advice.** It fires on `!hasLayers`, but a Post node needs no
  connected image — text, shapes and icons all work standalone. Replaced with "Empty — open to start".
- **Format and contents are invisible.** The card gains a quiet metadata line: the format's friendly
  short name and a layer count ("Instagram portrait · 6 layers").
- **Raw `<button>`** at `post-node.tsx:111` violates CLAUDE.md's shadcn-only rule; becomes `Button`.
  (Noted, not fixed here: `image-gen-node.tsx:157` has the same pre-existing violation.)

## 10. Editor defects fixed in this plan

Found in the same audit. These are bugs, not missing features, so they are fixed here rather than
deferred to Plans 2–3.

- **Escape while editing text closes the whole editor.** The inline text overlay handles Escape to
  cancel an edit but never calls `stopPropagation`, and the editor is a `Sheet` (a Base UI `Dialog`),
  which closes on Escape. The instinctive cancel gesture ejects you from the editor and loses the
  panel state. **Fix:** stop propagation for Escape (and Cmd/Ctrl+Enter) while a text edit is active.
- **Every new element lands in the same spot.** `createTextLayer`/`createShapeLayer`/`createIconLayer`
  all spread one fixed `DEFAULT_GEOMETRY`, so three added texts stack perfectly and only the top one
  is reachable. **Fix:** cascade each newly added layer by a small offset, wrapping when it would
  leave the canvas — the same idea as the existing `duplicateLayer` nudge.
- **Undo silently doesn't cover everything.** Layer edits live in `usePostEditor`'s history; format and
  template choice go through `onPatch` and do not. After changing format, ⌘Z doesn't revert it — it
  reaches past and undoes an unrelated earlier *layer* edit, which is worse than doing nothing.
  **Fix:** the history's state becomes `{ layers, format, templateId }` so every design-affecting
  change is undoable as one coherent stack. Title stays outside history — it is metadata, like a
  filename, and behaves as an inline field everywhere else in this app.
- **The format-change warning is a transient toast** fired *after* the change applies. With undo now
  covering format (above), the toast is downgraded to a plain informational note; the escape hatch is
  ⌘Z rather than a warning nobody can act on.
- **The auto-place effect re-runs on every board-wide node move.** `connectedImageNodes` is memoised
  on `[nodes, edges, id]`, so dragging any unrelated node hands it a fresh array identity and re-fires
  the effect. It is guarded against duplicating, so this is waste rather than breakage. **Fix:** key
  the memo on the connected ids and urls rather than the whole `nodes`/`edges` arrays.

**Not defects — verified during the audit:** export resolution is correct
(`pixelRatio = spec.width / stage.width()` scales the 640px on-screen stage back to full format
pixels, with an A4 downscale fallback for the 10 MB upload cap), and the keyboard-shortcut guard
`isEditableTarget` does correctly cover `TEXTAREA`, so shortcuts don't fire while typing.

**Kept deliberately:** the Brand rail item and the disabled Publish button both stay, with explicit
"Coming soon" treatment, so the roadmap remains legible in-product.

## 11. File structure

`post-focus-view.tsx` is already ~450 lines and would roughly double. It splits into a shell plus one
file per panel, following this codebase's one-component-per-file rule:

| File | Responsibility |
|---|---|
| `post-tool-rail.tsx` (new) | The icon rail; renders items, reports the active one. |
| `post-tool-panel.tsx` (new) | Flyout shell; switches on the active tool. |
| `post-panel-templates.tsx` (new) | Template grid + override `AlertDialog`. |
| `post-panel-sizes.tsx` (new) | Platform-grouped format list with ratio swatches. |
| `post-panel-elements.tsx` (new) | Shapes + icon presets (absorbs most of `post-add-menu.tsx`). |
| `post-panel-text.tsx` (new) | Text presets — heading / subheading / body. |
| `post-panel-connected.tsx` (new) | Connected-node thumbnails; click + drag-drop. |
| `post-panel-layers.tsx` (new) | Thin wrapper around the existing `PostLayerList`. |
| `post-colour-swatches.tsx` (new) | Shared swatch-grid control used by every colour field. |
| `post-gradient-presets.tsx` (new) | Shared gradient-swatch + direction control. |
| `src/lib/post/aspect-band.ts` (new) | Pure `aspectBand(format)` classifier. **Tested.** |
| `src/lib/post/gradients.ts` (new) | Named gradient presets + direction→angle map. **Tested.** |
| `src/lib/post/templates/*.ts` | Four retuned, ten new. **Tested.** |
| `src/lib/post/formats.ts` (modified) | Ten formats + legacy-key fallback. **Tested.** |
| `src/lib/post/units.ts` (modified) | `fontSizeToPx` measures the shorter edge. **Tested.** |
| `src/lib/post/layers.ts` (modified) | Cascade offset for newly created layers (§10). **Tested.** |
| `src/lib/post/history.ts` + `use-post-editor.ts` (modified) | History state widens to `{ layers, format, templateId }` (§10). **Tested.** |
| `post-node.tsx` (modified) | Aspect-correct preview, three-state chip, metadata line, `Button` (§9). |
| `src/lib/post/render-state.ts` (new) | Pure `renderState(renderedAt, layersUpdatedAt, fileUrl)` → `draft \| exported \| stale`. **Tested.** |
| `src/lib/canvas-nodes.ts` (modified) | Adds `layersUpdatedAt` to `PostNodeData`. |
| `post-focus-view.tsx` (modified) | Shrinks to shell/orchestrator. |
| `post-stage.tsx` (modified) | Escape/⌘Enter stop propagation during a text edit (§10). |
| `post-add-menu.tsx` (deleted) | Content moves into the Elements and Text panels. |
| `post-template-picker.tsx` (deleted) | Replaced by `post-panel-templates.tsx`. |

## 12. Data model and compatibility

No new layer kinds and no database migration — per **D10**'s narrow-waist JSONB pattern, nothing here
touches Postgres. Two compatibility notes, both deliberate:

- **`fontSizeToPx` basis change** re-renders text on *non-square* saved posts. Square formats are
  unaffected (`min == height`), and square is both the default and the bulk of existing data, so
  blast radius is small and the corrected behaviour is the goal.
- **`"linkedin"` → `"linkedin-post"`** needs a read-time fallback so already-saved nodes keep
  resolving. No write-time migration; unknown keys fall back to `ig-square` as today.
- **`layersUpdatedAt` is new and absent on every existing node.** Treat a missing value as "unknown,
  assume current": a post with a `fileUrl` but no `layersUpdatedAt` reads **Exported**, not
  "Edited since export". Guessing stale for legacy data would flag every previously-exported post as
  dirty on first load, which is exactly the false alarm this badge exists to avoid.

The active rail tool is ephemeral local state, deliberately not persisted.

## 13. Testing

Vitest runs in `environment: "node"` with no jsdom, so no `.tsx` file in this repo is unit-tested:

- Every new component is verified by `npx tsc --noEmit` only.
- Every new pure helper **is** tested: `aspectBand`, the gradient preset/direction map, the format
  table (including the legacy-key fallback), and `fontSizeToPx`'s new basis.
- Each new template extends the existing `templates.test.ts` in-bounds sweep, and the existing
  "exactly one CTA group with two children" assertion.
- The existing 177-test suite stays green except `units.test.ts`, whose `fontSizeToPx` expectations
  change deliberately with §6.1 — the one file where an edited test is *expected* rather than a
  warning sign.

## 14. Explicitly out of scope

- Everything in Plans 2 and 3 (new primitives, draw tool, snapping, zoom, crop/filters, text effects).
- Brand Kit (still a stub), AI captions, compliance checks, approval flow, publishing.
- Custom user-entered canvas dimensions; per-format template *variants* (§6.1 tunes one composition).
- Persisting panel state, resizable panels, collapsible rail.
- OS-clipboard integration, and any change to export or node-graph wiring.

## 15. Decisions

Recorded in the single ADR log — `2026-05-30-creativeos-staging-roadmap.md` §7 — as **D116–D128**,
with full Decision / Why / Rejected / Originated entries. In brief:

| | |
|---|---|
| **D116** | Left chrome is one icon rail + one shared flyout panel; the `+` add-menu is deleted. |
| **D117** | A Post node opens on a clean canvas; templates never auto-apply. |
| **D118** | Applying a template always confirms, and always preserves connected-node images. |
| **D119** | Layer properties stay in the fixed right inspector, normalised per kind. |
| **D120** | The layer list is a rail item in the shared flyout. |
| **D121** | The connected-nodes panel is a view over the existing `connectedImageNodes` prop. |
| **D122** | Format selection moves to a Size rail panel; ten platform-grouped formats, friendly labels only, no key ever surfaced. |
| **D123** | Font size is measured against the canvas's shorter edge, not its height. |
| **D124** | Templates tune one composition across three aspect bands, and the library grows to 14. |
| **D125** | Inspector controls are visual (swatches, sliders, direction pickers); no CSS colour strings or raw numeric fields. |
| **D126** | The node card previews at the post's real aspect ratio and reports Draft / Exported / Edited since export, backed by a new `layersUpdatedAt` compared against the already-written `renderedAt`. |
| **D127** | The editor's undo history covers `{ layers, format, templateId }`, not layers alone. |
| **D128** | Newly added layers cascade instead of stacking on one fixed default position. |
