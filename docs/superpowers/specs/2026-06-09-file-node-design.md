# File node — reference-only implementation

**Date:** 2026-06-09
**Status:** Implemented
**Area:** Canvas → File node

## Problem

The PRD (§11.4) defines a File node as a canvas building block that holds a `.txt` or image reference and feeds it downstream to Prompt and Image Gen nodes. No such node existed. Designers had no way to bring a reference file onto the canvas without pasting raw text into a script or KB.

## Goals

- Upload `.txt`, `.png`, `.jpg`, `.jpeg`, `.webp` files directly onto a canvas node.
- Preview the file in a full-screen sheet (text in `<pre>`, image rendered).
- Replace or remove the file, with Supabase Storage cleanup on remove/replace.
- Mini canvas node shows title, file kind badge (TXT/IMG), status dot, and "Open ↗".
- File metadata persisted via `nodes.data` JSONB + autosave (no `node_versions` row needed for reference-only mode).

## Non-goals

- **"Use LLM" toggle + extraction** — deferred. No `node_versions`, no OpenAI calls. Reference-only.
- **"Select from client files"** — deferred. Upload-only; no picker from existing client assets.
- **`.docx` / `.pdf`** — deferred (D15).

## Design

### A. Data shape

All file metadata lives in `nodes.data` JSONB — no separate table, no versioning in reference-only mode.

| Field | Type | Notes |
|---|---|---|
| `title` | `string?` | Editable by the user |
| `filename` | `string?` | Original filename |
| `fileExt` | `string?` | `"txt"` \| `"png"` \| `"jpg"` \| `"jpeg"` \| `"webp"` |
| `fileKind` | `"text" \| "image"?` | Used for preview routing |
| `fileUrl` | `string?` | Public Supabase Storage URL (images only) |
| `rawText` | `string?` | File content inline (text files only, ≤ 100 KB) |

Type defined in `src/lib/canvas-nodes.ts` as `FileNodeData`.

### B. Storage

- Images → uploaded to `node-files` Supabase Storage bucket at `{nodeId}/{filename}`; public URL stored in `data.fileUrl`.
- Text → read server-side from `FormData`, content stored in `data.rawText`. No storage object created.
- Replace → POST route deletes the existing storage object (reads `data.fileUrl` from DB) before uploading the new one. Prevents orphans.
- Remove → DELETE route removes the storage object; client clears `data` fields via `updateNodeData`.

Migration: `supabase/migrations/0004_node_files.sql` — creates the `node-files` public bucket with read/insert/delete policies.

### C. API route

`src/app/api/nodes/[id]/file/route.ts`

- **POST** — validates extension + size, handles old-file cleanup, returns `{ filename, fileExt, fileKind, fileUrl? rawText? }`. Client calls `updateNodeData` with the response; autosave persists.
- **DELETE** — deletes storage object, returns `{ ok: true }`. Client clears node data.

Uses `parseFormFile`, `validateFileExtension`, `validateFileSize`, `apiOk`, `apiError` from `src/lib/api/route-helpers.ts`.  
Constants in `src/lib/nodes/file-constants.ts`.

### D. Components

| File | Responsibility |
|---|---|
| `src/components/nodes/file-node.tsx` | Mini canvas node — header, title, kind badge, status dot, "Open ↗" |
| `src/components/nodes/file-focus-view.tsx` | Full-screen sheet — EMPTY / LOADING / READY states, upload handler, replace, remove |
| `src/components/nodes/file-empty-state.tsx` | Drop-zone + title input shown in EMPTY state |

The focus view is a bottom `Sheet` at 92 vh, matching the Script node pattern exactly.

### E. Persistence

`flowToPersisted` in `canvas-nodes.ts` strips `processedOutput` (forward-compat for future LLM mode) alongside the existing `parsed` strip. `nodeRowToFlow` requires no special handling — all fields are stored directly in `data` JSONB.

## Testing

- `npx tsc --noEmit` — zero errors (only pre-existing vitest env errors unrelated to this work).
- Manual: add File node → Open → upload `.txt` → text preview shown; reload → `rawText` survives.
- Manual: upload image → image preview shown; `fileUrl` in `nodes.data`; served from Supabase Storage.
- Manual: Replace → old storage object deleted, new one uploaded.
- Manual: Remove → storage cleaned up, node returns to EMPTY state.

## Design-system notes

Card uses `shadow-card`, `border-border`, `bg-card`. Status dot follows the Script node pattern (purple = active, muted = empty). Focus sheet header uses `font-display` + `text-eyebrow` labels.
