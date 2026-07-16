# Client Drive Folder — Navigable Gallery Design

## Goal

Replace the current traversal-based Drive gallery with a per-client folder-scoped navigable browser. Each client has one configured Drive root folder; the gallery shows its contents one level at a time (single API call per navigation), with in-folder search.

## Architecture

**Core principle:** Every folder view is exactly one `files.list` call — `'<folderId>' in parents`. No BFS, no traversal, no parallel fan-out. Speed is unconditionally O(1) API calls per folder level regardless of Drive size.

**Tech stack:** Drizzle migration, Next.js API routes, React hook (`use-drive-browser`), existing gallery drawer components.

---

## 1. Data Model

### Migration `0006_add_drive_root_folder_id.sql`

```sql
ALTER TABLE clients ADD COLUMN drive_root_folder_id TEXT;
```

`NULL` = no folder linked. No new tables needed.

### `ClientRow` type update

Add `drive_root_folder_id: string | null` to `src/lib/db/types.ts`.

---

## 2. API Routes

### DELETE `/api/drive/images` route

Remove `src/app/api/drive/images/route.ts` and its test entirely. This is the traversal code being replaced.

### NEW `GET /api/drive/folders`

**Purpose:** Folder picker — lists top-level folders a user can link to a client.

**Query params:** none

**Implementation:** Two parallel `files.list` calls:
1. `mimeType='application/vnd.google-apps.folder' and 'me' in owners and trashed=false` — owned folders
2. `mimeType='application/vnd.google-apps.folder' and sharedWithMe=true and trashed=false` — shared-with-me folders

Merge, dedupe by id, sort alphabetically by name.

**Response:**
```ts
type DriveFoldersResponse = {
  items: { id: string; name: string; isShared: boolean }[];
};
```

### NEW `GET /api/drive/browse`

**Purpose:** Navigable folder browser — the gallery's data source.

**Query params:**
- `folderId` (required) — Drive folder ID to list
- `q` (optional) — search term; scopes `fullText contains '<term>'` to this folder only
- `pageToken` (optional) — cursor for next page

**Implementation:** Single `files.list` call:
```
'<folderId>' in parents and trashed=false [and fullText contains '<q>']
```
`fields`: `id, name, mimeType, modifiedTime, thumbnailLink`
`orderBy`: `folder` first (Drive native ordering puts folders before files), then `modifiedTime desc`
`pageSize`: 50

Returns both image files and subfolders in the same response. Folders have `mimeType = 'application/vnd.google-apps.folder'`.

**Response:**
```ts
type DriveBrowseItem = {
  id: string;
  name: string;
  mimeType: string;               // folder mime = subfolder tile; image/* = image tile
  modifiedTime: string;
  thumbnailUrl: string | null;    // null for folders
  previewUrl: string | null;      // null for folders
};

type DriveBrowseResponse = {
  items: DriveBrowseItem[];
  nextPageToken: string | null;
};
```

**Error cases:**
- Drive token error → 500 with `{ error: "Could not connect to Google Drive" }`
- Folder not found (404 from Drive) → 404 with `{ error: "folder_not_found" }` — client uses this to auto-clear `drive_root_folder_id`

### PATCH `/api/clients/:id`

Extend existing handler to accept `{ driveRootFolderId: string | null }` in the body. Validates it's a non-empty string or null. Updates the `drive_root_folder_id` column.

---

## 3. Hook: `use-drive-browser`

**File:** `src/hooks/use-drive-browser.ts`

Replaces `use-drive-images.ts` for the client-scoped gallery.

**State:**
```ts
type FolderFrame = { id: string; name: string };

type BrowseState = {
  stack: FolderFrame[];          // [root, ...navigated]. stack[stack.length-1] = current folder
  items: DriveBrowseItem[];      // current folder's loaded items
  nextPageToken: string | null;
  loading: boolean;
  loadingMore: boolean;
  loadError: string | null;
  search: string;
};
```

**Actions:**
- `navigateInto(folder: FolderFrame)` — push onto stack, reset items, fetch new folder
- `navigateTo(index: number)` — pop stack to that index (breadcrumb navigation), reset items, fetch
- `loadMore()` — fetch next page for current folder, append to items
- `setSearch(term: string)` — debounced 250ms, resets items and re-fetches current folder with `q`
- `refresh()` — re-fetch current folder from scratch

**Cache:** Module-level map keyed by `<folderId>:<search>` — same pattern as `use-drive-images`. Cache is cleared when `navigateTo` goes back (parent folder re-fetches fresh on re-entry).

**Folder-not-found handling:** If `/api/drive/browse` returns `{ error: "folder_not_found" }`, the hook sets `loadError = "folder_not_found"` — the gallery renders the re-link CTA.

---

## 4. Gallery Drawer — References Tab

### No folder linked (empty state)

Full-height centered empty state in the drawer content area:

```
[folder icon]
No Drive folder linked
Link a folder to browse this client's assets

[Link Drive Folder button — primary]
```

Clicking "Link Drive Folder" opens the folder picker modal.

### Folder linked — navigable browser

**Breadcrumb bar** (between toolbar and content):
- `Product Images > Logos > Summer 2026`
- Each segment is clickable (calls `navigateTo(index)`)
- Root segment shows the root folder name
- Replaces the existing folder-filter popover (remove that UI)

**Content area:**
- Folder tiles: folder icon + name, full-width card, clickable (calls `navigateInto`)
- Image tiles: existing `ImageTile` / `ImageRow` components, same selection/drag/preview behaviour
- Folders always appear above images (Drive API returns them first with `orderBy=folder`)
- Infinite scroll sentinel — same `useInView` pattern from current gallery

**Search:** Existing toolbar search input — on change debounced 250ms, calls `setSearch`. Placeholder text: "Search in [current folder name]…". Cleared automatically on folder navigation.

**Toolbar:** Remove the existing "Shared / Owned / Folder" filter popover — not needed when scoped to one folder tree. Keep view toggle (masonry / list) and search.

**Folder-not-found error state:**
```
This Drive folder no longer exists.
[Link a new folder button]
```
On render, auto-PATCHes `driveRootFolderId: null` to clear the stale ID.

---

## 5. Folder Picker Modal

**Component:** `src/components/canvas/gallery-drawer/drive-folder-picker.tsx`

Reusable — opened from both gallery empty state and client settings.

**Behaviour:**
1. On open, fetch `/api/drive/folders`
2. Show a scrollable list: shared folders labelled with a "Shared" badge, owned folders unlabelled
3. Clicking a row selects it (highlight), shows folder name in a confirm footer
4. "Link" button → PATCH `/api/clients/:id` with `{ driveRootFolderId: id }` → close modal → gallery reloads at root
5. Empty state: "No folders found in your Drive"
6. Error state: "Could not load folders. Retry."

---

## 6. Client Settings — Drive Folder Row

In the existing client settings panel (where logo/website URL live), add a **"Drive Folder"** row below the existing fields.

**No folder linked:**
```
Drive Folder    [Not configured — bold, clickable text]
```
Clicking "Not configured" opens the folder picker modal directly.

**Folder linked:**
```
Drive Folder    Product Images  [gear icon]
```
Clicking the gear icon opens a small popover with two actions:
- **Change folder** — opens folder picker modal
- **Unlink** — PATCHes `driveRootFolderId: null`, clears row back to "Not configured"

The folder name is resolved once via `GET /api/drive/file/<id>` metadata (existing `fetchFolderMeta` utility, already in the codebase) and cached in component state.

---

## 7. Removed Code

- `src/app/api/drive/images/route.ts` — deleted
- `src/app/api/drive/images/route.test.ts` — deleted
- `src/hooks/use-drive-images.ts` — deleted
- `src/hooks/use-drive-images.test.ts` — deleted
- Folder filter popover in gallery toolbar — removed
- `sharedOnly` / `folderIds` filter state in gallery drawer — removed

---

## 8. Error Handling Summary

| Condition | Behaviour |
|---|---|
| Drive token expired | Inline error + Retry button in drawer |
| Root folder deleted on Drive | "Folder no longer exists" state + auto-clear DB + re-link CTA |
| Browse returns empty | "This folder is empty" empty state |
| Search returns nothing | "No results in [folder name]" — no navigation change |
| Folder picker load fails | Error state in modal + Retry |
| PATCH client fails | Toast error, no state change |

---

## 9. Out of Scope

- Multi-folder linking per client (one root only)
- Recursive search across all subfolders (search is per-level)
- Caching folder contents across sessions (in-memory only, cleared on page reload)
- Shared Drive (team drives) support — can be added later by extending `/api/drive/folders`
