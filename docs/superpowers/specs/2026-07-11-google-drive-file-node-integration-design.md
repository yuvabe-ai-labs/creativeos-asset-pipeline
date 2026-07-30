# Google Drive File Node Integration Design

**Date:** 2026-07-11
**Linear:** YUV-184
**Status:** Approved for implementation

---

## Overview

Clients share a Google Drive folder containing their brand assets (product images, logos, etc.) with the CreativeOS team account. Instead of downloading files and manually uploading them into a File node, users can pick files directly from Google Drive inside the File node focus view. The picked file is immediately downloaded server-side and uploaded to GCS — after that, the node behaves identically to a locally uploaded file.

---

## Auth & Credentials

A Google Cloud OAuth 2.0 client (type: Web Application) is registered in the existing GCP project. The team signs into the Google account that clients share folders with. That account's refresh token is stored as an env var. On demand, the server exchanges the refresh token for a short-lived access token (1-hour TTL) and returns it to the client for use with the Google Picker SDK.

**New env vars:**
```
GDRIVE_CLIENT_ID=
GDRIVE_CLIENT_SECRET=
GDRIVE_REFRESH_TOKEN=
```

No per-user OAuth flow. No changes to the existing soft identity system. Drive credentials are team-owned and never exposed beyond the picker token endpoint.

---

## Data Model

Three new optional fields added to `FileNodeData` in `src/lib/canvas-nodes.ts`:

```typescript
driveFileId?: string;      // Drive file ID — informational, records origin
driveFileName?: string;    // Original filename from Drive metadata
driveMimeType?: string;    // Original MIME type from Drive metadata
```

These fields are purely informational — the node is fully self-contained in GCS after the pick. The presence of `driveFileId` indicates the file originated from Drive. All existing fields (`fileUrl`, `filename`, `fileExt`, `fileKind`, `fileSizeBytes`, etc.) are populated normally as if the file were uploaded locally.

No new DB columns needed — everything fits in the existing `nodes.data` JSONB field.

---

## UI Changes

**Location:** `src/components/nodes/file-focus-view.tsx`

The upload area gains a second action button alongside the existing upload trigger:

```
[ Upload from computer ]   [ Pick from Google Drive ]
```

Styled as a secondary outlined button using existing design tokens (same dashed-border chip pattern used for "Add" actions in the codebase).

**"Pick from Google Drive" click flow:**

1. Client calls `GET /api/drive/picker-token` → receives `{ accessToken, clientId }`
2. Google Picker JS SDK (`https://apis.google.com/js/api.js`) is loaded dynamically if not already on the page (lazy load — no page weight unless Drive is used)
3. Picker opens configured with:
   - `ViewId.DOCS` — all Drive files
   - `setMimeTypes`: `image/png, image/jpeg, image/webp, application/pdf, text/plain, application/vnd.openxmlformats-officedocument.wordprocessingml.document` — same allowlist as local uploads
   - `setSelectFolderEnabled(false)` — files only, no folder selection
4. User picks a file → Picker callback fires with `{ id, name, mimeType }`
5. Client POSTs `{ driveFileId: id, driveFileName: name, driveMimeType: mimeType }` to `POST /api/nodes/[id]/file/drive`
6. On success, node data is patched in the canvas store — file preview renders identically to a locally uploaded file

While the server fetch + GCS upload is in progress, the existing node processing pill pattern is used to show loading state.

---

## New API Routes

### `GET /api/drive/picker-token`

Returns a short-lived OAuth access token for the Google Picker SDK.

**Response:**
```json
{ "accessToken": "ya29...", "clientId": "123....apps.googleusercontent.com" }
```

Server exchanges `GDRIVE_REFRESH_TOKEN` using `GDRIVE_CLIENT_ID` + `GDRIVE_CLIENT_SECRET` via Google's token endpoint. Token is not stored anywhere — generated fresh on each request.

---

### `POST /api/nodes/[id]/file/drive`

**Request body:**
```json
{
  "driveFileId": "1abc...",
  "driveFileName": "logo.png",
  "driveMimeType": "image/png"
}
```

**Server logic:**
1. Validates `driveMimeType` against the existing MIME type allowlist
2. Derives `fileExt` and `fileKind` from MIME type (reuses existing logic)
3. Fetches file bytes from Drive API using a fresh access token (refresh token flow, server-side only)
4. For `text/plain`: reads content inline → sets `rawText`, no GCS upload (matches local text file behavior)
5. For images and documents: uploads bytes to GCS via existing `uploadNodeFile()` — same path structure (`clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/{filename-with-ts}`)
6. If the node previously had a file (local or Drive), calls `removeObject()` to clean up the old GCS object
7. Returns patched `FileNodeData` — same shape as `POST /api/nodes/[id]/file`, plus `driveFileId`, `driveFileName`, `driveMimeType`

**Size limits:** Same as local uploads — 100 KB for text, 10 MB for images/documents.

---

## What Does NOT Change

- `FileNodeData` shape is additive — no breaking changes
- File preview rendering in `file-node.tsx` — uses `fileUrl` (now a GCS URL), unchanged
- LLM extraction (`POST /api/nodes/[id]/file/extract`) — uses `fileUrl` + `fileKind`, unchanged
- Connected inputs card — reads `fileUrl` from upstream node data, unchanged
- Upstream images resolver — reads `fileUrl`, unchanged
- GCS upload/removal infrastructure — reused as-is
- Local upload flow — completely unchanged alongside the new Drive flow

---

## Error Handling

| Failure point | Behavior |
|---|---|
| Picker token fetch fails | Toast error: "Could not connect to Google Drive" — picker does not open |
| User cancels picker | No-op — node state unchanged |
| Drive file fetch fails (server) | `apiError(500, "Failed to fetch file from Google Drive")` — node state unchanged |
| MIME type not in allowlist | `apiError(400, "File type not supported")` |
| File exceeds size limit | `apiError(400, "File too large")` — checked after download, before GCS upload |
| GCS upload fails | Existing error handling in `uploadNodeFile()` |

---

## Out of Scope

- Per-user Google OAuth (auth is deferred per D14)
- Drive folder sync / background polling
- Dedicated "Drive Reference" node type
- Browsing Drive folder contents outside of the Picker UI
- Re-fetching from Drive after initial pick (file is fully owned by GCS after import)
