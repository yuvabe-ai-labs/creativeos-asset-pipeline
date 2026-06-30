# Storage backend swap — Supabase Storage → Google Cloud Storage

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan
**Surface:** new `src/lib/storage/`; 7 existing routes (file/image-gen/video-gen/kb/logo/brand-image); `src/lib/generations/complete.ts`; `src/lib/actions/kb.ts`

## Problem

Supabase's free tier caps storage at **1 GB**. Every File node, Image-Gen output, Video-Gen output, KB document, brand image, and client logo currently uploads to Supabase Storage, so we will hit the cap quickly. The user has a GCP plan available and wants to move **storage only** off Supabase. Supabase Postgres + Auth stay.

Per user direction: **no migration of existing assets**. Old `supabase.co/...` URLs in the DB keep working (Supabase bucket stays public); only **new uploads** go to GCS.

A second, related issue: today's Supabase bucket layout is flat per asset kind (`node-files/{nodeId}/...`, `image-gen/{nodeId}/...`, `video-gen/{nodeId}/...`). That layout was inherited mechanically and **drops the owning client/canvas from the path**, so we can't list/audit/bulk-delete assets per client or per canvas from the bucket alone. Since every node already has `canvas_id` (NOT NULL FK) and every canvas has `client_id` (NOT NULL FK), the new GCS layout reorganizes around ownership.

## Key existing facts (why this is small)

- All storage calls in the codebase go through a small set of methods: `.storage.from(bucket).upload()`, `.getPublicUrl()`, `.remove()`. There are **7 call sites** total (six API routes + one webhook completion path) plus a deletion server action. Each one is a mechanical swap to a wrapper function.
- DB columns that hold storage URLs (`clients.logo_url`, `client_kb_documents.storage_url`, `client_brand_images.storage_url`, `nodes.data.fileUrl`, `node_versions.output`) are plain `text`. They can hold either a `supabase.co/...` URL (old) or a `storage.googleapis.com/...` URL (new) — **no schema migration**.
- `nodes.canvas_id` and `canvases.client_id` are both `NOT NULL` (`supabase/migrations/0001_init.sql:32, :20`), so `clientId`/`canvasId` are always resolvable from `nodeId` via one JOIN.
- Route conventions are already established: `src/lib/api/route-helpers.ts` (`apiError`, `apiOk`, `withClient`, `withTryCatch`, `parseFormFile`, `validateFileExtension`, `validateFileSize`) — the route bodies barely change, only the storage call inside them.

## Design

### 1. GCP setup (operator task — done in console)

**Single bucket, prefix-organized.** Multiple buckets were chosen in Supabase for dashboard organization, not security (every Supabase bucket here is public-by-URL today). GCS does organization with prefixes inside one bucket and avoids per-bucket IAM/CORS/lifecycle duplication.

1. **Project:** `creativeos` (or existing).
2. **Bucket:** `creativeos-assets` — region `asia-south1`, Standard class, Uniform access.
3. **Public-read:** Grant `allUsers` the role `Storage Object Viewer` on the bucket.
4. **Service account:** `creativeos-storage`, role `Storage Object Admin`. Download a JSON key.
5. **Env vars** (added to `.env`, and to Vercel env for prod):
   ```
   GCP_PROJECT_ID=creativeos
   GCS_BUCKET=creativeos-assets
   GCP_SERVICE_ACCOUNT_KEY_BASE64=<base64 of the JSON key>
   ```
   Base64 keeps the JSON survivable on a single `.env` line and in Vercel env.
   Local dev may alternatively set `GOOGLE_APPLICATION_CREDENTIALS=./creds.json` (gitignored) — wrapper supports both.
6. **Optional:** Lifecycle rule deletes objects under `tmp/` after 1 day.

### 2. Path scheme — organized by ownership

```
clients/{clientId}/logo/{name}
clients/{clientId}/brand-images/{imageId}/{name}
clients/{clientId}/kb-documents/{docId}/{name}
clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/files/{name}
clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/image-gen/{name}
clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/video-gen/{name}
```

Operational wins this unlocks:

| Operation | Command |
|---|---|
| List everything for a client | `gsutil ls -r gs://creativeos-assets/clients/{id}/` |
| Storage usage per client | `gsutil du -s gs://creativeos-assets/clients/{id}` |
| Wipe a canvas's assets on delete | `gsutil -m rm -r gs://creativeos-assets/clients/{cid}/canvases/{id}/` |

### 3. Filename strategy — `{slug}__{YYYY-MM-DDTHH-MM-SS-mmm}Z.{ext}`

- `slug` = sanitized original filename stem (lowercase, spaces → `-`, strip path separators and disallowed chars, max 60 chars).
- Timestamp is **UTC** with milliseconds; collision-proof in practice, lexicographically sortable (`gsutil ls` shows newest at bottom).
- Double underscore `__` separator so the original name can be recovered with `name.split('__')[0]`.
- For machine-generated outputs (`image-gen`, `video-gen`) the slug is just `output` since there is no user-supplied name; the timestamp carries the identity.

Example: `My Vacation Photo.JPG` → `my-vacation-photo__2026-06-30T14-23-45-678Z.jpg`.

### 4. Wrapper API — per-kind helpers

`src/lib/storage/gcs.ts` — memoized GCS `Storage` client built from `GCP_SERVICE_ACCOUNT_KEY_BASE64` (base64 → JSON → `new Storage({ projectId, credentials })`). Falls back to `GOOGLE_APPLICATION_CREDENTIALS` if the base64 var is unset. Internal `_put(path, body, contentType)` and `_remove(path)` primitives.

`src/lib/storage/index.ts` — six exported helpers (per-kind, so TypeScript enforces exactly the IDs each kind requires). Each returns `{ url, path }` where `url` is `https://storage.googleapis.com/creativeos-assets/{path}`.

```ts
uploadNodeFile({   nodeId,  filename, body, contentType }): Promise<{ url; path }>
uploadImageGen({   nodeId,  ext,             body, contentType }): Promise<{ url; path }>
uploadVideoGen({   nodeId,  ext = 'mp4',     body, contentType }): Promise<{ url; path }>
uploadClientLogo({ clientId, filename, body, contentType }): Promise<{ url; path }>
uploadBrandImage({ clientId, imageId, filename, body, contentType }): Promise<{ url; path }>
uploadKBDocument({ clientId, docId,   filename, body, contentType }): Promise<{ url; path }>

removeObject(fullPathOrUrl: string): Promise<void>
parsePathFromUrl(url: string): string | null   // returns path within bucket, null if not a GCS URL
```

The three `node*` helpers internally call `resolveOwnership(nodeId)` (one JOIN: `select canvas_id, canvases(client_id) from nodes where id = ?`) before building the path. The route doesn't need to fetch this itself. If ownership resolution fails (node missing), the helper throws — route returns `apiError` per existing convention.

### 5. Routes to update (mechanical swap)

| File | Today | Becomes |
|---|---|---|
| `src/app/api/nodes/[id]/file/route.ts` | `supabase.storage.from('node-files').upload(...)` / `.remove(...)` | `uploadNodeFile({...})` / `removeObject(...)` |
| `src/app/api/nodes/[id]/image-generate/route.ts` | `.from('node-files').upload + getPublicUrl` | `uploadImageGen({...})` |
| `src/lib/generations/complete.ts` (video webhook) | download from provider → `.from('node-files').upload` | `uploadVideoGen({...})` |
| `src/app/api/clients/[id]/kb/documents/route.ts` | `.from('kb-documents').upload/remove` | `uploadKBDocument({...})` / `removeObject(...)` |
| `src/app/api/clients/[id]/kb/images/route.ts` | `.from('client-brand-images').upload/remove` | `uploadBrandImage({...})` / `removeObject(...)` |
| `src/app/api/clients/[id]/logo/route.ts` | `.from('client-logos').upload` | `uploadClientLogo({...})` |
| `src/lib/actions/kb.ts` | `.from(bucket).remove([path])` after parsing URL | `removeObject(...)` (wrapper handles both `supabase.co` and `storage.googleapis.com` URLs — for Supabase URLs it falls through to the existing Supabase remove path so old assets can still be deleted) |

`removeObject` accepts either a full URL or a GCS path:
- A `storage.googleapis.com/creativeos-assets/...` URL **or** a bare path → routed to GCS (`bucket.file(path).delete({ ignoreNotFound: true })`).
- A `supabase.co/...` URL → routed to Supabase Storage via the existing server client (the wrapper keeps a thin reference to the Supabase client for legacy removes only — no new dependency).
- Anything else → throws (callers see an `apiError`).

This keeps deletion working for both old and new assets without touching the call sites again.

### 6. Testing

Hybrid (decision locked):

- **Unit tests (vitest)** for the deterministic logic in `src/lib/storage/`:
  - Filename sanitization (spaces, casing, disallowed chars, length cap).
  - Timestamp suffix format.
  - Path templates for all six helpers.
  - `resolveOwnership` JOIN (mocked Supabase Postgres client).
  - `parsePathFromUrl` for GCS URLs, Supabase URLs, garbage input.
  - `@google-cloud/storage` mocked via `__mocks__/@google-cloud/storage.ts` — assert `bucket.file(path).save(body, { contentType })` is called with the expected path/contentType.
- **One manual integration smoke** — `scripts/test-gcs.ts` (run by operator after env vars are wired):
  - `uploadNodeFile` a small Buffer → `curl` the returned URL → expect 200.
  - `removeObject(url)` → re-`curl` → expect 404.
  - (And the rest of the verification list under §7.)

CI stays fast and cred-free.

### 7. End-to-end verification (manual, after merge)

1. Drop a PNG into a File node → renders from `storage.googleapis.com/creativeos-assets/...`.
2. Run an Image-Gen → `node_versions.output` holds a GCS URL → image displays.
3. Trigger a video-gen → trigger.dev webhook completes → MP4 plays from a GCS URL.
4. Upload a logo + brand image + KB doc → DB columns hold GCS URLs → previews/downloads work.
5. Delete a KB doc → object gone (`gsutil ls gs://creativeos-assets/kb-documents/...`).
6. Pre-existing node with a `supabase.co` URL still renders.

## Out of scope

- Migration of existing Supabase assets (old URLs keep resolving from Supabase).
- Signed URLs / private bucket — current Supabase behavior is public-by-URL, this preserves parity. If KB privacy becomes a need, the cleanest follow-up is a second private bucket for `kb-documents/` plus a signed-URL download endpoint.
- CDN / Cloud CDN.
- Removal of `@supabase/supabase-js` (still needed for Postgres + Auth).
- DB schema changes.
- Direct-browser-to-GCS uploads (all uploads continue through API routes, keeping the service-account key server-side).
- Removal of the old Supabase buckets in the Supabase dashboard.

## ADR entry to append

Append to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 as the next decision (e.g. **D28**):

> **D28 — Storage moves to GCS (single bucket, ownership-prefixed paths).**
> *Why:* Supabase free tier is 1 GB; CreativeOS storage growth (image/video gen + KB docs + node files) will exceed this. GCS is on the existing GCP plan.
> *Rejected:* Multi-bucket GCS (no benefit over prefixes; adds per-bucket IAM/CORS/lifecycle overhead); migration of old Supabase assets (MVP scope — old URLs continue to resolve); signed URLs / private bucket (no behavior change from Supabase today; can split later if needed).
> *Originated → spec:* `2026-06-30-gcs-storage-migration-design.md`.
