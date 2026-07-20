# Fixing Vercel's 4.5 MB upload limit — direct-to-GCS signed URLs

**Date:** 2026-07-20
**Status:** Implemented

## Problem

Uploads over 4.5 MB fail in production with `413 FUNCTION_PAYLOAD_TOO_LARGE`;
they work locally because there is no proxy limit locally.

Object storage is **Google Cloud Storage**, but every user upload flowed *through*
a Next.js API route (a Vercel Function): browser → `multipart POST` → route parses
the whole file into a `Buffer` → `_put` to GCS. Because the file bytes travel in
the function's **request body**, they hit Vercel's hard **4.5 MB** limit.

That cap is a fixed Vercel platform limit — it **cannot be raised** (Edge/streaming
does not help; the body limit still applies). The fix is to **stop routing file
bytes through the function.**

## Fix

Direct browser → GCS uploads via **V4 signed URLs**. The browser asks the function
for a short-lived signed upload URL, then `PUT`s the bytes **straight to GCS** (no
4.5 MB limit — up to 5 TB). The function only ever handles tiny JSON.

```
Before:  browser → [10MB file] → Vercel Function → GCS      ❌ 413 at the function
After:   browser → [tiny JSON] → Vercel Function → signed URL   (sign)
         browser → [10MB file] ─────────────────────────────→ GCS   ✅ bypasses Vercel
         browser → [tiny JSON] → Vercel Function → DB           (finalize)
```

## Scope — what changed

Only routes where **the user's file bytes travel in the request body** hit the cap.
**Four upload types**, hit by **4 client callers**. Each old single `POST` gained a
`sign` + `finalize` pair (the old `POST` handlers are kept, still used for text and
server-side paths).

| Upload type | New endpoints | Client caller(s) |
|---|---|---|
| Node file (image / document) | `/api/nodes/[id]/file/{sign,finalize}` | `src/services/file-node.service.ts` (used by file node UI + canvas paste) |
| KB document | `/api/clients/[id]/kb/documents/{sign,finalize}` | `kb-onboarding-upload-step.tsx`, `kb-onboarding-review-step.tsx` |
| KB / brand image | `/api/clients/[id]/kb/images/{sign,finalize}` | `kb-onboarding-upload-step.tsx`, `kb-onboarding-review-step.tsx` |
| Client logo | `/api/clients/[id]/logo/{sign,finalize}` | `new-client-dialog.tsx` |

### NOT changed — bytes never enter a request body

- `image-generate` — generated server-side.
- `video-generate` — takes **JSON**, triggers a Trigger.dev task; the task stores
  the video via `uploadVideoGen` → GCS server-side. **There is no user video upload
  in the app**, so it is unaffected regardless of size.
- `file/drive`, `webhooks/kb-build`, `ingest-image` — server fetches/generates bytes.
- Node **text** files (`.txt`, ≤100 KB): still uploaded via the old `POST /file`,
  which reads them server-side as `rawText`. Only image/document go direct-to-GCS.

## Files

### Added

- `src/lib/uploads/client.ts` — browser helper `uploadViaSignedUrl<T>(file, opts)`
  (sign → PUT → finalize) and `readImageSize(file)` (client-side `createImageBitmap`,
  replacing the server `sharp()` call). Browser-safe (no `server-only`).
- `src/lib/clients/constants.ts` — `LOGO_EXTENSIONS` (extracted; now imported by the
  old logo route + the new sign/finalize routes so validation cannot diverge).
- API routes (one `route.ts` per operation — App Router allows only one handler per
  method per path, so each new operation needs its own segment):
  - `src/app/api/nodes/[id]/file/sign/route.ts`, `.../file/finalize/route.ts`
  - `src/app/api/clients/[id]/kb/documents/sign/route.ts`, `.../finalize/route.ts`
  - `src/app/api/clients/[id]/kb/images/sign/route.ts`, `.../finalize/route.ts`
  - `src/app/api/clients/[id]/logo/sign/route.ts`, `.../finalize/route.ts`

### Modified

- `src/lib/storage/gcs.ts` — added `_signPutUrl(path, contentType, expiresMs=5min)`
  → V4 signed `write` URL.
- `src/lib/storage/index.ts` — added `SignedUploadResult` type, a private `_sign()`,
  and per-resource wrappers `signNodeFileUpload`, `signClientLogoUpload`,
  `signBrandImageUpload`, `signKBDocumentUpload` (reuse the existing `pathFor*`
  helpers + `resolveOwnership`).
- `src/lib/nodes/file-constants.ts` — added `FileNodeKind` + `fileKindForExt(ext)`
  (shared by the old route, sign, and finalize).
- `src/services/file-node.service.ts` — `upload()` routes text → old POST, and
  image/document → `uploadViaSignedUrl` (with `readImageSize` for images).
- `src/components/canvas/canvas.tsx` — paste-image now calls `fileNodeService.upload`
  instead of a raw multipart `fetch`.
- `src/components/kb/kb-onboarding-upload-step.tsx`,
  `src/components/kb/kb-onboarding-review-step.tsx` — `uploadFiles` uses
  `uploadViaSignedUrl` against `${endpoint}/sign` + `${endpoint}/finalize`.
- `src/components/clients/new-client-dialog.tsx` — logo upload uses
  `uploadViaSignedUrl` (background, non-blocking).
- `src/app/api/clients/[id]/logo/route.ts` — imports shared `LOGO_EXTENSIONS`.

## How the endpoints work (per upload type)

### `sign` (JSON → JSON)
- Accepts `{ filename, contentType, size }`.
- Runs the **same validation** the old POST did, on metadata only: extension,
  per-file + total-quota size checks, ownership (`withClient` / `resolveOwnership`).
- Builds the GCS path via the existing `pathFor*` helper and returns
  `{ signedUrl, path, url }`.

### direct PUT (browser → GCS)
- `PUT signedUrl` with header `Content-Type` **exactly** matching the signed
  `contentType` (the helper uses one value for both, so they always match).
- Requires bucket CORS to allow browser `PUT` — **already configured.**

### `finalize` (JSON → JSON)
- Accepts `{ path, filename, size, ... }`.
- **Re-derives** the public URL server-side (`publicUrlFor(path)`) — the client's
  URL is never trusted.
- **Ownership integrity:** rejects any `path` that isn't under the caller's expected
  prefix (e.g. `clients/{id}/brand-images/`), so a client can't point a record at
  someone else's object.
- Records the object:
  - KB document → `insertKBDocument` (Supabase `client_kb_documents` row).
  - KB image → `insertBrandImage` (Supabase `client_brand_images` row).
  - Logo → `updateClientLogoUrl` (Supabase `clients.logo_url`).
  - Node file → **does not** write the DB itself (matching the old POST): it returns
    the fields and the canvas **autosave** persists `data.fileUrl` on the node row.
    Cleanup of any previously stored file happens here via `removeObject`.

## Prerequisites

- **GCS bucket CORS** — allow browser `PUT` from the Vercel origin with the
  `Content-Type` header. **Already configured.**
- **Public-read bucket** — `publicUrlFor` assumes objects are served via public
  `storage.googleapis.com/...` URLs (existing behavior; KB providers already fetch
  these URLs directly). If the bucket were private, finalize would also need to
  return a signed *read* URL.

## Verification

- `npx tsc --noEmit` ✅, `eslint` on all touched files ✅, `next build` ✅ (all 8
  new routes registered).
- Checked: finalize path-prefix checks match `pathFor*` output; clipboard paste
  yields png/jpg/webp (valid image exts); Content-Type is consistent between sign and
  PUT; text/Drive/generate paths untouched; no test references the changed code.

## Follow-ups (optional, not done)

- The old `POST /kb/documents` and `POST /kb/images` handlers are now unused by the
  app (both callers migrated). Safe to delete to prevent reintroducing a
  4.5 MB-bound path.
- Possible rename of `finalize` → `confirm` (pairs more naturally with `sign`) —
  under consideration.
- Orphan objects: if the browser PUTs to GCS but never calls finalize (tab closed),
  bytes sit in GCS with no DB row. Currently ignored; a GCS lifecycle/cleanup job
  could reap them.
