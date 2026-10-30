# Script products and locations — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A script holds its own Products (named, with a main packshot plus angles) and Locations (named, described, with a background plate), each shot picks which products and which location it uses, the copilot fills them in, and the script page edits them, including generating a location plate.

**Architecture:** The data lives in the script doc (`client_scripts.doc`, validated by `scriptDocSchema`) with `.default([])` so every stored doc still parses. Pure functions in a new `src/lib/scripts/assets.ts` own every change to products, locations and picks; the copilot's ops call the same functions, and one stage-aware DB write (`changeScriptAssets`) applies them at Generate (through `changeGenerateScript`, D337) or at Visualise / In review (compare-and-set on `updated_at`, like `setCastAvatar`, D338). The script view gains a Products & Locations section and per-shot picks, read-only unless an assets context is provided (Generate, Visualise), so the review page shows them for free.

**Tech Stack:** zod, Next.js route handlers, Supabase, GCS storage, TanStack Query, shadcn (Base UI), Vitest.

**Spec:** [2026-10-30-script-products-and-locations-design.md](../specs/2026-10-30-script-products-and-locations-design.md) §3, §4.

## Global Constraints

- Every stored script must still parse: new doc fields use `.default(...)`.
- Caps: 8 products, 6 images per product, 6 locations.
- The copilot never sets images; images come only from upload, a library pick or plate generation.
- Shadcn primitives only, Lucide icons at 1.5 stroke, colours through CSS variables, plain user-facing copy with no vendor names and no em-dash phrasing.
- API routes: `withClient`, `withTryCatch`, `apiOk` / `apiError`, `parseFormFile` / `validateFileExtension` / `validateFileSize` for uploads.
- Browser data through TanStack Query: service → query file → consumers.
- Run tests per file or directory.
- Commits carry no AI attribution.
- Out of scope for phase 1: storyboard panels using the assets (phase 2), canvas nodes (phase 3), generated canvas images in the library picker (they are canvas-scoped; brand kit and KB images only here).

---

### Task 1: Doc schema

**Files:** Modify `src/lib/scripts/schema.ts`; Test `src/lib/scripts/__tests__/schema-assets.test.ts`

**Produces:** `scriptImageSchema`, `productSchema`, `locationSchema`; types `ScriptImage`, `Product`, `ScriptLocation`; `ScriptDoc.products`, `ScriptDoc.locations`; `Shot.products: string[]`, `Shot.location: string | null`; exported caps `MAX_PRODUCTS = 8`, `MAX_PRODUCT_IMAGES = 6`, `MAX_LOCATIONS = 6`.

- [ ] Tests: a doc without the new keys parses with `products: []`, `locations: []`, each shot `products: []`, `location: null`; unknown product / location ids in a shot are rejected with a message naming them; duplicate product ids rejected; caps enforced; an image needs a URL and a known source.
- [ ] Implement per spec §3 (superRefine additions beside the cast checks).
- [ ] `npx vitest run src/lib/scripts` — the existing script tests (fixtures without the keys) must still pass.
- [ ] Commit `feat(scripts): products and locations in the script doc (D446)`.

### Task 2: Pure asset operations

**Files:** Create `src/lib/scripts/assets.ts`; Test `src/lib/scripts/__tests__/assets.test.ts`

**Produces:**

```ts
export type AssetOp =
  | { op: "add_product"; name: string }
  | { op: "rename_product"; productId: string; name: string }
  | { op: "remove_product"; productId: string }
  | { op: "set_product_images"; productId: string; images: ScriptImage[] }
  | { op: "add_location"; name: string; description: string }
  | { op: "update_location"; locationId: string; name: string; description: string }
  | { op: "remove_location"; locationId: string }
  | { op: "set_location_image"; locationId: string; image: ScriptImage | null }
  | { op: "set_shot_assets"; shotId: string; products: string[]; location: string | null };
export function applyAssetOp(doc: ScriptDoc, op: AssetOp): { ok: true; doc: ScriptDoc; touchedShotIds: string[] } | { ok: false; error: string };
export function assetIdFor(name: string, taken: Set<string>): string; // reuses castIdFor's slug rule
```

- [ ] Tests: add creates a slug id unique across products; rename keeps the id; `remove_product` strips it from every shot's `products` and reports those shots touched; `remove_location` clears it from every shot; `set_product_images` replaces the list (order kept, capped, duplicates by URL dropped); `set_shot_assets` dedupes and rejects unknown ids; every result re-validated with `scriptDocSchema`.
- [ ] Implement; `castIdFor` from `copilot/draft.ts` is reused for ids.
- [ ] Run, commit `feat(scripts): pure product and location operations (D446)`.

### Task 3: The copilot reads and writes them

**Files:** Modify `src/lib/scripts/copilot/output.ts`, `draft.ts`, `ops.ts`, `import.ts`, `src/prompts/script-copilot.ts`; Tests in `src/lib/scripts/copilot/__tests__/` and `src/prompts/__tests__/script-copilot.test.ts`

**Produces:**
- `shotFieldsSchema` gains `products: string[]` and `location: string` ("" = none).
- `draftOutputSchema` and `importOutputSchema` gain `products: {key,name}[]` and `locations: {key,name,description}[]`.
- `EDIT_OPS` gains `add_product`, `update_product`, `remove_product`, `add_location`, `update_location`, `remove_location`; the flat op gains `product: {productId, name} | null` and `location: {locationId, name, description} | null`. Each maps onto `applyAssetOp`.
- `toShot(id, fields, resolve, resolveAsset)` resolves product and location keys/ids/names; unknown ones dropped (repair, not reject, as for cast).
- `toScriptDoc` builds `products` / `locations` with ids from names.
- Import adds the products and locations it read, and one item to confirm per product and location ("Check the products and locations read from the paste") (D370).
- Prompt `script-copilot` version 5: draft and import tasks describe `products`, `locations` and each shot's keys; the edit task lists the new ops and that a shot's `products` / `location` use their ids; a rule that the copilot never sets images.

- [ ] Tests: draft with two products and one location resolves keys to ids on shots; a shot naming an unknown product drops it; edit ops via `applyOps`; import creates them and the confirm item; prompt text mentions each op; version 5.
- [ ] Implement, run `npx vitest run src/lib/scripts src/prompts/__tests__/script-copilot.test.ts`, commit `feat(copilot): the copilot names products and locations and sets each shot's picks (D447)`.

### Task 4: Stage-aware write and routes

**Files:** Create `src/lib/db/script-assets.ts`; Create routes `src/app/api/clients/[id]/scripts/[scriptId]/assets/route.ts` (POST an `AssetOp`), `.../assets/upload/route.ts` (POST multipart, returns `{ image }`); Modify `src/lib/storage/index.ts` (`uploadScriptAsset`); Tests beside each route and `src/lib/db/__tests__/script-assets.test.ts`

**Produces:**
- `changeScriptAssets(clientId, scriptId, op): Promise<{ ok: true; script: Script } | { ok: false; error: string; status: number }>` — Generate stage: `changeGenerateScript` with `applyAssetOp`; Visualise / In review: read, `applyAssetOp`, update on `updated_at`, retry once; Final or other stages: 409.
- `uploadScriptAsset({ clientId, scriptId, kind: "products" | "locations", ext, body, contentType })` → `clients/{c}/scripts/{s}/{kind}/{uuid}.{ext}`.
- POST `/assets` body validated by a zod union mirroring `AssetOp`; a picked library image URL must belong to this client (brand-kit asset or KB image row) — performance/safety rule 14.
- POST `/assets/upload` uses `parseFormFile`, `validateFileExtension` (png/jpg/jpeg/webp), `validateFileSize` (the existing image limit), stores, returns `{ image: { url, source: "upload" } }`.

- [ ] Tests: each stage path; 409 outside Generate/Visualise/In review; a foreign library URL refused; upload validates type and size.
- [ ] Implement, run, commit `feat(scripts): change products and locations at Generate and Visualise (D446)`.

### Task 5: Generate a location plate

**Files:** Create `src/prompts/location-plate.ts`, route `src/app/api/clients/[id]/scripts/[scriptId]/locations/[locationId]/plate/route.ts`; Tests for both

**Produces:** `locationPlatePrompt({ location, doc, kit }): string`; POST plate → `runBilledImageGeneration({ owner: { scriptId }, modelId: PANEL_MODEL_ID, aspect: panelAspect(doc), referenceUrls: [], store: uploadScriptAsset(kind "locations") })` then `changeScriptAssets(set_location_image, { url, source: "plate" })`; `maxDuration = 300`; 402 on the credit limit with `CREDIT_LIMIT_TOAST_MESSAGE`, 502 otherwise.

Prompt text (exact):

```
An empty location plate for a short video: {location.name}. {location.description}
The reel's setting: {doc.context.settingAndCamera}
{kit line when a regional kit matches}
Show only the place, as an empty set ready for filming: no people, no hands, no products, no packaging, no text, signs or logos. Eye level, the whole space readable, natural light as described. Aspect {aspect}.
```

- [ ] Tests: prompt contains the description and setting and the no-people line, omits an empty setting; route bills to the script, stores and writes the image; refuses a location that does not exist; stage check as Task 4.
- [ ] Implement, run, commit `feat(scripts): generate a location plate (D448)`.

### Task 6: Service, queries and the script page

**Files:**
- Create `src/services/script-assets.service.ts` (`applyOp`, `upload`, `generatePlate`), `src/hooks/queries/script-assets.ts` (`useScriptAssetOp`, `useUploadScriptImage`, `useGeneratePlate`, each updating the Generate state or Visualise board cache they change, via `scriptGenerateKeys` / `visualiseKeys`).
- Create `src/components/scripts/script-assets-context.tsx` (provider + `useScriptAssets()`; null = read-only), `script-assets-section.tsx` (Products and Locations lists), `script-product-card.tsx`, `script-location-card.tsx`, `script-image-picker.tsx` (Dialog with Upload and Library tabs; Library = brand-kit product/background assets via `useBrandKit` and KB images via `useImportedAssets` filtered to images), `script-shot-assets.tsx` (per-shot pickers, or a read-only line).
- Modify `src/components/scripts/script-view.tsx` (render the section after the cast; an `assets` prop like `cast`), `script-shot-row.tsx` (the picks line under "who"), `generate/generate-script-pane.tsx` and `visualise/visualise-view.tsx` (provide the context).

UI rules: product card = name (inline editable), main packshot thumbnail with the angle count, "Add images" chip (dashed primary), drag-free reorder with "Make main" and remove per image; location card = name, description (inline editable), plate thumbnail, "Generate" and "Add image"; a missing picture reads "Needs a picture". Shot picks: a multi-select of products and a select of the location ("No location"). Read-only: "Products: Jackfruit365 pouch · Location: Podcast set".

- [ ] Tests: section read-only render (no controls without the provider); picks line; picker lists brand-kit and KB images; service URLs.
- [ ] Implement, run `npx vitest run src/components/scripts src/components/visualise src/hooks/queries`, typecheck, lint, commit `feat(scripts): products and locations on the script page (D446, D448)`.

### Task 7: Records

- [ ] Append D446, D447, D448 to the roadmap §7.
- [ ] Commit `docs(adr): D446-D448 script products and locations`.
