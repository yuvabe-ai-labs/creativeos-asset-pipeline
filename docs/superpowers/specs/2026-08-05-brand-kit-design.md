# Brand Kit — design

**Date:** 2026-08-05
**Status:** approved, ready for planning
**Follows:** `2026-08-05-post-editor-canva-shell-design.md`
**Followed by:** the Components panel (its own spec — see §12)

## 1. Goal

Give every client a kit of reusable brand material — logos, background images, product
photos, and contact details — that lives at the **client** level and is therefore available
on every canvas that client owns, and place any of it into a Post with one click or one
drag.

Today the Post editor's Brand rail item is `PostBrandTabStub`: a paragraph promising
"colours, fonts, logos, and icons pulled straight from the client's brand profile." This
spec makes that true for colours, logos, backgrounds, products, and details. Fonts are an
explicit non-goal (§2).

## 2. Non-goals

| Not doing | Why |
|---|---|
| Fonts from the KB | `typography_style` is a prose field ("clean geometric sans, generous tracking"). It cannot be mapped to a `FontKey` reliably, and guessing wrong silently restyles a design. |
| Managing the kit outside the Post editor | The panel is the one surface (§7). A client-page Brand Kit section is a later addition, not a prerequisite. |
| Versioning or history of assets | An asset is a URL and a row. Re-uploading is cheap; nothing warrants an append-only log. |
| Sharing a kit across clients | Agencies never share client brands (roadmap §7, D-org). Client-scoped is the whole point. |
| The Components panel | A content library with no backend. It depends on this spec's brand details, so it ships second. |
| Live-linked instances | A placed asset becomes ordinary layers. Changing the kit does not reach back into finished posts. |

## 3. Data model

### 3.1 `client_brand_assets` — a new table

```sql
create table client_brand_assets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  category    text not null check (category in ('logo','background','product')),
  name        text not null,
  storage_url text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

create index client_brand_assets_client_idx on client_brand_assets (client_id, category);

-- Default-deny RLS, matching 0017_default_deny_rls.sql. This table is created after 0017
-- ran, so it is not covered by it; without these lines anyone holding the public anon key
-- could read and write rows straight through the REST API, bypassing the DAL entirely.
-- Zero policies is deliberate: the app reaches this table through the service-role client,
-- which bypasses RLS regardless.
alter table client_brand_assets enable row level security;
```

**Why not reuse `client_brand_images`.** That table is the KB's vision-analysis corpus —
every reference photo uploaded to teach the extraction model what the brand looks like.
Its rows are inputs to a pipeline, not assets anyone chose to design with. Surfacing them
in the Brand panel would fill it with analysis material and give the operator no way to
tell the two apart. Separate purposes, separate tables.

`position` exists so the panel can be reordered later without a migration. Nothing in this
spec writes anything but the default.

### 3.2 Brand details — JSONB on `clients`

```sql
alter table clients add column brand_details jsonb not null default '{}';
```

```ts
/** Every field optional — a narrow-waist payload (D10); readers tolerate all absent. */
export type BrandDetails = {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
};
```

**Why JSONB, not columns.** D10 is the house convention for exactly this shape, and the
set of details will grow — a second phone number, a fourth social — without a migration
each time. Nothing queries or filters on these fields; they are read whole and rendered.

The KB is not the right home: it is model-extracted and versioned, whereas these are facts
an operator types and expects to stay exactly as typed.

### 3.3 Seeding from the existing logo

`clients.logo_url`, when set, is surfaced in the Logos section as a **synthesized** entry —
`{ id: "client-logo", category: "logo", name: "Client logo", storage_url: <logo_url> }` —
not a row. So the panel is useful the first time it is opened, before anything is uploaded.

It is not deletable from the panel: the client page owns it, and deleting it there is a
different act from removing a kit asset. The UI marks it with a quiet "from client profile"
label so its immovability reads as intentional rather than broken.

## 4. Storage

Mirrors `pathForClientLogo` / `signClientLogoUpload` exactly — the browser uploads straight
to GCS against a signed URL; no bytes pass through the app.

```ts
// src/lib/storage/paths.ts
export function pathForBrandAsset(args: {
  clientId: string; category: BrandAssetCategory; assetId: string; filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/brand-kit/${args.category}/${args.assetId}/${name}`;
}

// src/lib/storage/index.ts
export function signClientBrandAssetUpload(args: {
  clientId: string; category: BrandAssetCategory; assetId: string;
  filename: string; contentType: string;
}): Promise<SignedUploadResult>;
```

The `assetId` is minted client-side before signing and reused as the row id at finalize, so
the storage path and the row always agree and a failed finalize leaves an orphan blob that
is trivially attributable.

**Extensions.** Reuse `LOGO_EXTENSIONS` from `src/lib/clients/constants.ts` — it already
allows `svg` and `gif` beyond the standard image set, which is right for logos. Backgrounds
and products accept the same set; a narrower set for those would be an arbitrary
restriction with no benefit.

## 5. API surface

All under `src/app/api/clients/[id]/brand-kit/`, all wrapped in `withClient`, all returning
through `apiOk` / `apiError` (docs/api-routes.md).

| Route | Method | Returns / does |
|---|---|---|
| `/brand-kit` | GET | `{ assets: BrandAsset[]; details: BrandDetails; colours: string[] }` |
| `/brand-kit/assets/sign` | POST | `{ signedUrl, path, url, assetId }` after validating extension |
| `/brand-kit/assets` | POST | Inserts the row after the browser's upload succeeds |
| `/brand-kit/assets/[assetId]` | DELETE | Verifies the asset belongs to this client, removes the blob best-effort, then the row |
| `/brand-kit/details` | PATCH | Merges the given keys into `brand_details` |

**One GET, not three.** The panel needs assets, details and colours together and renders
nothing useful without all three; three round trips would mean three loading states for one
panel.

**PATCH merges rather than replaces** so two fields edited in quick succession cannot clobber
each other — the panel debounces per field and sends only what changed.

### 5.1 Colours

Derived, not stored. The active KB's `colour_palette_primary` and `colour_palette_secondary`
hold prose strings — `"turmeric gold #C8A000"`, `"off-white"`. A pure helper extracts the
usable ones:

```ts
// src/lib/post/brand-colours.ts
/** Pull 3- or 6-digit hex codes out of the KB's prose colour strings, in order, deduped.
 *  Strings with no hex (e.g. "off-white") yield nothing — a swatch needs a real value. */
export function extractHexes(entries: string[]): string[];
```

Normalizes to lowercase 6-digit `#rrggbb` so the inspector's "is this swatch active"
comparison works against layer colours, which are stored that way.

## 6. Reaching the client from the editor

`PostFocusView` knows its `nodeId` and nothing else. The canvas page already has `clientId`
and passes it into `Canvas`.

Add `src/components/canvas/client-id-context.tsx`, a direct mirror of the existing
`canvas-id-context.tsx` (`createContext<string>("")` + a provider + a `useClientId()` hook).
Provide it where `CanvasIdProvider` is already provided. `PostFocusView` reads it.

Prop-drilling it through Canvas → nodes → PostNode → PostFocusView would touch five
components that have no interest in the value, which the component guide forbids.

## 7. The panel

`PostPanelBrand` replaces `PostBrandTabStub`, rendered in the existing `PostToolPanel`
shell so it inherits one width, one scroll behaviour, one header (D116).

Five sections, in this order:

1. **Colours** — a swatch row from §5.1. Clicking one recolours the selected layer: `color`
   for text and icons, `fill` for shapes. With nothing selected the swatches are disabled
   with a one-line hint, rather than hidden — a disappearing section reads as a bug.
2. **Logos** — a 3-up grid of thumbnails on a chequerboard tile (logos are usually
   transparent PNGs; on white they look like nothing). Plus an upload tile.
3. **Backgrounds** — a 2-up grid at the post's aspect ratio, so the thumbnail shows what
   will actually fill the canvas. Plus an upload tile.
4. **Products** — a 3-up grid, `object-cover` thumbnails. Plus an upload tile.
5. **Details** — the seven fields from §3.2 as labelled inputs, saved debounced on blur.

Every interactive control is a shadcn primitive (CLAUDE.md). The one exception is the
hidden `<input type="file">`, already carved out for the Elements panel's upload.

**Empty states** are per-section and instructive: "No logos yet — upload one and it's
available on every canvas for this client." Not a shrug.

**Upload failures** surface through `toast.error`, matching `PostPanelElements`.

## 8. Placement rules

One exported pure function decides geometry per category, so the click path and the drop
path cannot diverge (the same rule the Elements panel already follows):

```ts
// src/lib/post/brand-placement.ts
export function brandAssetGeometry(
  category: BrandAssetCategory,
  containerW: number,
  containerH: number,
): { x?: number; y?: number; w: number; h: number };
```

| Category | Geometry | Depth |
|---|---|---|
| Logo | ~18% of canvas width, square on canvas (the `squareBox` correction), standard cascade | Top of the stack |
| Product | ~40% of canvas width, square on canvas, standard cascade | Top of the stack |
| Background | `{x:0, y:0, w:1, h:1}`, `fit:"cover"` | **Index 0** |

A logo's true aspect is not known until the bitmap loads; a square box plus the existing
"Undo stretching" control is the honest answer, and matches how uploaded images already
behave.

The `x`/`y` in the return type are optional and set **only** for backgrounds. Omitting them
for logos and products is what lets `createImageLayer`'s existing `cascadeGeometry` supply
the position on a click, and lets `addElement`'s drop path overwrite it with the cursor
point — the same split every other element kind already uses.

### 8.1 Backgrounds replace, they do not stack

An `ImageLayer` gains one optional field:

```ts
role?: "brand-background";
```

Placing a background removes any existing layer carrying that role, then inserts the new
one at index 0. Without this, clicking three backgrounds while deciding leaves two
invisible full-bleed images underneath, each one a layer the operator must find and delete.

Optional and absent by default, so every layer saved before this exists is unaffected (D10).

```ts
// src/lib/post/brand-placement.ts
/** Insert `background` at the back, replacing any previous brand background. */
export function applyBrandBackground(layers: PostLayer[], background: ImageLayer): PostLayer[];
```

## 9. Drag and drop

Reuses the payload type built for the Elements panel — one new variant:

```ts
| { kind: "brand-asset"; category: BrandAssetCategory; url: string }
```

`addElement` gains one case. Logos and products land centred on the drop point like every
other element; **a background ignores the drop point** and goes full-bleed at the back,
because there is no meaningful "where" for something that fills the canvas.

## 10. Error handling

| Failure | Behaviour |
|---|---|
| GET `/brand-kit` fails | Panel shows a retry line. The rest of the editor is unaffected. |
| Signing rejects the extension | `toast.error` naming the allowed set, from the shared constant. |
| Direct GCS PUT fails | `toast.error`; no row is written, so nothing half-exists in the panel. |
| Finalize fails after a successful PUT | `toast.error`; the blob is orphaned but attributable by its path. Accepted — matches the existing logo flow. |
| DELETE names an asset belonging to another client | 404, before any blob is touched. Mirrors `deleteBrandImageAction`, which checks `client_id` on the fetched row precisely because `withClient` authorises the *client*, not the *asset id* in the path. |
| Blob removal fails during DELETE | Swallowed; the row is still deleted. Best-effort, matching `deleteBrandImageAction`. A tile that refuses to disappear because of a storage hiccup is worse than an orphaned blob. |
| DELETE fails | `toast.error`, and the tile returns rather than vanishing optimistically. |
| KB has no palette | Colours section renders its own empty state; the other four still work. |
| Client has no logo and no assets | Every section shows its empty state. Nothing errors. |

## 11. Testing

Vitest runs `environment: "node"` in this repo, so `.tsx` is never unit-tested — components
are verified by `tsc` and by hand. The genuinely testable units:

| Unit | Cases |
|---|---|
| `extractHexes` | 3- and 6-digit hex, prose with no hex, duplicates, casing, order preserved, empty input |
| `brandAssetGeometry` | Each category; square-on-canvas across portrait/square/landscape formats |
| `applyBrandBackground` | Inserts at 0; replaces an existing brand background; leaves a non-brand image at 0 alone; empty layer list |
| `pathForBrandAsset` | Path shape per category; filename sanitisation via `buildStoredName` |

Route handlers follow the existing pattern and are covered by the same helpers
(`withClient`, extension validation) that are already tested.

## 12. What follows this

The **Components panel** — 10–15 real, visually finished header / footer / title blocks
that drop in as ordinary editable layers. It depends on this spec because a contact footer
is only worth having when it fills itself with the client's real phone, address and
handles. It has no backend of its own and gets its own spec and plan.

## 13. File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0027_brand_kit.sql` | Table, index, RLS, `brand_details` column |
| `src/lib/post/brand-colours.ts` (+ test) | `extractHexes` |
| `src/lib/post/brand-placement.ts` (+ test) | `brandAssetGeometry`, `applyBrandBackground` |
| `src/lib/brand-kit/types.ts` | `BrandAsset`, `BrandAssetCategory`, `BrandDetails` |
| `src/lib/storage/paths.ts` | `pathForBrandAsset` (append) |
| `src/lib/storage/index.ts` | `signClientBrandAssetUpload` (append) |
| `src/lib/db/brand-kit.ts` | Row access, mirroring `src/lib/db/kb.ts`. Routes call this, never Supabase directly |
| `src/app/api/clients/[id]/brand-kit/**` | The five routes in §5 |
| `src/services/brand-kit.service.ts` | Browser-side fetch/upload/delete, mirroring `file-node.service.ts` |
| `src/hooks/use-brand-kit.ts` | Panel state: load, upload, delete, patch details |
| `src/components/canvas/client-id-context.tsx` | `useClientId()` |
| `src/components/nodes/post-panel-brand.tsx` | The panel shell + the five sections |
| `src/components/nodes/post-brand-*.tsx` | One file per section, if any exceeds ~150 lines |
| `src/lib/post/element-drag.ts` | The `brand-asset` payload variant (append) |
| `src/components/nodes/post-focus-view.tsx` | `addElement` case; panel wiring |
| `src/lib/post/types.ts` | `role?: "brand-background"` on `ImageLayer` |

`post-brand-tab-stub.tsx` is deleted.

## 14. Decisions to append to the ADR log (§7, D129+)

- **D129** — Brand assets get their own table, not `client_brand_images`.
- **D130** — Brand details live in a JSONB column on `clients`, not the KB.
- **D131** — `clients.logo_url` is synthesized into the panel, not migrated into a row.
- **D132** — Brand colours are derived from the KB at read time, never stored.
- **D133** — A brand background replaces the previous one, marked by `role`.
- **D134** — The Post editor reads `clientId` from context, not props.
- **D135** — Fonts are excluded from the Brand Kit; `typography_style` is prose.
