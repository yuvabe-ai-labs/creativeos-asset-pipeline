# Post node — manual composition of social & marketing posts over generated plates

**Date:** 2026-08-03
**Status:** Draft design — pending user review.
**Type:** Design spec (new feature; new node type). Introduces decisions **D95–D100** — numbers
provisional, see §12.
**Visual companion:** **[`2026-08-03-post-node-layouts.html`](2026-08-03-post-node-layouts.html)** —
open in a browser. Approved shell, rejected alternatives, template compositions, layer anatomy.
**Paired spec:** `2026-08-03-post-publishing-design.md` (publishing to Instagram / LinkedIn /
Facebook — built second, both needed for the pilot).
**Builds on:** **D19** (node = own content + output), **D10** (type-specific data via JSONB),
**D8** (edges point to nodes), **D30/D46** (media in GCS, rows hold URLs), **D39** (explicit
"Set as base" for connected images), **D37 §8** (the same-origin image proxy), **D40** (focus view
as rail + panel + detail), the **Draw node** lifecycle (`draw-focus-view.tsx` → `toBlob` →
`fileNodeService.upload` → `onPatch`), and the **KB review surface** (`/clients/[id]/kb`,
`PATCH /api/clients/[id]/kb/field`).

---

## 1. Problem & goal

Image Gen produces a *plate* — a photographic background. What actually ships to a client is a
**post**: that plate with a headline, body copy, a CTA, a logo, and usually a colour band or price
tag over it. Today that step happens outside CreativeOS, in Canva or Photoshop, which breaks the
chain: the brand palette is retyped by hand, the finished asset never returns to the canvas, and
nothing downstream (approval, archive, publishing) can see it.

**Goal.** A **Post node** that takes generated imagery as input and composes text, shapes, images,
and scrims over it into a finished, exportable post — Instagram, LinkedIn, Facebook, or print —
with the client's brand identity sourced from the KB rather than retyped.

The plate is generated with deliberate **negative space** so the copy has somewhere to live. Making
that reliable rather than lucky is an explicit goal, addressed in §6.

## 2. Scope

**In scope (v1):**

- A new `post` node type with a focus-view editor.
- Four layer kinds: `text`, `shape`, `image`, `scrim`.
- Four hand-built template compositions, seeded on first open.
- A Brand Kit panel sourced from the client KB, with deep-links back to the KB to fix gaps.
- New structured `brand_kit` fields on the KB schema.
- Client-side export to PNG at arbitrary scale, uploaded to GCS as the node's output.
- The template's copy zone appended to the connected Image Gen prompt as a one-way hint.

**Out of scope (v1):**

- **Publishing** — its own spec. The Publish button ships present and disabled (§11).
- **AI-drafted layouts.** The editor is manual. Auto-layout is a later, additive feature; nothing
  here forecloses it.
- **Multi-format fan-out from one composition.** One Post node = one format. Four deliverables =
  four Post nodes fed by the same Image Gen node. Normalized geometry (§4) leaves the door open.
- **QR codes**, freeform paths, blend modes, text-on-curve, masks, effects, client font *files*.
- **Version envelope, credits, generation rows.** A composition is authored content, not a model
  attempt — see §3.

**Three build slices**, each independently testable, in order:

- **Slice 1 — the node and the stage.** Node type, `PostNodeData`, connections, the focus-view shell,
  the four layer kinds rendering, direct manipulation, the layer list and inspector. Exercisable by
  building a post entirely by hand with hardcoded colours. Ends with a composition you can see but
  not export.
- **Slice 2 — export.** `post-layer-render` shared by editor and exporter, the image proxy path,
  render → upload → patch, Download, `getNodeOutput`. Ends with a PNG in GCS that downstream nodes
  can see. **This is the slice that de-risks the whole feature** — if rasterization fidelity fails,
  it fails here, before templates and Brand Kit are built on top of it.
- **Slice 3 — templates and Brand Kit.** The four templates, the first-run picker, the copy-zone
  hint, the KB `brand_kit` schema addition, and the Brand Kit panel with its "Fix in KB" links.

## 3. Why a new node type

Three alternatives were considered: transform the Image Gen node into a Post node; add a "Post mode"
tab to the Image Gen node; add a separate Post node. **The separate node wins**, and the reasoning
matters enough to record:

**It is a different lifecycle.** Image Gen is a *generation* node — pick a model, set params, spend
credits, wait on an async job, append an attempt to the version envelope (D4/D19/D26). Compositing
is **deterministic**: no model, no credits, no job, no attempt. Behind a tab, half of
`ImageGenNodeData` (`modelId`, `params`) is meaningless while the tab is open, and the eval system
that reads `generations` starts seeing rows that are not generations.

**D27 is the counter-precedent and it does not apply.** "Image editing is a new *attempt* on the
Image Gen node, not a new node" holds precisely *because* an edit is the same model producing the
same artifact. A post is neither.

**Fan-out.** One plate realistically becomes four deliverables (IG square, IG story, LinkedIn, A4
print). A mode gives you one image = one post. A node lets one Image Gen feed N Post nodes — the
Shot fan-out pattern the app already has (D21).

**Only a node can eat text.** The Script node already produces `on_screen_text`, `caption`, and
`cta` (`renderScriptAsText`). A Post node can accept copy inputs later; a mode cannot, because on
Image Gen every incoming edge already means "reference image".

**File size.** `image-gen-focus-view.tsx` is ~54 KB and already carries a Generate/Edit tab pair
(D37). A third mode lands in the most overloaded file in the repo, against the ~200-line split rule
in `docs/component-structure.md`.

**Accepted costs:** more canvas clutter on a fan-out; one more focus view to maintain; a round-trip
when the plate changes — mitigated by live edge binding (§4).

## 4. Data model

Everything lives in `data`, like Draw. No `node_versions` rows, no `generations` rows.

```ts
// src/lib/canvas-nodes.ts
export type PostNodeData = {
  title?: string;
  format?: PostFormat;        // canvas aspect + baseline pixel size
  templateId?: string;        // which template seeded this composition
  background?: PostBackground;
  layers?: PostLayer[];       // ordered back → front
  // the flattened PNG — this node's output; same field names as Draw/File
  fileUrl?: string;
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
  fileSizeBytes?: number;
  renderedAt?: string;        // ISO; drives the "unrendered changes" badge
};
```

```ts
// src/lib/post/types.ts
export type PostFormat =
  | "ig-square"   // 1080 × 1080
  | "ig-story"    // 1080 × 1920
  | "linkedin"    // 1200 × 627
  | "a4-print";   // 2480 × 3508 @ 300 DPI

export type LayerBase = {
  id: string;
  name?: string;              // shown in the layer list; defaults from kind + content
  x: number; y: number;       // 0–1, fraction of canvas width / height
  w: number; h: number;       // 0–1
  rotation?: number;          // degrees
  opacity?: number;           // 0–1, default 1
  locked?: boolean;
  hidden?: boolean;
};

export type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontFamily: string;         // a key from the curated list (§8)
  fontSize: number;           // 0–1, fraction of canvas HEIGHT
  fontWeight: number;
  color: string;              // hex
  align: "left" | "center" | "right";
  lineHeight: number;         // multiplier
  letterSpacing?: number;     // em
};

export type ShapeLayer  = LayerBase & { kind: "shape"; fill: string; radius: number };  // radius 0–1 of min(w,h)
export type ImageLayer  = LayerBase & { kind: "image"; src: ImageSource; fit: "cover" | "contain"; radius?: number };
export type ScrimLayer  = LayerBase & { kind: "scrim"; from: string; to: string; angle: number };

export type PostLayer = TextLayer | ShapeLayer | ImageLayer | ScrimLayer;

export type ImageSource =
  | { kind: "node"; nodeId: string }   // live — resolved from a connected node at render time
  | { kind: "url"; url: string };      // static — Brand Kit asset or upload

export type PostBackground =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: ImageSource; fit: "cover" | "contain" };
```

**Two non-obvious choices, and why:**

**Geometry is normalized, not pixels.** Every `x/y/w/h` is a 0–1 fraction of the canvas; `fontSize`
is a fraction of canvas *height*. The inspector still shows "20" — a pure conversion against a
1080px baseline, in `src/lib/post/units.ts`, unit-tested both directions. This is what makes print
export work: A4 at 300 DPI is 2480×3508 and the same composition renders at any pixel size with no
rescaling pass. Pixels would lock every post to one output size.

**The plate is edge-bound, not copied.** An image layer's `src` may be `{ kind: "node", nodeId }`,
resolved from the connected node's current output at render time. Regenerating the plate upstream
updates the post instead of stranding a stale copy. When several images are connected, the Brand Kit
/ inspector picker chooses which feeds which layer — the same shape as D39's "Set as base".

**Connections** (`VALID_CONNECTIONS` in `src/lib/canvas-nodes.ts`):

```
"image-gen": [... , "post"],
"file":      [... , "post"],
"draw":      [... , "post"],
"post":      [],
```

`post → video-gen` (animate a finished post) is a deliberate later one-line change, not a v1
feature. Registered in `ADD_NODE_OPTIONS` as `{ type: "post", label: "Post", mnemonic: "O" }` —
`P` is taken by Prompt.

## 5. The editor

Approved shell — the full-fidelity version is in the visual companion; this is the structural
summary. It keeps the house focus-view frame: a bottom `Sheet` at `h-[92vh]`, "Back to canvas", an
`EditableField` title, actions top-right.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Back to canvas                                                             │
│ Diwali Offer — IG Story            [Format 9:16] [Preview] [Publish] [Download]│
├────┬──────────────┬──────────────────────────────────┬───────────────────────┤
│ ☰  │ Layers │Brand│                                  │  TEXT · PROPERTIES    │
│ ◈  │              │        ┌──────────────┐          │  ┌─────────────────┐  │
│ ＋ │ ▸ CTA pill   │        │  ▪ wordmark  │          │  │ family          │  │
│    │ ▪ Headline ◀ │        │ ┌──────────┐ │          │  └─────────────────┘  │
│    │ ▸ Body copy  │        │ │  plate   │ │          │  ┌──────┐ ┌────────┐  │
│    │ ▸ Plate      │        │ └──────────┘ │          │  │ size │ │ weight │  │
│    │ ▸ Scrim      │        │  ▬▬▬▬ ◀ sel  │          │  └──────┘ └────────┘  │
│    │ ▸ Bg      🔒 │        │  ▬▬▬▬▬▬      │          │  ┌─────────────────┐  │
│    │              │        │  ( CTA )     │          │  │ colour          │  │
│    │ BRAND COLOURS│        └──────────────┘          │  └─────────────────┘  │
│    │ ● ● ● ●      │                                  │  align · spacing      │
└────┴──────────────┴──────────────────────────────────┴───────────────────────┘
  rail    panel                    stage                       inspector
```

| Band | Holds | Why it earns the space |
|---|---|---|
| Icon rail (~44px) | Layers · Brand Kit · Add | Two panel destinations plus **Add**, which is a popover menu (Text / Shape / Image / Scrim), *not* a third panel — adding a layer is one click, and a panel for four buttons would be waste. |
| Left panel | Layer list, or the Brand Kit | The layer list is what makes overlapping text and shapes editable at all: reorder, lock the plate, reach a layer buried behind another. |
| Stage | Post canvas + selection handles | Scale-to-fit. The only element with a shadow, so it reads as the subject. |
| Inspector | Properties for the selected layer | Contextual; empty state prompts "select a layer". |

**Templates are not a band.** Picking one is a once-per-post act. It appears as a **first-run
overlay** when `layers` is empty, and afterwards as "Change template" in the header menu. This was
the correction that produced the approved shell — a permanent template browser is idle for the whole
session after the first click.

**Rejected shells,** recorded so they are not silently re-litigated: templates in the left panel
(dead weight after first click); a horizontal properties toolbar (elegant for text, awkward for
shapes and images, no room for gradient stops); a single right panel with a floating insert bar
(biggest canvas, but one panel doing Properties + Layers + Brand Kit fights itself the moment you
drag a logo in while a layer is selected).

**Direct manipulation on the stage:** click to select, drag to move, corner handle to resize,
top handle to rotate, double-click a text layer to edit in place. Arrow keys nudge; shift-arrow
nudges by 10×. Snapping to canvas centre lines and to the template's copy-zone edges.

## 6. Templates and the copy-zone contract

Templates are indexed by **composition**, not marketing purpose — because composition is what
decides whether a template fits the plate you have. Purpose rides along as a tag. Four ship in v1:

| Template | Composition | Copy zone | Purpose tags |
|---|---|---|---|
| **Lower third** | Full-bleed image, copy in bottom 35% over a scrim | bottom 36% | offer, promotion |
| **Inset card** | Image inset on a brand-coloured field, copy on the solid | below the plate | launch, announcement |
| **Side column** | Vertical split — image one side, copy column the other | left 46% | offer, brochure |
| **Split half** | Hard 50/50 image and brand colour block | bottom 50% | discount, sale |

*Deferred:* **Upper band** (the mirror of Lower third) and **Centred hero** (one line of copy over a
darkened plate). Both are cheap to add once real posts show whether anyone reaches for them.

A template is a pure data module in `src/lib/post/templates/` — an id, a name, purpose tags, a copy
zone rect, and a function producing a seed `PostLayer[]` for a given format. No React, so it is
unit-testable and the registry can be checked for completeness by a test.

**The copy zone is a contract.** Each template declares its zone as a normalized rect, and a pure
function `copyZoneHint(zone) → string` renders it into a sentence: *"Leave the lower 35% of the frame
clear and uncluttered — no key subject matter, no busy detail; this area will carry text."*

**How it reaches the image prompt — explicitly:** the Post editor displays that sentence as an
**"Image brief"** line under the template name, with a copy button. **Nothing is written to another
node.** The human pastes it into the Image Gen prompt, or reads it and prompts in their own words.

That restraint is deliberate. Edges run `image-gen → post`, so any automatic injection would be an
*upstream* write from a downstream node — a new and surprising direction of data flow, for a
one-sentence payload. Display-and-copy delivers the whole benefit at zero plumbing, and leaves a
future "send to prompt" action possible without having designed around it now. There is no live
regeneration loop; the human still presses generate (D11).

## 7. Brand Kit — sourced from the KB

The Brand Kit panel is a **read-only projection** of the client's KB and client record. Nothing about
brand identity is stored on the Post node or in a parallel asset store. Where the KB is empty, the
panel shows an empty state with a **"Fix in KB →"** deep-link to `/clients/[id]/kb`.

The KB today is a prose document built for *prompting* — every leaf is a `KBField<string | string[]>`
with confidence and review status. A Brand Kit needs *loadable assets and structured values*. Same
word, two jobs. So the KB grows a section:

```ts
// src/lib/kb/schema.ts — new section on TraceableBrandKBSchema
export const TraceableBrandKitSchema = z.object({
  colour_tokens: kbField(z.array(z.string())).describe(
    "Brand colours as bare hex codes only, e.g. '#C8A000' — the machine-usable form of colour_palette_primary",
  ),
  font_primary: kbField(z.string()).describe(
    "Display/heading font family name, e.g. 'Playfair Display'",
  ),
  font_secondary: kbField(z.string()).describe(
    "Body font family name",
  ),
  logo_variants: kbField(z.array(z.string())).describe(
    "Logo asset URLs, labelled by variant: 'primary <url>', 'mono-dark <url>', 'stacked <url>'",
  ),
});
```

Ordinary `kbField(...)` entries, so they inherit the existing review UI, versioning, and
confidence/status for free, and render in `kb-field-row.tsx` with no new component.

**Migration reality, stated plainly:** existing KBs come back with these fields empty until
re-extracted or filled by hand. That is acceptable — the Brand Kit degrades to empty states with
working "Fix in KB" links, and `clients.logo_url` (which already exists, with an upload path at
`/api/clients/[id]/logo`) is used as the fallback single logo.

**Colours have a working fallback today.** `colour_palette_primary` already stores strings like
`"turmeric gold #C8A000"`, and `kb-color-swatches.tsx` already parses the hex out. That `HEX` regex
moves to `src/lib/kb/utils.ts` and is imported by both call sites — one definition, per the
reusability rule. So the palette works before anyone re-extracts anything.

**Products / Backgrounds / Icons are not brand knowledge** and get no store. Imagery reaches a post
the way it already reaches a canvas: a File node, the Drive gallery, or a moodboard.

## 8. Fonts

A font picker needs a *loadable* webfont; the KB can only ever hold a family name. So:

- A **curated app-level list** of ~12 webfonts in `src/lib/post/fonts.ts` — a spread of display
  serifs, geometric sans, and neutral text faces — self-hosted in `src/fonts/` and loaded with
  `next/font/local`, matching how Clash Display and Gilroy are already vendored.
- `font_primary` / `font_secondary` in the KB **pin which of those a client defaults to**, and the
  picker surfaces them first. `typography_style` prose can order the rest as a nicety.
- **Client font files are out of the pilot.** Licensing plus font loading inside an export renderer
  is its own problem, and getting it wrong ships a client's licensed typeface as a base64 blob in a
  PNG pipeline.

Self-hosting is not incidental: the exporter inlines fonts as data URLs (§9), which requires the
bytes to be same-origin fetchable.

## 9. Rendering and export

**The editor renders real DOM, and export rasterizes that same tree.** One renderer, so preview and
output cannot drift. Layers are absolutely-positioned elements inside a container sized to the
format; normalized geometry × container size = CSS pixels.

**Library: `html-to-image`.** It clones the node, inlines computed styles, embeds webfonts and
images as data URLs, wraps the result in an SVG `<foreignObject>`, and draws it to an off-screen
canvas. It exposes `pixelRatio`, explicit `width`/`height`, `backgroundColor`, `filter` (to exclude
selection handles from the output), and `fontEmbedCSS` (compute the font CSS once, reuse per
export).

**Server-side rendering was evaluated and rejected.** Satori + resvg is deterministic and runs at
the edge, but it would be a *second* renderer, and its own documentation says it *"does not guarantee
that the SVG will 100% match the browser-rendered HTML output"*; `display` is only
`flex`/`contents`/`none`; `calc()` is unsupported; and **WOFF2 is not supported**, which is the
format nearly every webfont ships as. A preview that drifts from the export is the worst possible
failure for this feature.

**Canvas tainting is already solved in this repo.** GCS public objects send no CORS headers, so a
`crossOrigin` image load fails and canvas readback throws. `src/app/api/image-proxy/route.ts` exists
for exactly this (built for the D37 annotation canvas) — locked to `https://storage.googleapis.com/`
against SSRF, and it sets `access-control-allow-origin: *`. **Every image layer whose source is a
GCS URL renders through the proxy.** This is a hard prerequisite, not a nicety: skip it and export
throws a `SecurityError` at `toBlob`.

**Export flow** — the Draw node's lifecycle, unchanged in shape:

1. `toBlob(stageEl, { pixelRatio, filter })` at the format's native pixel size.
2. Wrap as a `File`, upload via `fileNodeService.upload(nodeId, file)` — signed URL to GCS,
   already handles the 4.5 MB Vercel function-body limit.
3. `onPatch({ fileUrl, filename, imageWidth, imageHeight, fileSizeBytes, renderedAt })`.
4. **Download** re-renders first if the composition changed since `renderedAt`, then saves the blob
   locally. It never hands the user a stale file — an "unrendered changes" badge on the header makes
   the state visible, and Download resolves it rather than ignoring it.

`getNodeOutput` gains a `case "post"` returning `data.fileUrl` — so a post behaves like any other
image-producing node downstream.

**Known limitation, accepted:** `html-to-image` fails on extremely large DOMs because of data-URI
size limits. A post is a dozen layers, so DOM size is not the risk; the embedded base64 payload at
A4/300 DPI is. Mitigation is to test the A4 path explicitly (§10) and, if it fails, render print at
150 DPI with an explicit note rather than silently producing a broken file.

## 10. Testing

Pure logic carries the weight, matching how the rest of `src/lib/nodes/` is tested:

- **`units.test.ts`** — normalized ↔ display conversion, both directions, at every format; font size
  as a fraction of height; round-trip stability.
- **`templates.test.ts`** — every registered template produces layers within canvas bounds for every
  format; every template declares a copy zone; ids are unique; the registry matches the picker list.
- **`copy-zone-hint.test.ts`** — each zone shape produces the expected sentence.
- **`brand-kit.test.ts`** — hex extraction from KB prose (including entries with no hex, malformed
  hex, 3-char hex); `logo_variants` label parsing; fallback to `clients.logo_url`.
- **`layers.test.ts`** — reorder, add, delete, duplicate, lock/hide; z-order after each.

**Manual verification** (no rasterization test is worth its maintenance cost): export at each of the
four formats and confirm the PNG matches the on-screen preview; export a post whose plate is a GCS
image and confirm the proxy prevents tainting; export A4 at 300 DPI and check the file opens and is
the right pixel size.

## 11. The Publish button

Ships **present and disabled**, with a tooltip pointing at the publishing spec. The header layout
does not change when publishing lands, and it makes the intended shape of the feature visible to
whoever picks it up. **Download** is how work leaves the system in v1.

## 12. Decisions for the ADR log

To be appended to §7 of `2026-05-30-creativeos-staging-roadmap.md` at implementation time.

> **Numbering caution.** The roadmap's last entry is **D94**. The unmerged
> `worktree-video-start-end-spine` branch also claims numbers in this range and needs renumbering to
> D95+ before landing. Whichever lands second renumbers — the same correction applied to D49–D53 and
> D90.

| # | Decision |
|---|---|
| **D95** | Post composition is a new `post` node, not a mode on Image Gen. *Rejected: transforming the Image Gen node; a Post tab beside Generate/Edit. Refines D27 by bounding it — an edit is the same model producing the same artifact; a post is neither.* |
| **D96** | Post geometry is normalized to 0–1 of the canvas, and the plate is bound by edge rather than copied into the composition. *Rejected: pixel coordinates (locks each post to one output size); snapshotting the plate URL (strands stale imagery).* |
| **D97** | Templates are indexed by composition, and each declares a copy-zone rect that is rendered into a one-way hint appended to the Image Gen prompt. *Rejected: indexing by marketing purpose; a live regeneration loop between the two nodes.* |
| **D98** | The KB grows a structured `brand_kit` section; the Post editor is a read-only consumer of it with "Fix in KB" deep-links, and fonts are a curated app-level list pinned by the KB. *Rejected: a parallel brand-asset store outside the KB; client-uploaded font files in the pilot.* |
| **D99** | Export rasterizes the same DOM the editor renders, client-side, at `pixelRatio` for print; GCS images route through the existing same-origin proxy. *Rejected: Satori/resvg server rendering — a second renderer whose own docs disclaim pixel-matching the browser, with no WOFF2 support.* |
| **D100** | Publishing is a separate spec and a separate stage; v1 ships Download with the Publish button present and disabled. *Rejected: bundling OAuth, token lifecycle, and per-network APIs into the editor build.* |

## 13. Files

```
src/lib/post/
  types.ts              PostNodeData, layer types, ImageSource, PostFormat
  formats.ts            format → pixel size + aspect
  units.ts              normalized ↔ display px  (pure, tested)
  layers.ts             add / delete / reorder / duplicate / lock  (pure, tested)
  fonts.ts              curated webfont list
  copy-zone-hint.ts     zone rect → prompt sentence  (pure, tested)
  brand-kit.ts          KB + client row → BrandKit view model  (pure, tested)
  templates/
    index.ts            registry
    lower-third.ts  inset-card.ts  side-column.ts  split-half.ts

src/components/nodes/
  post-node.tsx                 on-canvas node
  post-focus-view.tsx           shell only — must stay well under the split rule
  post-stage.tsx                canvas + selection + direct manipulation
  post-layer-list.tsx           left panel, Layers tab
  post-brand-kit-panel.tsx      left panel, Brand Kit tab
  post-inspector.tsx            right panel; delegates per layer kind
  post-inspector-text.tsx  post-inspector-shape.tsx
  post-inspector-image.tsx post-inspector-scrim.tsx
  post-add-menu.tsx             rail popover — Text / Shape / Image / Scrim
  post-template-picker.tsx      first-run overlay
  post-layer-render.tsx         the one renderer used by editor AND export

src/services/post-node.service.ts   render → upload → patch
```

`post-layer-render.tsx` being the single renderer shared by the editor and the exporter is the
structural guarantee behind D99. If a second render path ever appears, preview/export drift is back.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Rasterizer fidelity differs from the live preview (shadows, gradients, letter-spacing). | Same DOM, same styles; manual export check per format is a release gate. |
| A4 at 300 DPI exceeds the data-URI ceiling. | Test explicitly; fall back to 150 DPI with a visible note rather than a silently broken file. |
| Empty `brand_kit` on every existing KB. | Empty states with working "Fix in KB" links; colours already work via the prose fallback; `clients.logo_url` covers a single logo. |
| Layer editing on a bottom sheet is cramped on small screens. | Format-aware scale-to-fit; the stage is the only band that flexes. Sub-1280px is not a supported editing width for the pilot. |
| Scope creep toward Canva. | The four layer kinds and four templates are the contract. Anything else is a new spec. |
