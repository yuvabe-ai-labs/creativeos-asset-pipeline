# Reference Image Picker — Design Spec

**Date:** 2026-07-13
**Status:** Approved
**Scope:** Two new features — (1) Generated Images per canvas as a reusable library, (2) Custom Google Drive file browser — both surfaced via a rich multi-select dialog triggered from the node context menu.

---

## 1. Problem

Users need to bring existing images (previously generated on the canvas, or stored in Google Drive) into the canvas as file nodes so they can reuse them as reference inputs for image generation. Today there is no way to do this without re-uploading or re-generating.

---

## 2. Entry Point — Context Menu

The existing `NodeContextMenu` (`src/components/nodes/node-context-menu.tsx`) gains one new item: **"Add Reference Image"**, placed between "Duplicate" and the separator before "Delete".

Clicking it opens `ReferenceImagePickerDialog` with:
- `canvasId` — current canvas
- `spawnPosition` — the right-clicked node's `{ x, y }` React Flow position
- `open: true`

Open state is managed by a new hook `use-reference-image-picker.ts` consumed by each node that renders `NodeContextMenu`. Each node manages its own open/close independently.

---

## 3. `ReferenceImagePickerDialog`

**File:** `src/components/canvas/reference-image-picker-dialog.tsx`

A shadcn `Dialog` (full modal, ~860px wide, ~600px tall). Internal layout is **two-panel**:

### 3.1 Left Sidebar (~200px)

- Tab switcher: **Google Drive** | **Generated Images** (shadcn `Tabs`, vertical orientation)
- Below the tab switcher: per-tab filter controls
  - Drive tab: folder breadcrumb tree (`drive-folder-nav.tsx`)
  - Generated tab: date range filter + optional node-name search

### 3.2 Right Main Area

- **Search bar** at top (filters by filename for Drive; by node name or date for Generated)
- **Image grid** — `reference-image-grid.tsx` — uniform 3-column grid, lazy loaded
- **Empty state** and **loading state** (skeleton shimmer cards) fully handled

### 3.3 Footer (sticky)

- Left: "X selected" count chip (purple `text-primary`, only visible when selection > 0)
- Right: "Cancel" + "Add X images →" primary CTA (disabled until ≥ 1 selected)

### Props

```ts
interface ReferenceImagePickerDialogProps {
  canvasId: string
  spawnPosition: { x: number; y: number }
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (images: SelectedImage[]) => void
}

interface SelectedImage {
  source: 'drive' | 'generated'
  imageUrl: string
  filename: string
  // Drive-specific
  driveFileId?: string
  driveMimeType?: string
  // Generated-specific
  generationId?: string
}
```

---

## 4. Image Card — `reference-image-card.tsx`

Shared across both tabs.

- Thumbnail fills the card (white card, `shadow-card`, 12px radius — Yuvabe system)
- On hover: subtle dark overlay + checkbox appears top-left
- Selected: 2px `border-primary` ring, checkbox checked
- Bottom metadata strip: filename (truncated) + date
- Lucide icons only, 1.5 stroke

---

## 5. Generated Images Tab

**File:** `src/components/canvas/generations/generations-image-browser.tsx`

**Data source:** `GET /api/canvas/[id]/generations`

Queries the `generations` table joined to `nodes` on `canvas_id`, filtered by:
- `type = 'image'`
- `status = 'succeeded'`

Joins `node_versions` via `generations.version_id` to get the image URL (`output` field — this is what gets hydrated as `data.parsed` on the canvas).

**Response shape:**
```ts
{
  id: string           // generation id
  nodeId: string
  nodeName: string     // from nodes.name
  imageUrl: string     // from node_versions.output
  modelUsed: string
  createdAt: string
}[]
```

Fetches on dialog open (lazy — not on parent mount).

**Empty state:** "No generated images yet — run an image generation node to see results here."

---

## 6. Google Drive Tab

**File:** `src/components/canvas/drive/drive-image-browser.tsx`

### 6.1 Folder Navigation — `drive-folder-nav.tsx`

- Breadcrumb path: Root → Folder → Subfolder
- Clicking a folder updates the grid
- Back chevron to navigate up
- Rendered in the left sidebar below the Drive tab

### 6.2 New API Route — `GET /api/drive/files`

**Query params:** `folderId?` (defaults to `'root'`), `pageToken?`

**Server-side only** — uses existing `exchangeRefreshToken()` from `src/lib/drive/client.ts` to get an access token, then calls Drive API.

**Filters:** image MIME types only (`image/png`, `image/jpeg`, `image/webp`, `image/gif`)

**Response shape:**
```ts
{
  files: {
    id: string
    name: string
    mimeType: string
    thumbnailUrl: string
    modifiedTime: string
  }[]
  nextPageToken?: string
}
```

**Pagination:** "Load more" button in grid footer using `nextPageToken`.

**Auth:** Reuses `GET /api/drive/picker-token` for access token.

**Empty state:** "No images found in this folder."

---

## 7. Component Tree

```
src/components/canvas/
├── reference-image-picker-dialog.tsx   # Shell: Dialog, open/close, onAdd callback
├── reference-image-picker-tabs.tsx     # Left sidebar: tab switcher + per-tab filters
├── reference-image-grid.tsx            # Right area: search bar + grid + empty/loading
├── reference-image-card.tsx            # Single selectable image card with checkbox overlay
├── reference-image-footer.tsx          # Sticky footer: count chip + Add/Cancel
├── drive/
│   ├── drive-folder-nav.tsx            # Breadcrumb folder navigation
│   └── drive-image-browser.tsx         # Drive tab: folder nav + grid + pagination
└── generations/
    └── generations-image-browser.tsx   # Generated tab: fetch + grid

src/hooks/
└── use-reference-image-picker.ts       # open state, spawn position, onAdd → spawn nodes

src/app/api/
├── canvas/[id]/generations/route.ts    # GET — list succeeded image generations for canvas
└── drive/files/route.ts                # GET — list Drive image files in a folder
```

---

## 8. Node Spawning

**Hook:** `use-reference-image-picker.ts` handles the `onAdd` callback.

**Layout:**
- Base position = right-clicked node `{ x, y }` + `{ x: +280, y: 0 }` offset
- Grid arrangement: max 3 columns, `220px` horizontal gap, `260px` vertical gap
- Formula: `x = base.x + (col * 220)`, `y = base.y + (row * 260)`

**Spawned node type:** `file` with:
- `fileKind: 'image'`
- `fileUrl`: image URL
- `filename`: Drive filename or `${modelUsed} ${date}`
- Drive nodes: `driveFileId`, `driveMimeType` set (existing provenance fields)
- Generated nodes: `meta.sourceGenerationId` set for traceability

**After spawn:**
- Nodes added via existing `addNode` Zustand mutation
- Canvas autosave triggers normally
- Dialog closes
- No auto-connection to originating node

---

## 9. Multi-Select Behavior

- Checkbox visible on hover (smooth CSS transition)
- Shift-key range selection supported
- No maximum selection limit (for now)
- Pre-selected state not applicable (fresh pick each time)
- "Add" CTA disabled until ≥ 1 selected
- Selection resets on tab switch

---

## 10. Design System Constraints

- All controls via shadcn primitives from `src/components/ui/` — no native `<button>`, `<input>`, etc.
- Colors via CSS variables only — no hardcoded hex
- Purple `border-primary` for selected state ring
- `shadow-card` for image cards
- Lucide icons, 1.5 stroke, no fills
- Motion: `cubic-bezier(0.22,1,0.36,1)`, 200ms for hover transitions
- Fonts: Clash Display headings, Gilroy UI text

---

## 11. Out of Scope

- Video generations in the picker (deferred to full gallery page)
- Cross-canvas generation library (future)
- Copilot/AI agent integration (separate feature — can hook into spawn logic later)
- Max selection limit (revisit when gallery page is built)
- Auto-connecting spawned nodes to the originating node

---

## 12. Future Extension Points

- **Standalone gallery page**: `generations-image-browser.tsx` and `drive-image-browser.tsx` are standalone enough to embed directly in a future `/canvas/[id]/gallery` page
- **Copilot integration**: the `onAdd` → node spawn logic in `use-reference-image-picker.ts` can be called programmatically by the AI agent without touching the dialog
- **Video tab**: add a third tab to the dialog reusing `reference-image-grid.tsx` with a video-specific browser component
