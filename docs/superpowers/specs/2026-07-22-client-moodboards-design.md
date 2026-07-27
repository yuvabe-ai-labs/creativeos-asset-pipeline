# Client Moodboards — URL-first reference boards, Gallery surface, capture extension

**Date:** 2026-07-22
**Status:** Draft design — pending user review.
**Type:** Design spec (new feature; introduces a new decision — number assigned on roadmap
append, roadmap currently at D76). **Revises the reference-clipper target model (D36).**
**Builds on:** **D13** (media in GCS, DB rows hold only paths/URLs), **D14** (auth deferred — new
endpoints are open, like the rest of the app), the existing **Gallery drawer**
(`gallery-drawer/*`, `use-gallery-drawer.ts` `handleAdd`), the **server-side remote-fetch → GCS**
pattern already used by `POST /api/nodes/[id]/file/drive`, and the **File node** + paste-image
lifecycle.

---

## 1. Problem & goal

Designers gather visual references — mostly on Pinterest — but the only way into a canvas today is
to download an image and paste it. Pinterest **cannot be embedded** in-app (its response sends
`x-frame-options: SAMEORIGIN` + CSP `frame-ancestors 'self'`, verified 2026-07-22, so every browser
refuses to frame it) and its API exposes only a user's *own* boards, not global search. So browsing
stays in the real browser; what we can fix is **the path from "found a reference" to "usable in the
canvas."**

**Goal.** A **client-level Moodboard**: a named, reusable collection of reference images ("Face
cream", "Ayurvedic hair oil", "Mother's Day") that lives under a client, is filled by a small
browser **capture extension** (and by in-app add), shows up as a **tab in the Gallery**, and lets the
designer **drag an image onto the canvas** to turn it into an ordinary File-node reference.

Moodboards are **client-level** (like the Brand KB and Drive references, PRD §6) — one "Face cream"
board is reused across every reel for that client, not rebuilt per canvas.

## 2. Scope — the quickest testable version (v1)

v1 is deliberately the **smallest build that validates the loop** *(browse → collect into a board →
pull into the canvas)*. The guiding storage decision:

> **Store the image URL, not the bytes.** A moodboard item is a row holding the source image URL +
> its provenance page URL. Nothing is fetched or stored server-side at add time. The board renders by
> **hotlinking** those URLs. **Full-res bytes are re-hosted to GCS only when an item is actually
> *used*** — i.e. dragged onto the canvas to become a File node (the moment durability matters:
> the image now feeds generation and lands in the archive bundle, PRD §16).

Why URL-first (not "store in GCS now, purge later"): it is the least code (insert a row; hotlink to
display), zero storage during the test, and the re-host-on-use path already exists in spirit
(`/file/drive`). "Store everything now, purge later" is *more* work on both ends and buys nothing for
vector search — vector search needs small **embeddings**, not hoarded full images (see §7). Matches
the PRD's own discipline (§18 parks Vector/RAG; F6 treats semantic search as a later layer).

**Two build slices** (both v1; A lands first and de-risks B):

- **Slice A — in-app core (no extension needed to test):** the two tables, their queries, the CRUD
  routes, the Gallery **Moodboards** tab, an **add-by-URL** input, and **drag-to-canvas re-host**.
  Fully exercisable by pasting a Pinterest image URL into a board.
- **Slice B — capture ergonomics:** the MV3 extension (right-click any image → send to a chosen
  board), removing the manual paste.

**Explicitly deferred (each a clean, non-breaking later increment — see §7/§8):** thumbnail caching,
embeddings / shot-aware vector search (F6), add-time re-hosting, dedup, endpoint auth, board sharing.

## 3. User flow

1. **Create a board** — in the Gallery's Moodboards tab (or inline from the extension): name it,
   scoped to the current client.
2. **Collect** — while browsing Pinterest (or any site), right-click an image → **"Add to
   moodboard"** → pick the target board (remembered between adds). The extension POSTs the image URL
   + page URL; a row is created. *(Slice A stand-in: paste the image URL into the board in-app.)*
3. **Review** — open Gallery → **Moodboards** → a board → a thumbnail grid of its items (hotlinked),
   each with its source page and a remove button.
4. **Use** — drag an item onto the canvas (or select → **Add**). *Now* the image is re-hosted to GCS
   and becomes a **File node** reference, wired exactly like any other gallery add (optionally
   connected to a target node).
5. **Arrange** — drag connections from the new File node(s) to Prompt / Shot / Image Gen inputs, as
   with any reference (PRD §10; image-grounds the Shot Composer, D28).

## 4. Data model

Two new Postgres (Supabase) tables. **URLs only — no bytes, no thumbnail, no embedding in v1.**

```
moodboards
- id           uuid  pk
- client_id    uuid  fk → clients(id) on delete cascade
- name         text  not null
- created_at   timestamptz default now()

moodboard_items
- id           uuid  pk
- moodboard_id uuid  fk → moodboards(id) on delete cascade
- image_url    text  not null      -- the original image src (e.g. i.pinimg.com/…)
- source_url   text                -- provenance: the page the image was found on
- position     int   default 0     -- display order within the board
- added_at     timestamptz default now()
```

`thumb_url` and `embedding vector(…)` are **intentionally absent**; adding nullable columns later is a
one-line `ALTER TABLE` (§7), so v1 does not pre-build them.

## 5. Architecture

### 5.1 DB queries — `src/lib/db/moodboards.ts`

Thin, typed query helpers (mirroring `src/lib/db/*` style): `listMoodboards(clientId)`,
`createMoodboard(clientId, name)`, `deleteMoodboard(id)`, `listItems(moodboardId)`,
`addItem(moodboardId, { imageUrl, sourceUrl })`, `removeItem(itemId)`, and — for the extension
picker — `listClientsWithMoodboards()` (clients joined to their boards).

### 5.2 API routes

Follow `docs/api-routes.md` (`apiOk`/`apiError`, `withClient` under `/api/clients/[id]/`,
`withTryCatch` for multi-step/remote work). D14 posture: routes the extension calls are **open**.

| Route | Auth wrapper | Purpose |
| :---- | :---- | :---- |
| `GET  /api/clients/[id]/moodboards` | `withClient` | list a client's boards (Gallery) |
| `POST /api/clients/[id]/moodboards` | `withClient` | create a board (Gallery) `{ name }` |
| `DELETE /api/moodboards/[id]` | open | delete a board |
| `GET  /api/moodboards/[id]/items` | open | list a board's items (Gallery + extension) |
| `POST /api/moodboards/[id]/items` | open | add an item `{ imageUrl, sourceUrl }` — **inserts a row; fetches nothing** |
| `DELETE /api/moodboards/[id]/items/[itemId]` | open | remove an item |
| `GET  /api/moodboards` | open | index: clients + their boards, for the extension picker |
| `POST /api/nodes/[id]/file/from-url` | open | **re-host on use** (§5.4) |

### 5.3 Gallery surface

Reuse the existing drawer wholesale. The tab set becomes **References · Assets · Moodboards**
(extend `GalleryTabs`). The Moodboards tab is a **two-level folder drill-down**, mirroring how the
References tab already drills into Drive folders:

- **Board list** — the client's boards as folder tiles (reuse `GalleryFolderTile` + the breadcrumb).
- **Board contents** — the board's items in the existing grid/list with the existing selection + Add
  affordances. An **add-by-URL** field sits in the toolbar (Slice A's input path).

Selecting items and clicking **Add** (or dragging onto the canvas) routes through the existing
`use-gallery-drawer.ts` `handleAdd`. We add one branch to it, parallel to the current Drive branch:
an item with `source: "moodboard"` creates the File node with `uploading: true` and kicks off the
**from-url import** (§5.4) — exactly the shape the `source: "drive"` path already uses
(`importDriveFile` with backoff). `GalleryImage` gains `source: "moodboard"` + the `sourceUrl`.

### 5.4 Re-host on use — `POST /api/nodes/[id]/file/from-url`

A near-clone of the existing `POST /api/nodes/[id]/file/drive` route, which already does
*server-side fetch of a remote asset → GCS → return metadata*. (Server-side is required: the browser
cannot `fetch()` `i.pinimg.com` bytes from app JS — cross-origin — but a server route can.)

Body `{ imageUrl, sourceUrl? }`. Handler (`withTryCatch`):
1. `resolveOwnership(nodeId)` (same as the drive/file routes) so the GCS path can be built.
2. Server-side `fetch(imageUrl)` → `Buffer`; derive `contentType`/extension.
3. Validate: `validateFileExtension(ext, FILE_NODE_IMAGE_EXTENSIONS)` +
   `validateFileSize(bytes, 0, FILE_NODE_IMAGE_SIZE_LIMIT, "10 MB")` (shared validators).
4. `uploadNodeFile({ nodeId, filename, body, contentType })` → `{ url }` in GCS.
5. `sharp(buffer).metadata()` → `imageWidth`/`imageHeight` (best-effort, like `/file`), so the File
   node shows pixel dimensions immediately.
6. Update the node row: `data.fileUrl = url`, `fileKind: "image"`, `filename`, `sourceUrl`,
   `imageWidth`, `imageHeight`, `uploading: false`.
7. `apiOk({ fileUrl, imageWidth, imageHeight })`.

Client side: `fileNodeService.pickFromUrl(nodeId, { imageUrl, sourceUrl })` mirrors `pickFromDrive`;
`use-gallery-drawer` calls it with the same retry/backoff wrapper as the Drive import.

### 5.5 Capture extension (Slice B) — `moodboard-extension/` (MV3)

A small, isolated Chrome extension (no build step; loaded unpacked), **not** the D36 clipper and not
wired to it.

```
moodboard-extension/
  manifest.json   MV3; permissions: contextMenus, storage, sidePanel
                  host_permissions: <the app origin>  (POST to the app)
  background.js   context menu "Add to moodboard" (contexts: ["image"])
  sidepanel.html/js/css  the board picker + status
  config.js       APP_BASE_URL constant (deployed app URL; localhost in dev)
```

- **Pick a target** — the side panel fetches `GET {APP_BASE_URL}/api/moodboards` and shows a
  **client → board** picker, plus inline **"New board."** The selected board id is remembered in
  `chrome.storage.local`.
- **Collect** — right-click image → the worker captures `{ srcUrl, pageUrl }` and POSTs
  `{ imageUrl: srcUrl, sourceUrl: pageUrl }` to `/api/moodboards/{rememberedBoardId}/items`; shows a
  success/error toast. A background worker with `host_permissions` is CORS-exempt, so the cross-origin
  POST just works.
- **URL-only** — the extension sends URLs only; no bytes, no thumbnails. Consistent with §2.

## 6. Storage lifecycle & the URL-only decision

| Stage | Where it lives | Cost |
| :---- | :---- | :---- |
| Collected | `moodboard_items` row (URLs only) | one small DB row |
| Displayed | hotlinked `<img src={image_url}>` | none |
| **Used** (drag → File node) | normal File node: `nodes` row + **one GCS object** (re-hosted full-res) | one image in GCS, at use time |
| Item removed | row deleted | none |

**Accepted caveat — link rot.** A Pinterest CDN URL can rotate/expire, so a long-idle board can show
a broken tile, and a drag-to-use can fail if the URL died first. This is acceptable for the
"gather-then-use-soon" test horizon (weeks+); the mitigation (add-time thumbnail cache) is the first
deferred increment (§7), not v1. On a failed re-host, the File node surfaces the existing
`uploadError` state and the user can re-add.

## 7. Forward-compatibility — thumbnails & vector search (F6), deferred

The URL-first model is a **strict subset** of the durable model; upgrading is additive, no migration
of existing behavior:

- **Thumbnail cache** — add a nullable `thumb_url`; on `POST …/items`, fetch the image once,
  `sharp`-resize to a small thumb, store to GCS, render tiles from `thumb_url`. Fixes link-rot
  *display*.
- **Embeddings / shot→reference vector search (PRD F6)** — **CLIP is the right model here**: it is a
  *joint text–image space*, so a shot's visual description (CLIP **text** encoder) retrieves moodboard
  images (CLIP **image** encoder) by cosine similarity — exactly the "find references for this shot"
  query. Readiness:
  - Add a nullable **`embedding vector(D)`** (`pgvector`, native to Supabase) with **D pinned to the
    chosen CLIP variant** (512 for ViT-B/32, 768 for ViT-L/14 — both well under pgvector's ~2000-dim
    index limit), plus **`embedding_model`** + **`embedded_at`** columns so a model swap is a
    *versioned re-embed*, not a stuck column. Search with cosine distance (`<=>`) + an HNSW index.
  - **Compute the embedding at _add_ time** from a single fetch of the image (self-hosted OpenCLIP or
    a hosted CLIP endpoint — note OpenAI embeddings are text-only, so this is Vertex multimodal /
    Replicate / HF / self-host: an F6 infra choice, not v1's). **The durable artifact is the vector
    (~1–3 KB), *not* the bytes** — which is the whole reason v1 need not hoard full images.
  - **Caveat (the one real limit of URL-first):** an item can only be embedded while its source URL is
    live. So when F6 lands, embed **going forward**; items collected during the URL-only window whose
    URLs have since rotted are *not* back-embeddable. Zero-loss mitigation: flip on the **add-time
    thumbnail capture** (above) *before* the URL-only backlog grows — every item then has a durable
    local copy to embed from later.

Both are pure `ALTER TABLE … ADD COLUMN` + new write-path code; nothing in v1 blocks them, and v1
stores nothing that would have to be thrown away or migrated.

## 8. Non-goals (each a clean later increment)

- **Thumbnail caching / embeddings / vector search** — deferred (§7).
- **Add-time re-hosting** — v1 re-hosts only on use.
- **Embedding/iframing Pinterest** — infeasible (§1); not attempted.
- **Integrating the D36 reference-clipper** — explicitly out; the moodboard has its own capture
  extension and its own target model (this spec *revises* D36's active-tab-push target).
- **Dedup** — adding the same image twice makes two items.
- **Auth on the open endpoints** — matches D14; a shared secret is easy later hardening.
- **Board sharing across clients**, reordering/curation beyond add/remove, and **auto/shot-aware
  suggestions** (the query is typed/collected by the designer in v1).

## 9. Testing

Repo convention: node-env vitest over pure `src/lib/**` + route handlers; UI verified by running the
app.

- **Route:** create board / add item / list / remove (happy paths, `withClient` + open); `from-url`
  ingest — creates node file + sets `fileUrl` (happy), 404 on bad node, rejects non-image / oversize
  via the shared validators, handles a dead source URL gracefully (returns an error the client shows).
- **Query unit:** `listClientsWithMoodboards` shape; item ordering by `position`/`added_at`.
- **Manual (extension):** pick a board → right-click an image on Pinterest + a normal site → item
  appears in the Gallery board → drag to canvas → File node with a **GCS-hosted** image and pixel
  dimensions; remove item; add-by-URL in-app (Slice A) → same result without the extension.

## 10. Implementation surface

**New:**
- Migration: `moodboards`, `moodboard_items` tables.
- `src/lib/db/moodboards.ts` — queries.
- `src/app/api/clients/[id]/moodboards/route.ts` — GET/POST (withClient).
- `src/app/api/moodboards/route.ts` — GET index (open).
- `src/app/api/moodboards/[id]/route.ts` — DELETE (open).
- `src/app/api/moodboards/[id]/items/route.ts` — GET/POST (open).
- `src/app/api/moodboards/[id]/items/[itemId]/route.ts` — DELETE (open).
- `src/app/api/nodes/[id]/file/from-url/route.ts` — re-host on use.
- Gallery: a Moodboards tab + board-list/board-contents views + an add-by-URL field + a
  `use-moodboards` fetch hook (reusing `GalleryFolderTile`, breadcrumb, grid/list, selection).
- `moodboard-extension/` — MV3 extension (Slice B).

**Changed (small, additive):**
- `gallery-tabs.tsx` — add the Moodboards tab.
- `use-gallery-drawer.ts` — a `source: "moodboard"` branch in `handleAdd` (parallel to Drive).
- `gallery-drawer/types.ts` — `GalleryImage.source` gains `"moodboard"` + `sourceUrl`.
- `file-node.service.ts` — `pickFromUrl` (mirrors `pickFromDrive`).

## 11. Decision (to append to roadmap §7 on approval)

**Decision:** Client-level **Moodboards** — named reference collections owned by a client, filled by a
capture extension (and in-app add), surfaced as a Gallery tab, and **stored URL-first**: an item is a
row holding the image + provenance URLs; full bytes are re-hosted to GCS **only when the item is
dragged onto the canvas** as a File node.
**Why:** URL-first is the least code and zero storage to validate the browse→collect→use loop;
re-host-on-use puts durable storage exactly where it matters (generation + archive); the design is a
strict subset of the durable/semantic model, so thumbnails (link-rot insurance) and embeddings
(F6 shot→reference search) are additive later — no migration, no hoarded bytes.
**Revises:** **D36** (reference-clipper) — the capture target moves from "push to the active canvas
tab as File nodes" to "add to a chosen client moodboard (staging); moodboard→canvas is a separate,
re-hosting drag."
**Rejected:** (a) embed/iframe Pinterest — browser-blocked (§1); (b) store full bytes at add time,
purge later — more work at both ends, and vector search needs embeddings not stored images (§7);
(c) URL-only File *nodes* on the canvas — link rot on a live reference that feeds generation/archive
(re-host on use instead).
