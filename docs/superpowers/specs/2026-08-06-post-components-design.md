# Post Components — design

**Date:** 2026-08-06
**Status:** ⏸️ **DEFERRED 2026-08-08 — approved but not built.** Nothing in this spec has been
implemented; no `src/lib/post/components/` directory exists. Picked up later.
**Depends on:** `2026-08-05-brand-kit-design.md` (shipped) — components fill themselves from
`BrandDetails` and the client's logo.

> **Revisit trigger.** The template library was cut from fourteen to four on the same day this
> was parked, on the grounds that a weak entry costs more than it saves. That judgement applies
> here too: build these only when there is appetite to design fifteen blocks properly, and cut
> the list rather than ship filler. §2's fifteen are a starting proposal, not a commitment.

## 1. Goal

Fifteen finished, drop-in blocks — headers, footers, content blocks and accents — that land as
ordinary editable layers and arrive pre-filled with the client's real phone, address, website
and social handles.

The distinction from templates: a **template** composes a whole canvas and replaces everything;
a **component** is a *part* you add to work already in progress. Applying a template is
destructive and confirms; dropping a component never is.

## 2. The fifteen

Every component returns a `GroupLayer`. `→` marks the `BrandDetails` / logo fields it fills.

### Headers — land at the top

| # | Id | Name | Fills |
|---|---|---|---|
| 1 | `logo-tagline-bar` | Logo + tagline bar | logo |
| 2 | `editorial-title` | Editorial title (eyebrow, headline, hairline rule) | — |
| 3 | `centred-title` | Centred title with rules above and below | — |

### Footers — land at the bottom

| # | Id | Name | Fills |
|---|---|---|---|
| 4 | `contact-strip` | Phone · email · website in one row with icons | phone, email, website |
| 5 | `address-block` | Map pin + two-line address | address |
| 6 | `social-row` | Instagram / Facebook / WhatsApp marks with handles | instagram, facebook, whatsapp |
| 7 | `contact-footer` | Logo left, contact stacked right | logo, phone, email, website |
| 8 | `website-cta-bar` | Dark full-width strip: website + "DM to order" | website |

### Content blocks — land centred

| # | Id | Name | Fills |
|---|---|---|---|
| 9 | `stat-block` | Oversized number + label | — |
| 10 | `quote-block` | Quotation mark, quote, attribution | — |
| 11 | `numbered-tip` | Circled numeral + title + body | — |
| 12 | `price-tag` | Old price struck through, new price, % off badge | — |
| 13 | `feature-list` | Three check rows | — |

### Accents — land where dropped

| # | Id | Name | Fills |
|---|---|---|---|
| 14 | `corner-ribbon` | Rotated NEW / SALE badge | — |
| 15 | `cta-pill` | Rounded button with arrow | — |

## 3. Module shape

Mirrors `src/lib/post/templates/` exactly, so there is one pattern in the codebase for
"a thing that seeds layers", not two.

```ts
// src/lib/post/components/index.ts
export type ComponentZone = "top" | "bottom" | "centre" | "free";

export type PostComponent = {
  id: string;
  name: string;
  section: "header" | "footer" | "block" | "accent";
  zone: ComponentZone;
  /** True when this component reads BrandDetails or the logo — drives the panel's nudge. */
  usesBrand: boolean;
  seedLayers: (format: PostFormat, brand: ComponentBrand) => PostLayer[];
};

/** Everything a component may fill itself from. `logoUrl` is absent for a client with no
 *  logo; components that want one fall back to a placeholder rectangle. */
export type ComponentBrand = { details: BrandDetails; logoUrl?: string };
```

Each of the fifteen is its own file exporting `id`, `name`, `section`, `zone`, `usesBrand`
and `seedLayers`, registered in `index.ts`. One file per component keeps each one small
enough to read whole, matching the templates directory.

## 4. Brand substitution

One shared helper, and it is the interesting unit:

```ts
// src/lib/post/components/brand-fill.ts
/**
 * The real value, or a visible placeholder that says what belongs there.
 * Never returns "" — an empty text layer is invisible on the canvas and reads as the
 * component having failed to render, rather than as a field waiting to be filled.
 */
export function fillOr(value: string | undefined, placeholder: string): string;

/** Formats a handle for display: "@yourhandle" from either "yourhandle" or "@yourhandle",
 *  so what an operator typed in Details lands looking right either way. */
export function formatHandle(value: string | undefined, placeholder: string): string;
```

Substitution happens **at drop time**, once. A component is not live-linked: changing the
client's phone afterwards does not reach into finished posts. That was decided during the
Brand Kit brainstorm and holds here — it is the same reason applying a template does not
keep tracking the template.

When `BrandDetails` is empty, brand-filling components still drop with placeholders and the
panel shows one line pointing at the Brand tab. Silently handing over "Your phone number"
with no explanation is what makes a feature feel like a demo.

## 5. Placement zones

Each component declares a zone; the drop position is computed from it rather than from the
generic cascade.

| Zone | Position | Used by |
|---|---|---|
| `top` | Flush to the top margin | Headers |
| `bottom` | Flush to the bottom margin | Footers |
| `centre` | Vertically centred | Content blocks |
| `free` | Standard cascade | Accents |

A footer that arrives in the middle of the canvas is not a footer — the operator would move
it to the bottom every single time, so the component does it. Dragging a component onto the
canvas overrides the zone with the cursor position: an explicit drop point is a stated
intention and beats the default.

```ts
// src/lib/post/components/placement.ts
export function zoneOrigin(
  zone: ComponentZone, height: number, existing: PostLayer[],
): { x: number; y: number };
```

## 6. One definition, not three bands

Templates tune themselves across three aspect bands (D124) because they compose an entire
canvas — a full-bleed layout that works on 9:16 is wrong on 16:9. A component occupies a
band of the canvas and is positioned, so it does not need that: `fontSize` is already based
on `min(width, height)` (D123) and shape boxes take the `squareBox` correction, which
together keep a contact strip proportionate on every format.

This is a deliberate simplification, not an oversight — fifteen components × three bands is
forty-five compositions to tune and no reviewer could verify them.

## 7. Panel

A new rail item, `components`, between Elements and Text. `PostPanelComponents` uses the
same two-column sub-nav shell the Brand panel now has — **Headers · Footers · Blocks ·
Accents** — with `PostLayersPreview` thumbnails seeded for the current format, so the tile
shows what will actually land.

Click to add, drag to place, matching every other panel. Reuses the `ELEMENT_DRAG_TYPE`
payload with one new variant, `{ kind: "component"; componentId: string }`.

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Brand details empty | Components drop with placeholders; panel shows one nudge line. |
| Client has no logo | Logo-bearing components drop a neutral placeholder rectangle named "Logo" — sized correctly, so replacing it is a drag-and-drop, not a rebuild. |
| Brand kit still loading | The panel renders; components drop with placeholders. Never blocks. |
| Brand kit failed to load | Same as empty. A component is useful without brand data; refusing to drop one would be worse than a placeholder. |
| Unknown `componentId` in a drag payload | Ignored, no layer added. Payloads cross an OS-level channel and can be stale. |

## 9. Testing

Vitest runs `environment: "node"`, so `.tsx` is `tsc`-verified only. The testable units:

| Unit | Cases |
|---|---|
| `fillOr` | Real value passes through; undefined and `""` both yield the placeholder; never returns `""` |
| `formatHandle` | Bare handle gains `@`; one already prefixed is not doubled; undefined yields the placeholder |
| `zoneOrigin` | `top` sits at the margin; `bottom` accounts for the component's own height; `centre` is centred; `free` cascades; a component taller than the canvas still lands on it |
| Registry | All 15 present, ids unique, every `section` and `zone` valid |
| Each component's `seedLayers` | Returns a non-empty group; every child inside 0–1; brand-filling ones contain the real value when given details and the placeholder when not |

## 10. Non-goals

- Live-linked components (settled: drop-time substitution).
- User-saved custom components — a real feature, and a separate one.
- Aspect-band variants (§6).
- Components that place the connected photo — that is what templates' `imageSlot` is for.

## 11. File structure

| File | Responsibility |
|---|---|
| `src/lib/post/components/index.ts` | Types + registry of all 15 |
| `src/lib/post/components/brand-fill.ts` (+test) | `fillOr`, `formatHandle` |
| `src/lib/post/components/placement.ts` (+test) | `zoneOrigin` |
| `src/lib/post/components/<id>.ts` × 15 | One per component |
| `src/lib/post/components/index.test.ts` | Registry + per-component invariants |
| `src/components/nodes/post-panel-components.tsx` | The panel |
| `src/lib/post/element-drag.ts` | `component` payload variant |
| `src/components/nodes/post-tool-rail.tsx` | The rail item |
| `src/components/nodes/post-focus-view.tsx` | `addElement` case, panel wiring |

## 12. Decisions for the ADR log (D136+)

- **D136** — Components are a separate concept from templates: additive, never destructive.
- **D137** — Brand substitution happens once at drop time, not live.
- **D138** — Components declare a placement zone; a drag overrides it.
- **D139** — One definition per component, not three aspect bands.
- **D140** — A missing brand value yields a visible placeholder, never an empty string.
