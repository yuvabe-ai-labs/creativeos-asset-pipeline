# Script products and locations — design

*2026-10-30 · ADRs D446–D451 · follows [reference-led video prompts](2026-10-30-reference-led-video-prompts-design.md) §8 item 2*

## 1. Problem

A clip's product and set are decided far too late. Today a script knows its cast (each shot's
`onScreen` lists who appears, and the lead's avatar reaches every shot automatically), but it knows
nothing about products or places:

- **Products** have no record anywhere (the KB has no product field, D426/D444). Operators drag a
  packshot onto each prompt node by hand, per clip.
- **Locations** exist only as the text `context.settingAndCamera`. There is no picture of the set,
  so every clip re-imagines it. J365's podcast desk was rebuilt by hand into a composed image and
  attached to each clip separately.
- **Storyboard panels** draw every pack as a plain blank pouch (D342), so what the client approves
  is not what the clip shows.
- The video model cannot tell which image is which: the roles line (D443) relies on the writer's
  guess.

The script is where characters and storyboards are planned, so products and locations are decided
there too, and everything downstream follows them.

## 2. Decisions taken in brainstorming (2026-10-30)

| Question | Answer |
|---|---|
| How is a location's picture made? | Generate it (an empty set, no people) or upload/pick one |
| Owned by the client (library) or the script? | **The script only** |
| Storyboard: real product or blank pouch? | **Draw the real product** from its packshot |
| Who sets each shot's products and location? | **The copilot, plus pickers on each shot row** |
| Where does a packshot come from? | **Upload, or pick** from brand-kit products, KB images, generated images |
| How many images per product? | **Several: a main packshot plus angles** |
| How do they reach clips? | **Resolved from the script like the presenter**, never wired by hand |

## 3. Script data (D446)

`src/lib/scripts/schema.ts`:

```ts
export const scriptImageSchema = z.object({
  url: z.url(),
  /** Where it came from, for the picker's provenance line; never read for behaviour. */
  source: z.enum(["upload", "brand-kit", "kb", "generated", "plate"]),
});

export const productSchema = z.object({
  id: z.string().min(1).max(64),
  /** What the operator calls it: "Jackfruit365 pouch". Also the label the video model reads. */
  name: z.string().trim().min(1).max(80),
  /** Main packshot first, then angles (back, side, open). Empty until the operator adds one. */
  images: z.array(scriptImageSchema).max(6),
});

export const locationSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  /** The place in words: what the plate is drawn from. */
  description: z.string().trim().max(2000),
  /** The background plate: an empty set, no people. Null until generated or added. */
  image: scriptImageSchema.nullable(),
});
```

- `scriptDocSchema` gains `products: z.array(productSchema).max(8).default([])` and
  `locations: z.array(locationSchema).max(6).default([])`.
- `shotSchema` gains `products: z.array(z.string().min(1)).default([])` (none, one or several) and
  `location: z.string().min(1).nullable().default(null)`.
- `superRefine` adds: unique product ids, unique location ids, every shot's `products` and
  `location` known.
- **`.default` is load-bearing**: zod strips unknown keys and `rowToScript` drops a doc that fails
  to parse, so without defaults every existing script would vanish on read.
- Ids are code-assigned from names, like cast ids (`castIdFor`, D331).
- Images are stored by URL. An upload or a generated plate goes to the script's own storage
  (`clients/{c}/scripts/{s}/products/…`, `…/locations/…`); a library pick keeps the library URL.

## 4. Filling it in

### 4.1 The copilot (D447)

`src/prompts/script-copilot.ts` and `src/lib/scripts/copilot/*`:

- **Draft:** the writer returns `products` and `locations` (names; a location also gets a
  description) for whatever the script shows, and each shot's `products` and `location` keys from
  its visual. A shot with no product on screen gets none; a script with one set gets one location.
- **Edit ops**, mirroring the cast ones: `add_product`, `update_product` (rename),
  `remove_product` (also strips it from every shot), `add_location`, `update_location` (name,
  description), `remove_location` (clears it from every shot), `set_shot_assets { shot, products,
  location }`.
- **Import (paste):** products and locations are read from the paste and added as items to
  confirm (D370), never silently.
- The copilot never sets images. A product with no packshot and a location with no plate are shown
  as "needs a picture" on the script page.

### 4.2 The script page

- **Products** and **Locations** sections next to Cast (`script-product-list.tsx`,
  `script-location-list.tsx`), names and descriptions edited inline like cast.
- A product's images: **Add images** opens a picker with an Upload tab and a Library tab (brand-kit
  products, KB images with packshots first, generated images). Several can be added at once; drag
  to reorder; the first is the main packshot.
- A location's plate: **Generate** (§4.3) or **Add image** (same picker).
- **Each shot row** gets a product multi-picker and a location picker (shadcn Select / Combobox);
  a change is a `set_shot_assets` op, so it goes through the same all-or-nothing, compare-and-set
  write (D332, D337) as every other edit.
- Routes under `src/app/api/clients/[id]/scripts/[scriptId]/`: `products/[productId]/images`
  (PUT: upload via `parseFormFile` or a picked URL; DELETE one; PATCH order),
  `locations/[locationId]/image` (PUT upload/pick), `locations/[locationId]/plate` (POST generate),
  `shots/[shotId]/assets` (PATCH). All `withClient`, `apiOk`/`apiError`.
- D338 said Visualise writes only the avatar link into the doc; image attachments for products and
  locations are added to that one exception (D446).

### 4.3 Generating a location plate (D448)

- One click, **Nano Banana 2.1**, billed and owned by the script through `runBilledImageGeneration
  ({ owner: { scriptId } })`, stored by a sibling of `uploadScriptPanel`. Same path as panels, so
  billing, refunds and generation records need nothing new.
- Prompt (`src/prompts/location-plate.ts`): the location's description, the script's
  `settingAndCamera`, the matching regional kit, the script's aspect; **an empty set with no
  people, no text, no products**; eye-level, the whole space readable.
- Synchronous like a panel (maxDuration 300). A redraw replaces the plate.

## 5. Storyboard panels (D449, reverses D342 for real products)

`src/lib/scripts/visualise/panel-inputs.ts`, `panel-prompt.ts`, `keys.ts`:

- References, in order, within Nano Banana 2.1's 14: the shot's people (as now), **the shot's
  location plate**, **each product's main packshot**, then extra product angles while room remains,
  then the house style last (as now).
- Prompt: "This shot is set in the place shown in the location reference" when a plate goes, and
  "Draw {product name} exactly as in its reference" per product with a packshot. The blank-pouch
  rule applies only to a pack the shot mentions that has no packshot; cards and captions stay blank
  (D342 otherwise stands).
- `shotKey` adds the shot's product ids with their image URLs and its location id with its plate
  URL, so a panel goes out of date when any of them changes.

## 6. Canvas and clips (D450)

- **Frozen on the Script node** when the script is added (`add-to-canvas.ts`), like the
  storyboard (D381/D385): `ScriptNodeData.assets = { products, locations, shots: { [shotId]:
  { products, location } } }`.
- **Resolved like the presenter (D299).** For a prompt node whose upstream Shot/Multishot was
  seeded from a script (`seededFrom`), its shots are found by row label (`S{n}` → the doc's shot,
  as `storyboardFor` does; never by position, D380) and their picks unioned. Each pick becomes
  virtual `file` rows: `data.scriptAsset = { kind: "product" | "location", id, name, angle }`,
  `fileUrl`, and an identity-only `processedOutput` for the writer ("Jackfruit365 pouch, the
  product: copy it exactly, never its backdrop"). Row ids: `asset:{productId}:{n}`,
  `asset:location:{locationId}`.
- Added in `getPromptUpstream` (server) and the browser's upstream hook, so the writer, Video Gen's
  focus view and the request all see the same images. One read of the Script node's data; no
  request or channel per node (performance rule 1).
- **Turning one off** uses the existing per-image `off` role in Video Gen.
- **Reference priority** (`selectReferences`, D308): avatar front; cited images; **main packshots
  and the location plate**; avatar sheet; **extra product angles**; the rest. Kling's 5 slots go to
  the face, the product and the place before a third angle.
- **Labels (D443):** a `scriptAsset` row is labelled from the script, ahead of the writer's
  reading and the presenter fallback: `product` / `location` with the asset's name, and ", another
  angle" for an extra angle so the back of a pouch is not read as a second product.

## 7. Client review (D451)

- The share's frozen doc already carries products, locations and picks; the review page shows them
  read-only with their images, and the version diff reports changes to them like cast changes.
- Not commentable as their own parts in this project.

## 8. Phases

1. **Script data and authoring:** schema, copilot ops and prompts, script-page sections, pickers,
   image routes, plate generation.
2. **Storyboard:** panel inputs, prompt, fingerprint.
3. **Canvas and clips:** frozen assets, virtual rows, reference priority, labels, review display.

Each phase ships on its own; phase 2 and 3 do nothing for a script with no products or locations.

## 9. Testing

- Schema: old docs parse with empty lists; unknown product/location ids rejected; caps.
- Copilot: each op, including `remove_product` stripping shots; draft and import fill picks; import
  adds items to confirm.
- Routes: upload, pick, reorder, delete, plate generation billed to the script.
- Panels: reference order and cap; product clause replaces the blank pouch only with a packshot;
  fingerprint changes.
- Canvas: label → shot mapping; union across a Multishot's shots; virtual rows on the server and in
  the browser agree; priority with Kling's cap; labels with angles.

## 10. Records

ADRs D446–D451 appended to the roadmap §7: D446 (script products and locations, refines D338),
D447 (copilot fills them), D448 (location plates), D449 (panels draw the real product, reverses
D342 in part), D450 (resolved onto the canvas like the presenter, refines D299, D308, D443), D451
(review shows them).
