# Post node — compose social & marketing posts over generated plates

**Date:** 2026-08-03
**Status:** Draft design — product decisions settled with the user 2026-08-03; pending spec review.
**Type:** Design spec (new feature; new node type). Introduces decisions **D95–D103** — numbers
provisional, see §14.
**Visual companion:** **[`2026-08-03-post-node-layouts.html`](2026-08-03-post-node-layouts.html)** —
open in a browser. Approved editor shell, rejected alternatives, template compositions, layer anatomy.
**Paired specs:**
[`2026-08-03-post-client-approval-design.md`](2026-08-03-post-client-approval-design.md) — the client
approval + feedback gate.
[`2026-08-03-post-publishing-design.md`](2026-08-03-post-publishing-design.md) — publishing to
Instagram / Facebook / LinkedIn. Build order: **this spec → approval → publishing.**
**Builds on:** **D19** (node = own content + output), **D18** (manual edits fold into the active
version), **D10** (type-specific data via JSONB), **D8** (edges point to nodes), **D30/D46** (media in
GCS; public capability URLs), **D39** ("Set as base" for connected images), **D37 §8** (the
same-origin image proxy), **D40** (focus view as rail + panel + detail), **D77** (credit ledger), the
**Draw node** lifecycle, and the **KB review surface** (`/clients/[id]/kb`).

---

## 1. Problem, users & positioning

Image Gen produces a *plate* — a photographic background. What ships to a client is a **post**: that
plate with a headline, body copy, a CTA, a logo, and usually a colour band or price tag over it.
Today that step happens in Canva or Photoshop, which breaks the chain — the brand palette is retyped
by hand, the finished asset never returns to the canvas, and nothing downstream can see it.

> **Positioning, in the user's words:**
> **"They don't have to switch tools to generate on-brand images."**

That sentence is the whole product thesis, and it is the test every scope request must pass. This
editor does **not** compete with Canva on editing quality — that race is unwinnable and every hour
spent on it is an hour Canva already spent better. It competes on *not making you leave*.

### 1.1 Who this is for

**Design agencies.** The primary user is an agency **designer** composing client work; `senior` and
`owner` review and publish. The client's role is **approval and feedback only** — they never compose,
which is why approval is a read-only shared surface rather than an editor seat.

That single fact licenses a deliberately small editor. A skilled designer with a constrained toolset
and no tool-switching is well served; a brand-side marketer handed the same thing would find it
missing features. We are building for the first.

### 1.2 Jobs to be done

1. *When a plate is ready, lay the campaign copy over it without leaving CreativeOS.*
2. *Apply the brand's colours, fonts and icons without looking anything up.*
3. *Get a caption and hashtags written for me, in the brand's voice.*
4. *Show the client exactly what will be published — artwork and caption together — and get a yes or
   a comment back.*

### 1.3 V1 and V2 — the roadmap thesis

| | **V1 — no tool switching** | **V2 — intelligence** |
|---|---|---|
| Editor | Manual. Text, shapes, images, icons. Four templates. | Unchanged — it does not grow. |
| Copy | Caption + hashtags generated one-shot; on-image text typed. | **All** text AI-generated, on the artwork. |
| Image | Copy-zone hint you read and paste. | **Layout-aware round trip** — pick a template, the plate regenerates to fit its copy zone. |
| Formats | One node, one format. | Campaign fan-out; one composition, re-fitted across formats. |
| Other | — | Variants rendered on the real artifact; glyph-coverage checking. |

**The rule this gives V1:** anything that only makes the *editor* better is out; anything that makes
the *pipeline* smarter is V2. This is what stops the team rebuilding Canva badly the first time
someone asks for a drop shadow.

V1 leaves room for V2 deliberately: the copy zone is a normalized rect (§6) precisely so the round
trip has something to build on.

### 1.4 Success criteria

| Signal | Why it matters |
|---|---|
| **Posts composed here rather than in Canva** | The thesis in one number. If designers keep leaving, nothing else matters. |
| **Time to create a post** | The direct measure of "didn't have to switch tools". Tracked from node creation to first render. |
| Round trips before client approval | Whether the approval loop is actually shorter. |
| Time from approved plate to approved post | End-to-end pipeline speed. |
| Compliance issues caught before publish | Whether the guardrail earns its place. |
| Brand-kit completeness per active client | Leading indicator — an empty brand kit makes the whole value proposition invisible. |

## 2. Scope

**In V1:** the `post` node and its editor; four layer kinds; four templates; a Brand Kit sourced from
the KB; new structured `brand_kit` KB fields; AI-generated caption + hashtags (one-shot);
compliance **warnings**; English and Tamil; client-side export to PNG at any scale.

**Not in V1:** everything in the V2 column above, plus QR codes, freeform paths, blend modes,
text-on-curve, masks, effects, client font files, and stock/illustration libraries.

**Three build slices,** each independently testable:

- **Slice 1 — node and stage.** Node type, data model, connections, focus-view shell, four layer
  kinds rendering, direct manipulation, layer list, inspector. Ends with a composition you can see.
- **Slice 2 — export.** The shared renderer, the image proxy path, render → upload → patch, Download,
  `getNodeOutput`. **The de-risking slice** — if rasterization fidelity fails, it fails here, before
  anything is built on top of it.
- **Slice 3 — brand, copy, compliance.** Templates, first-run picker, KB `brand_kit`, Brand Kit
  panel, caption/hashtag generation, compliance warnings.

## 3. Why a new node type

Three options were considered: transform Image Gen into a Post node; add a "Post mode" tab; add a
separate node. **The separate node wins.**

**Different lifecycle.** Image Gen is a generation node — model, params, credits, async job, an
attempt appended to the version envelope. A composition is authored content. Behind a tab, half of
`ImageGenNodeData` is meaningless while the tab is open, and the eval system reading `generations`
sees rows that aren't generations.

**D27 is the counter-precedent and doesn't apply.** "Editing is a new *attempt*, not a new node"
holds because an edit is the same model producing the same artifact. A post is neither.

**Fan-out.** One plate becomes several deliverables. A mode gives one image = one post; a node lets
one Image Gen feed N Post nodes — the D21 Shot pattern.

**File size.** `image-gen-focus-view.tsx` is ~54 KB with a Generate/Edit tab pair already (D37). A
third mode lands in the most overloaded file in the repo.

**Accepted costs:** more canvas clutter on a fan-out; one more focus view; a round-trip when the
plate changes — mitigated by live edge binding (§4).

## 4. Data model

```ts
// src/lib/canvas-nodes.ts
export type PostNodeData = {
  title?: string;
  format?: PostFormat;
  templateId?: string;
  background?: PostBackground;
  layers?: PostLayer[];        // ordered back → front — authored content, no versions
  caption?: string;            // social caption — generated, then editable (§10)
  hashtags?: string[];         // generated alongside the caption
  fileUrl?: string;            // flattened PNG — this node's output
  filename?: string; imageWidth?: number; imageHeight?: number; fileSizeBytes?: number;
  renderedAt?: string;         // drives the "unrendered changes" badge and approval binding
};
```

```ts
// src/lib/post/types.ts
export type PostFormat = "ig-square" | "ig-story" | "linkedin" | "a4-print";

export type LayerBase = {
  id: string; name?: string;
  x: number; y: number; w: number; h: number;   // 0–1, fraction of canvas
  rotation?: number; opacity?: number; locked?: boolean; hidden?: boolean;
};

export type TextLayer  = LayerBase & {
  kind: "text"; text: string;
  fontFamily: string; fontSize: number;          // fontSize: 0–1 of canvas HEIGHT
  fontWeight: number; color: string;
  align: "left" | "center" | "right";
  lineHeight: number; letterSpacing?: number;
};
export type ShapeLayer = LayerBase & { kind: "shape"; fill: Fill; radius: number };
export type ImageLayer = LayerBase & { kind: "image"; src: ImageSource; fit: "cover" | "contain"; radius?: number };
export type IconLayer  = LayerBase & { kind: "icon";  src: IconSource;  color?: string };

export type PostLayer = TextLayer | ShapeLayer | ImageLayer | IconLayer;

export type Fill =
  | { kind: "solid";    color: string }
  | { kind: "gradient"; from: string; to: string; angle: number };

export type ImageSource =
  | { kind: "node"; nodeId: string }    // live — resolved from a connected node at render time
  | { kind: "url";  url: string };      // Brand Kit asset or upload

export type IconSource =
  | { kind: "lucide"; name: string }    // inbuilt pictograms
  | { kind: "simple"; name: string }    // inbuilt brand marks (§7.2)
  | { kind: "url";    url: string };    // the client's own, from the brand kit

export type PostBackground =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: ImageSource; fit: "cover" | "contain" };
```

**Four layer kinds, not five.** An earlier draft had a separate `scrim`. A scrim is a shape with a
gradient fill and no border, so it folds into `shape` — one less concept, same capability, and the
legibility fix survives. It matters: light text over a busy plate is unreadable without one.

**Geometry is normalized.** Every `x/y/w/h` is a 0–1 fraction of the canvas; `fontSize` is a fraction
of canvas *height*. The inspector shows "20" via a pure conversion against a 1080px baseline
(`src/lib/post/units.ts`, tested both directions). This is what makes print work — A4 at 300 DPI is
2480×3508 and the same composition renders at any size — and what V2's fan-out will build on.

**The plate is edge-bound, not copied.** `{ kind: "node", nodeId }` resolves from the connected
node's current output at render time, so regenerating upstream updates the post rather than stranding
a stale copy. When several images are connected, the picker chooses which feeds which layer — the
D39 "Set as base" shape.

**Connections** (`VALID_CONNECTIONS`): `image-gen | file | draw → post`; `post → []`.
Registered in `ADD_NODE_OPTIONS` as `{ type: "post", label: "Post", mnemonic: "O" }` — `P` is Prompt.

## 5. The editor

House focus-view frame: bottom `Sheet` at `h-[92vh]`, "Back to canvas", `EditableField` title,
actions top-right. Four bands. Full-fidelity version in the visual companion.

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
│    │ ▸ Scrim shape│        │  ▬▬▬▬ ◀ sel  │          │  └──────┘ └────────┘  │
│    │ ▸ Bg      🔒 │        │  ▬▬▬▬▬▬      │          │  ┌─────────────────┐  │
│    │              │        │  ( CTA )     │          │  │ colour          │  │
│    │ BRAND COLOURS│        └──────────────┘          │  └─────────────────┘  │
│    │ ● ● ● ●      │                                  │  align · spacing      │
└────┴──────────────┴──────────────────────────────────┴───────────────────────┘
  rail    panel                    stage                       inspector
```

| Band | Holds | Why it earns the space |
|---|---|---|
| Icon rail | Layers · Brand Kit · **Add** | Add is a popover menu (Text / Shape / Image / Icon), not a third panel. |
| Left panel | Layer list, or Brand Kit | The layer list is what makes overlapping layers editable: reorder, lock the plate, reach a layer buried behind another. |
| Stage | Canvas + selection handles | Scale-to-fit; the only element with a shadow. |
| Inspector | Properties for the selection | Contextual; empty state prompts "select a layer". |

**Templates are not a band.** Picking one is a once-per-post act — a first-run overlay when `layers`
is empty, then "Change template" in the header menu. A permanent template browser is idle for the
whole session after the first click.

**Rejected shells,** so they aren't silently re-litigated: templates in the left panel; a horizontal
properties toolbar (fine for text, awkward for shapes and icons, no room for gradient stops); a
single right panel with a floating insert bar (biggest canvas, but one panel doing Properties +
Layers + Brand Kit fights itself the moment you drag a logo in while a layer is selected).

**Direct manipulation:** click to select, drag to move, corner handle to resize, top handle to
rotate, double-click text to edit in place. Arrow keys nudge, shift-arrow ×10. Snapping to canvas
centre lines and to the template's copy-zone edges.

## 6. Templates and the copy zone

Indexed by **composition**, not marketing purpose — composition is what decides whether a template
fits the plate you have. Purpose rides along as a tag.

| Template | Composition | Copy zone | Purpose tags |
|---|---|---|---|
| **Lower third** | Full-bleed image, copy in bottom 35% over a gradient shape | bottom 36% | offer, promotion |
| **Inset card** | Image inset on a brand-coloured field, copy on the solid | below the plate | launch, announcement |
| **Side column** | Vertical split — image one side, copy column the other | left 46% | offer, brochure |
| **Split half** | Hard 50/50 image and brand colour block | bottom 50% | discount, sale |

*Deferred:* Upper band (the mirror of Lower third), Centred hero (one line over a darkened plate).

A template is a pure data module in `src/lib/post/templates/` — id, name, purpose tags, copy-zone
rect, and a function producing seed layers for a format. No React, so it is unit-testable.

**The copy zone is a contract.** `copyZoneHint(zone) → string` renders it as *"Leave the lower 35% of
the frame clear and uncluttered — no key subject matter, no busy detail; this area will carry text."*

**In V1 it is display-and-copy.** The editor shows it as an **Image brief** line with a copy button;
**nothing is written to another node**. Edges run `image-gen → post`, so auto-injection would be a
downstream node writing upstream — a surprising data-flow direction for a one-sentence payload.
**V2 closes the loop** (§1.3): pick a template, the plate regenerates to fit. The rect is already in
the data model for exactly that.

**Ownership:** templates are code modules in V1, so only we add them. Making them org-authorable
later is a move to data, not a config flag — a known cost, not a surprise.

**Format switching** after composing re-fits normalized geometry to the new aspect and **warns** that
a large ratio change (9:16 → 1200×627) will look wrong. No automatic re-layout; that's V2.

## 7. Brand Kit — sourced from the KB

The Brand Kit panel is a **read-only projection** of the client's KB and client record. Nothing about
brand identity is stored on the Post node or in a parallel asset store. Where the KB is empty, the
panel shows an empty state with a **"Fix in KB →"** deep-link to `/clients/[id]/kb`.

The KB today is prose built for *prompting* — every leaf a `KBField<string | string[]>` with
confidence and review status. A Brand Kit needs loadable assets and structured values. So the KB
grows a section:

```ts
// src/lib/kb/schema.ts — new section on TraceableBrandKBSchema
export const TraceableBrandKitSchema = z.object({
  colour_tokens:  kbField(z.array(z.string())),  // bare hex only: '#C8A000'
  font_primary:   kbField(z.string()),           // display/heading family name
  font_secondary: kbField(z.string()),           // body family name
  logo_variants:  kbField(z.array(z.string())),  // 'primary <url>', 'mono-dark <url>', …
  icons:          kbField(z.array(z.string())),  // the client's own iconography (§7.2)
  hashtags:       kbField(z.array(z.string())),  // evergreen brand tags (§10)
});
```

Ordinary `kbField(...)` entries, so they inherit the existing review UI, versioning, and
confidence/status for free, rendering in `kb-field-row.tsx` with no new component.

**Migration reality:** existing KBs come back empty here until re-extracted or filled by hand. The
Brand Kit degrades to empty states with working links, and `clients.logo_url` (already exists, with
an upload path) is the fallback single logo.

**Colours work before anyone re-extracts.** `colour_palette_primary` already stores
`"turmeric gold #C8A000"`, and `kb-color-swatches.tsx` already parses the hex. That `HEX` regex moves
to `src/lib/kb/utils.ts` and is imported by both call sites — one definition, per the reusability rule.

### 7.2 Icons — three sources

| Source | What it covers | Cost |
|---|---|---|
| **Lucide** (`lucide-react@^1.17.0`, installed) | Generic pictograms: phone, map-pin, mail, check, arrow, star. | Zero. |
| **Simple Icons** | Social and brand marks. | A new dependency. |
| **Client's own** | Brand iconography, uploaded; lives in `brand_kit.icons`. | Upload path + picker. |

**Simple Icons is not optional.** Lucide 1.0 (June 2026) **removed every brand icon** under trademark
pressure and states it will not accept them again — it officially points to Simple Icons instead. The
installed version is post-1.0, so there is **no Instagram, WhatsApp or Facebook mark available today**,
and a contact strip on a brochure needs them.

**The house "Lucide only, 1.5 stroke, no fills" rule governs app chrome.** An icon a designer places
inside a client's brochure is *content*, not UI — a filled WhatsApp mark is correct there and must
not inherit the app's stroke convention.

## 8. Compliance — warnings, never blocking

Post copy is the only human-written text in the pipeline. Every other text is model-generated under
the KB's compliance constraints, which `parse-context.ts` already injects into prompts. A headline
typed into a text layer bypasses that — and it is the text published at full size on the client's own
account.

| KB field | Surfaced as |
|---|---|
| `never_use_words` | Match highlighted in the layer; listed in the compliance panel. |
| `never_use_claims` | Phrase-level match, listed. |
| `never_use_tone` | Advisory guidance. |
| `disclaimers` | Checklist of required lines; each insertable as a text layer in one click. |
| `preferred_phrases`, `preferred_verbs` | Suggestions in the Brand Kit panel. |

**Nothing blocks.** Not export, not publish, not even a banned word. A compliance **chip** in the
header shows *clear* or *n issues* and opens a panel listing each against the layer it came from.

That is a deliberate call, taken against my own recommendation to block on `never_use_words`. The
reasoning that won: a tool designers are *told* to use, which also refuses to let them export, is a
tool they route around. Warnings that are always right are worth more than a block that is
occasionally wrong.

Pure function `checkCopy(layers, caption, kb.compliance) → ComplianceIssue[]`, unit-tested, no model
call — string matching against a list the client already approved, instant as you type. It covers the
caption and hashtags too, not just on-image text.

**Contrast** is handled the same way: each text layer's contrast against what's behind it raises an
**advisory** flag with "add a scrim" as a one-click fix. Never a gate — designers overrule contrast
deliberately and often correctly.

When a client has no compliance data the chip reads "no compliance rules set" with a Fix-in-KB link
— visibly absent rather than silently passing.

## 9. Fonts, and Tamil

- A **curated app-level list** of ~12 webfonts in `src/lib/post/fonts.ts`, self-hosted in
  `src/fonts/` and loaded with `next/font/local` — matching how Clash Display and Gilroy are already
  vendored. Self-hosting is required, not stylistic: the exporter inlines fonts as data URLs (§11),
  which needs the bytes same-origin.
- `font_primary` / `font_secondary` in the KB **pin the client's defaults**; the picker surfaces them
  first.
- **Client font files are out.** Licensing plus font loading inside an export renderer is its own
  problem.

**V1 supports English and Tamil.** Other Indian scripts come later; naming them here makes their
absence a decision rather than an oversight.

**Every font declares a Tamil companion.** A client's brand font almost certainly has none — `Playfair
Display` has no Tamil glyphs at all — so each family in the list pairs with a Tamil face (Noto Serif
Tamil with a serif, Noto Sans Tamil with a sans), and a Tamil text layer falls back to the companion.
The designer sees which font is actually in use; it is not a silent substitution.

**Glyph-coverage checking is V2.** V1 renders Tamil but does not police whether the chosen font can.
Accepted risk, stated plainly: a missing glyph renders as empty boxes in the preview *and* the
exported PNG, and V1 will not catch it.

**Fonts are subset to the glyphs actually used before inlining**, or Tamil coverage pushes the export
against the data-URI ceiling (§11).

## 10. Caption and hashtags

**The caption lives on the post, not in the publish dialog** — because the client approves the
artwork and the caption **together**, as one thing. An offer's terms, price, and claims live in the
caption; approving artwork alone would leave the riskiest copy unreviewed.

**V1 generates both, one-shot.** A single model call produces a caption and hashtags; the designer
edits them by hand afterwards. No history, no variants, no regenerate-and-compare — that is V2.

What it generates from — all of it already exists:

- KB `tone_of_voice` and `personality` — so it sounds like the brand.
- KB `compliance` — so it doesn't write a banned claim in the first place, which beats flagging one
  afterwards.
- KB `brand_kit.hashtags` — the client's evergreen tags, so they aren't retyped per post.
- The connected Script node's `caption` and `cta`, when one is connected.
- **The rendered post image as a vision attachment**, so the caption describes the actual artwork.

**Credits:** this is an ordinary metered text generation. `estimatePromptCredits(attachmentCount)` is
already `5 + 2.5 × attachments` (`src/lib/credits/prompt-estimate.ts`), so a caption with the image
attached is 7.5 credits under the existing model. No new pricing decision.

**This makes the Post node a hybrid**, and that is more consistent with the architecture than the
alternative: layers are authored content in `data` (no versions), while the caption is a generated
output. The Prompt node is the precedent — instruction plus context, one model call, result editable
in place (D18/D19).

**Per-network hashtag differences are V2.** V1 has one caption and one tag list. Instagram's
first-comment convention is a publishing concern, not an editor one, and belongs in that spec.

## 11. Rendering and export

**The editor renders real DOM, and export rasterizes that same tree** — one renderer, so preview and
output cannot drift. Layers are absolutely-positioned elements in a container sized to the format;
normalized geometry × container size = CSS pixels.

**Library: `html-to-image`.** It clones the node, inlines computed styles, embeds webfonts and images
as data URLs, wraps the result in an SVG `<foreignObject>`, and draws it to an off-screen canvas. It
exposes `pixelRatio`, explicit `width`/`height`, `backgroundColor`, `filter` (to exclude selection
handles) and `fontEmbedCSS`.

**Server-side rendering was evaluated and rejected.** Satori + resvg is deterministic, but it would
be a *second* renderer, and its own docs say it *"does not guarantee that the SVG will 100% match the
browser-rendered HTML output"*; `display` is only `flex`/`contents`/`none`; `calc()` is unsupported;
**WOFF2 is not supported**. It also uses its own layout engine — which would be exactly where Tamil
shaping broke. `html-to-image` rasterizes through the browser's own text engine, so Tamil combining
vowel signs and ligatures render correctly for free.

**Canvas tainting is already solved here.** GCS public objects send no CORS headers, so a
`crossOrigin` load fails and canvas readback throws. `src/app/api/image-proxy/route.ts` exists for
exactly this (built for D37's annotation canvas), locked to the storage host against SSRF. **Every
image layer sourced from GCS renders through the proxy** — a hard prerequisite, not a nicety.

**Export flow**, the Draw node's lifecycle unchanged in shape:

1. `toBlob(stageEl, { pixelRatio, filter })` at the format's native pixel size.
2. Upload via `fileNodeService.upload(nodeId, file)` — signed URL to GCS, already handles Vercel's
   4.5 MB function-body limit.
3. `onPatch({ fileUrl, filename, imageWidth, imageHeight, fileSizeBytes, renderedAt })`.
4. **Download** re-renders first if the composition changed since `renderedAt`, then saves locally.
   Never hands the user a stale file.

`getNodeOutput` gains `case "post"` returning `data.fileUrl`.

**Accepted limitation:** `html-to-image` fails on very large DOMs because of data-URI size limits. A
post is a dozen layers, so DOM size isn't the risk; the embedded base64 at A4/300 DPI is. Test the A4
path explicitly; if it fails, render print at 150 DPI with a visible note rather than producing a
broken file silently.

## 12. Permissions and approval

| Action | designer | senior | owner |
|---|---|---|---|
| Create / edit / render a post | ✅ | ✅ | ✅ |
| Download the rendered PNG | ✅ | ✅ | ✅ |
| Share the approval link with the client | ✅ | ✅ | ✅ |
| **Publish to a live account** | ❌ | ✅ | ✅ |

**One gate: the client.** Anyone may send a post to the client for approval — that is ordinary client
contact, not a privileged act. **Publishing** requires (a) the client having approved *this render*
and (b) a `senior`/`owner` role. Internal senior review stays as it is today: D29 flag-only, gating
nothing.

**Approval binds to the render, not the node.** Otherwise "approve → nudge the headline → publish"
ships something the client never saw. Editing after approval invalidates it and requires
re-approval — a visible state on the node, never a silent reset. `renderedAt` is what it binds to.

**Download is not gated on approval** — internal copies and client mock-ups are how approval happens
in the first place.

The Publish button ships **present and disabled** in this spec, with a tooltip pointing at the
publishing spec, so the header layout doesn't change when publishing lands.

## 13. Testing

- **`units.test.ts`** — normalized ↔ display conversion both directions at every format; round-trip stability.
- **`templates.test.ts`** — every template produces in-bounds layers for every format; every template declares a copy zone; ids unique; registry matches the picker.
- **`copy-zone-hint.test.ts`** — each zone shape produces the expected sentence.
- **`compliance.test.ts`** — banned-word matching across inflections; claim phrases; disclaimer checklist; caption and hashtags included; empty-KB behaviour.
- **`brand-kit.test.ts`** — hex extraction from KB prose (no hex, malformed, 3-char); `logo_variants` label parsing; icon source resolution; fallback to `clients.logo_url`.
- **`fonts.test.ts`** — every family declares a Tamil companion; the fallback resolves.
- **`layers.test.ts`** — add, delete, reorder, duplicate, lock/hide; z-order after each.

**Manual, as a release gate:** export at each format and compare to the on-screen preview; export a
post whose plate is a GCS image and confirm the proxy prevents tainting; export A4 at 300 DPI; render
a Tamil headline and confirm shaping and export.

## 14. Decisions for the ADR log

To be appended to §7 of `2026-05-30-creativeos-staging-roadmap.md` at implementation time.

> **Numbering caution.** The roadmap's last entry is **D94**. The unmerged
> `worktree-video-start-end-spine` branch also claims this range and needs renumbering before
> landing. Whichever lands second renumbers — as happened to D49–D53 and D90.

| # | Decision |
|---|---|
| **D95** | Post composition is a new `post` node, not a mode on Image Gen. *Rejected: transforming Image Gen; a Post tab beside Generate/Edit. Bounds D27 — an edit is the same model producing the same artifact; a post is neither.* |
| **D96** | Post geometry is normalized to 0–1 of the canvas, and the plate is bound by edge rather than copied in. *Rejected: pixel coordinates (locks a post to one output size); snapshotting the plate URL (strands stale imagery).* |
| **D97** | Templates are indexed by composition and each declares a copy-zone rect; in V1 the rect renders to a copyable hint, and V2 closes the loop by regenerating the plate to fit. *Rejected: indexing by marketing purpose; auto-injecting the hint upstream in V1.* |
| **D98** | The KB grows a structured `brand_kit` section — colours, fonts, logos, icons, evergreen hashtags — and the Post editor is a read-only consumer with "Fix in KB" links. *Rejected: a parallel brand-asset store outside the KB; client font files in the pilot.* |
| **D99** | Export rasterizes the same DOM the editor renders, client-side, at `pixelRatio`; GCS images route through the existing same-origin proxy. *Rejected: Satori/resvg — a second renderer whose own docs disclaim pixel-matching the browser, with no WOFF2 support and its own layout engine (which would break Tamil shaping).* |
| **D100** | Publishing is a separate spec and stage; V1 ships Download with Publish present and disabled. *Rejected: bundling OAuth and per-network APIs into the editor build.* |
| **D101** | Compliance is checked against the client's KB and **warns only** — nothing blocks export or publish, including banned words. *Why: a tool designers are told to use, which also refuses to let them export, gets routed around. Taken against the spec author's recommendation to block on `never_use_words`. Rejected: blocking on banned words; an LLM compliance pass (too slow to run as you type, non-deterministic on a legal question).* |
| **D102** | V1 supports English and Tamil, every font declares a Tamil companion for fallback, and glyph-coverage checking is deferred to V2. *Why: a client's brand font has no Tamil glyphs, so pairing is structural, not cosmetic. Accepted risk: a missing glyph renders as empty boxes and V1 will not catch it. Rejected: Latin-only; blocking export on missing glyphs.* |
| **D103** | The caption and hashtags live on the post, are AI-generated one-shot in V1, and are part of what the client approves; publishing requires client approval of that exact render and a `senior`/`owner` role. *Why: an offer's terms and claims live in the caption — approving artwork alone leaves the riskiest copy unreviewed. Makes the node a hybrid (layers in `data`, caption as generated output), following the Prompt node. Rejected: the caption in the publish dialog; the Publish button as its own gate; senior review as a gate on client contact.* |

## 15. Files

```
src/lib/post/
  types.ts  formats.ts  units.ts  layers.ts  fonts.ts
  copy-zone-hint.ts   zone rect → prompt sentence      (pure, tested)
  compliance.ts       copy + KB compliance → issues    (pure, tested)
  brand-kit.ts        KB + client row → view model     (pure, tested)
  icons.ts            lucide / simple / url resolution
  templates/
    index.ts  lower-third.ts  inset-card.ts  side-column.ts  split-half.ts

src/components/nodes/
  post-node.tsx  post-focus-view.tsx  post-stage.tsx
  post-layer-list.tsx  post-brand-kit-panel.tsx  post-add-menu.tsx
  post-inspector.tsx  post-inspector-{text,shape,image,icon}.tsx
  post-template-picker.tsx  post-caption-panel.tsx  post-compliance-chip.tsx
  post-layer-render.tsx     the ONE renderer used by editor AND export

src/services/post-node.service.ts   render → upload → patch; caption generation
src/app/api/nodes/[id]/post/caption/route.ts
```

`post-layer-render.tsx` being the single renderer shared by editor and exporter is the structural
guarantee behind D99. A second render path means preview/export drift is back.

## 16. Risks

| Risk | Mitigation |
|---|---|
| **Designers keep using Canva** — the product risk that outranks every technical one. | The wedge is not editing quality (§1). Measured directly by the first success criterion; if it misses, the answer is not more editor features. |
| Rasterizer fidelity differs from the live preview. | Same DOM, same styles; manual export check per format is a release gate. |
| A4 at 300 DPI exceeds the data-URI ceiling. | Test explicitly; fall back to 150 DPI with a visible note. |
| Tamil renders as tofu and V1 doesn't catch it (D102). | Font pairing makes it unlikely; manual Tamil export is a release gate; checking lands in V2. |
| Empty `brand_kit` on every existing KB. | Empty states with working links; colours work via the prose fallback; completeness is a tracked metric. |
| Warn-only compliance lets a violation through (D101). | Accepted deliberately. The chip is visible at compose, render and publish; the client also sees the caption at approval. |
| Scope creep toward Canva. | §1.3 is the test: editor-only improvements are out, pipeline intelligence is V2. |

## 17. Open questions

1. **Which pilot client goes first**, and is their KB complete enough to show the brand-kit value on day one?
2. **Does a post need more than one approval round recorded**, or is latest-wins enough? Assumed latest-wins in the approval spec.
3. **Undo/redo** is unspecified. It wins nobody over, but its absence makes an editor feel cheap — which matters even when adoption is mandated. Recommend including it in Slice 1; not yet decided.
