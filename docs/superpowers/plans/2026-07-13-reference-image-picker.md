# Reference Image Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Add Reference Image" to the node right-click menu, opening a two-tab dialog (Google Drive custom browser + Generated Images) that lets users multi-select images and spawn them as file nodes near the originating node.

**Architecture:** A `ReferenceImagePickerDialog` with a two-panel layout (left: tab switcher + filters, right: image grid) is triggered from `NodeContextMenu` via a new `useReferenceImagePicker` hook. Two new API routes serve data: `GET /api/canvas/[id]/generations` (queries `generations` + `node_versions` in Supabase) and `GET /api/drive/files` (server-side Drive API call, reuses existing `exchangeRefreshToken`). On confirm, the hook spawns file nodes near the right-clicked node using the existing `addNode` Zustand mutation.

**Tech Stack:** Next.js 16, React 19, TypeScript, @xyflow/react, Zustand 5, shadcn/ui (Base UI), Tailwind v4, Lucide icons, Supabase, Google Drive API v3, Framer Motion (`motion/react`)

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `src/hooks/use-reference-image-picker.ts` | Open/close state, spawn position, onAdd → spawn file nodes |
| `src/components/canvas/reference-image-picker-dialog.tsx` | Dialog shell: two-panel layout, tab state, onAdd callback |
| `src/components/canvas/reference-image-picker-tabs.tsx` | Left sidebar: tab switcher (Drive / Generated) + per-tab filters |
| `src/components/canvas/reference-image-grid.tsx` | Right area: search bar, image grid, empty/loading states |
| `src/components/canvas/reference-image-card.tsx` | Single selectable image card with checkbox overlay |
| `src/components/canvas/reference-image-footer.tsx` | Sticky footer: count chip + Add/Cancel buttons |
| `src/components/canvas/drive/drive-folder-nav.tsx` | Breadcrumb folder navigation for Drive tab |
| `src/components/canvas/drive/drive-image-browser.tsx` | Drive tab: wires folder nav + grid + pagination |
| `src/components/canvas/generations/generations-image-browser.tsx` | Generated tab: fetches Supabase + wires grid |
| `src/app/api/canvas/[id]/generations/route.ts` | GET: list succeeded image-gen generations for a canvas |
| `src/app/api/drive/files/route.ts` | GET: list Drive image files in a folder |

### Modified files
| Path | Change |
|------|--------|
| `src/components/nodes/node-context-menu.tsx` | Add `onAddReferenceImage?: () => void` prop + menu item |
| `src/components/nodes/file-node.tsx` | Wire `useReferenceImagePicker` + pass `onAddReferenceImage` to `NodeContextMenu` |

---

## Task 1: API route — canvas generations

**Files:**
- Create: `src/app/api/canvas/[id]/generations/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// src/app/api/canvas/[id]/generations/route.ts
import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export type CanvasGenerationItem = {
  id: string;
  nodeId: string;
  nodeName: string | null;
  imageUrl: string;
  modelUsed: string | null;
  createdAt: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("generations")
    .select(
      `id, model_used, created_at,
       nodes!inner ( id, name, canvas_id ),
       node_versions!inner ( output )`
    )
    .eq("nodes.canvas_id", canvasId)
    .eq("type", "image")
    .eq("status", "succeeded")
    .not("node_versions.output", "is", null)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  const items: CanvasGenerationItem[] = (data ?? []).map((row) => {
    const node = Array.isArray(row.nodes) ? row.nodes[0] : row.nodes;
    const version = Array.isArray(row.node_versions)
      ? row.node_versions[0]
      : row.node_versions;
    return {
      id: row.id as string,
      nodeId: (node as { id: string }).id,
      nodeName: (node as { name: string | null }).name,
      imageUrl: (version as { output: string }).output,
      modelUsed: row.model_used as string | null,
      createdAt: row.created_at as string,
    };
  });

  return apiOk(items);
}
```

- [ ] **Step 2: Manually test with curl (replace CANVAS_ID with a real one from your DB)**

```bash
curl "http://localhost:3000/api/canvas/CANVAS_ID/generations"
```

Expected: JSON array (may be empty if no completed image gens on that canvas). No 500 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/canvas/[id]/generations/route.ts
git commit -m "feat: GET /api/canvas/[id]/generations — list succeeded image generations"
```

---

## Task 2: API route — Drive files browser

**Files:**
- Create: `src/app/api/drive/files/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// src/app/api/drive/files/route.ts
import { NextRequest } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string | null;
  modifiedTime: string;
};

export type DriveFilesResponse = {
  files: DriveFileItem[];
  nextPageToken: string | null;
};

const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId") ?? "root";
  const pageToken = searchParams.get("pageToken") ?? undefined;

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive. Check server configuration.", 500);
  }

  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and (${IMAGE_MIME_TYPES.split(",").map((m) => `mimeType='${m}'`).join(" or ")}) and trashed=false`
  );

  const fields = encodeURIComponent(
    "nextPageToken,files(id,name,mimeType,thumbnailLink,modifiedTime)"
  );

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", decodeURIComponent(q));
  url.searchParams.set("fields", decodeURIComponent(fields));
  url.searchParams.set("pageSize", "48");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return apiError(`Drive API error: ${text}`, 502);
  }

  const json = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      thumbnailLink?: string;
      modifiedTime: string;
    }>;
    nextPageToken?: string;
  };

  const files: DriveFileItem[] = (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    thumbnailUrl: f.thumbnailLink ?? null,
    modifiedTime: f.modifiedTime,
  }));

  return apiOk<DriveFilesResponse>({
    files,
    nextPageToken: json.nextPageToken ?? null,
  });
}
```

- [ ] **Step 2: Manually test**

```bash
curl "http://localhost:3000/api/drive/files?folderId=root"
```

Expected: `{ data: { files: [...], nextPageToken: null } }` — files from the root of your connected Drive, filtered to image MIME types.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/drive/files/route.ts
git commit -m "feat: GET /api/drive/files — custom Drive image browser endpoint"
```

---

## Task 3: `reference-image-card.tsx` — shared selectable image card

**Files:**
- Create: `src/components/canvas/reference-image-card.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/reference-image-card.tsx
"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReferenceImageCardProps = {
  imageUrl: string;
  filename: string;
  subtitle: string; // date or model name
  selected: boolean;
  onToggle: () => void;
};

export function ReferenceImageCard({
  imageUrl,
  filename,
  subtitle,
  selected,
  onToggle,
}: ReferenceImageCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border bg-card shadow-card",
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:-translate-y-0.5 hover:scale-[1.006]",
        selected
          ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "border-border",
      )}
    >
      {/* thumbnail */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={filename}
        className="h-36 w-full object-cover"
      />

      {/* hover overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/30 transition-opacity duration-200",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />

      {/* checkbox */}
      <div
        className={cn(
          "absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all duration-200",
          selected
            ? "border-primary bg-primary"
            : "border-white/80 bg-white/20 opacity-0 group-hover:opacity-100",
        )}
      >
        {selected && <Check className="size-3 text-white" strokeWidth={2.5} />}
      </div>

      {/* metadata strip */}
      <div className="bg-card px-2.5 py-2">
        <p className="truncate text-xs font-medium text-foreground">{filename}</p>
        <p className="truncate text-[0.65rem] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/reference-image-card.tsx
git commit -m "feat: ReferenceImageCard — shared selectable image card component"
```

---

## Task 4: `reference-image-grid.tsx` — search + grid + states

**Files:**
- Create: `src/components/canvas/reference-image-grid.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/reference-image-grid.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ReferenceImageCard } from "./reference-image-card";

export type GridImage = {
  id: string;
  imageUrl: string;
  filename: string;
  subtitle: string;
};

type Props = {
  images: GridImage[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  emptyMessage: string;
};

export function ReferenceImageGrid({
  images,
  selectedIds,
  onToggle,
  loading,
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
  emptyMessage,
}: Props) {
  const filtered = images.filter((img) =>
    img.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      {/* search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-8 text-sm"
        />
      </div>

      {/* grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((img) => (
              <ReferenceImageCard
                key={img.id}
                imageUrl={img.imageUrl}
                filename={img.filename}
                subtitle={img.subtitle}
                selected={selectedIds.has(img.id)}
                onToggle={() => onToggle(img.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/reference-image-grid.tsx
git commit -m "feat: ReferenceImageGrid — search bar, 3-col grid, skeleton + empty states"
```

---

## Task 5: `reference-image-footer.tsx` — sticky footer

**Files:**
- Create: `src/components/canvas/reference-image-footer.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/reference-image-footer.tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  onAdd: () => void;
  onCancel: () => void;
};

export function ReferenceImageFooter({ selectedCount, onAdd, onCancel }: Props) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-card px-5 py-3">
      <div className="min-w-[80px]">
        {selectedCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              "bg-primary/10 text-primary",
            )}
          >
            {selectedCount} selected
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={selectedCount === 0}
          onClick={onAdd}
        >
          Add {selectedCount > 0 ? `${selectedCount} image${selectedCount > 1 ? "s" : ""}` : "images"} →
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/reference-image-footer.tsx
git commit -m "feat: ReferenceImageFooter — selection count chip + Add/Cancel buttons"
```

---

## Task 6: `generations-image-browser.tsx` — Generated Images tab content

**Files:**
- Create: `src/components/canvas/generations/generations-image-browser.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/generations/generations-image-browser.tsx
"use client";

import { useEffect, useState } from "react";
import { ReferenceImageGrid, type GridImage } from "../reference-image-grid";
import type { CanvasGenerationItem } from "@/app/api/canvas/[id]/generations/route";

type Props = {
  canvasId: string;
  open: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

export function GenerationsImageBrowser({
  canvasId,
  open,
  selectedIds,
  onToggle,
  searchQuery,
  onSearchChange,
}: Props) {
  const [images, setImages] = useState<GridImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/canvas/${canvasId}/generations`)
      .then((r) => r.json())
      .then((res: { data: CanvasGenerationItem[] }) => {
        setImages(
          res.data.map((item) => ({
            id: item.id,
            imageUrl: item.imageUrl,
            filename: item.nodeName ?? `Image Gen`,
            subtitle: `${item.modelUsed ?? "unknown"} · ${new Date(item.createdAt).toLocaleDateString()}`,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [open, canvasId]);

  return (
    <ReferenceImageGrid
      images={images}
      selectedIds={selectedIds}
      onToggle={onToggle}
      loading={loading}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search by node name…"
      emptyMessage="No generated images yet — run an image generation node to see results here."
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/generations/generations-image-browser.tsx
git commit -m "feat: GenerationsImageBrowser — fetches canvas image generations from Supabase"
```

---

## Task 7: `drive-folder-nav.tsx` — breadcrumb folder navigation

**Files:**
- Create: `src/components/canvas/drive/drive-folder-nav.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/drive/drive-folder-nav.tsx
"use client";

import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FolderCrumb = { id: string; name: string };

type Props = {
  crumbs: FolderCrumb[]; // first item is always root
  onNavigate: (folderId: string, crumbIndex: number) => void;
};

export function DriveFolderNav({ crumbs, onNavigate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 py-1">
      {crumbs.map((crumb, i) => (
        <div key={crumb.id} className="flex items-center gap-0.5">
          {i > 0 && (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 px-1.5 text-xs",
              i === crumbs.length - 1
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onNavigate(crumb.id, i)}
          >
            {i === 0 && <Home className="size-3" strokeWidth={1.5} />}
            {crumb.name}
          </Button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/drive/drive-folder-nav.tsx
git commit -m "feat: DriveFolderNav — breadcrumb folder navigation for Drive browser"
```

---

## Task 8: `drive-image-browser.tsx` — Drive tab content

**Files:**
- Create: `src/components/canvas/drive/drive-image-browser.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/drive/drive-image-browser.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DriveFolderNav, type FolderCrumb } from "./drive-folder-nav";
import { ReferenceImageGrid, type GridImage } from "../reference-image-grid";
import type { DriveFilesResponse } from "@/app/api/drive/files/route";

type Props = {
  open: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

const ROOT_CRUMB: FolderCrumb = { id: "root", name: "My Drive" };

export function DriveImageBrowser({
  open,
  selectedIds,
  onToggle,
  searchQuery,
  onSearchChange,
}: Props) {
  const [crumbs, setCrumbs] = useState<FolderCrumb[]>([ROOT_CRUMB]);
  const [images, setImages] = useState<GridImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const currentFolderId = crumbs[crumbs.length - 1].id;

  const fetchFiles = useCallback(
    async (folderId: string, pageToken?: string) => {
      const params = new URLSearchParams({ folderId });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`/api/drive/files?${params}`);
      const json = (await res.json()) as { data: DriveFilesResponse };
      return json.data;
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setImages([]);
    setNextPageToken(null);
    fetchFiles(currentFolderId)
      .then((data) => {
        setImages(
          data.files.map((f) => ({
            id: f.id,
            imageUrl: f.thumbnailUrl ?? "",
            filename: f.name,
            subtitle: new Date(f.modifiedTime).toLocaleDateString(),
          }))
        );
        setNextPageToken(data.nextPageToken);
      })
      .finally(() => setLoading(false));
  }, [open, currentFolderId, fetchFiles]);

  function handleNavigate(folderId: string, crumbIndex: number) {
    setCrumbs((prev) => prev.slice(0, crumbIndex + 1));
  }

  async function handleLoadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const data = await fetchFiles(currentFolderId, nextPageToken);
      setImages((prev) => [
        ...prev,
        ...data.files.map((f) => ({
          id: f.id,
          imageUrl: f.thumbnailUrl ?? "",
          filename: f.name,
          subtitle: new Date(f.modifiedTime).toLocaleDateString(),
        })),
      ]);
      setNextPageToken(data.nextPageToken);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <DriveFolderNav crumbs={crumbs} onNavigate={handleNavigate} />
      <ReferenceImageGrid
        images={images}
        selectedIds={selectedIds}
        onToggle={onToggle}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by filename…"
        emptyMessage="No images found in this folder."
      />
      {nextPageToken && !loading && (
        <div className="flex justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-xs text-muted-foreground"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/drive/drive-image-browser.tsx
git commit -m "feat: DriveImageBrowser — custom Drive file browser with folder nav and pagination"
```

---

## Task 9: `reference-image-picker-tabs.tsx` — left sidebar

**Files:**
- Create: `src/components/canvas/reference-image-picker-tabs.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/reference-image-picker-tabs.tsx
"use client";

import { DriveIcon } from "@/components/ui/drive-icon";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerTab = "drive" | "generated";

type Props = {
  activeTab: PickerTab;
  onTabChange: (tab: PickerTab) => void;
};

const TABS: { id: PickerTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "drive",
    label: "Google Drive",
    icon: <DriveIcon className="size-4 shrink-0" />,
  },
  {
    id: "generated",
    label: "Generated Images",
    icon: <Sparkles className="size-4 shrink-0" strokeWidth={1.5} />,
  },
];

export function ReferenceImagePickerTabs({ activeTab, onTabChange }: Props) {
  return (
    <nav className="flex flex-col gap-0.5">
      <p className="text-eyebrow mb-2 px-2 text-[0.65rem]!">Source</p>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
            activeTab === tab.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/canvas/reference-image-picker-tabs.tsx
git commit -m "feat: ReferenceImagePickerTabs — left sidebar tab switcher"
```

---

## Task 10: `reference-image-picker-dialog.tsx` — dialog shell

**Files:**
- Create: `src/components/canvas/reference-image-picker-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/canvas/reference-image-picker-dialog.tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReferenceImagePickerTabs, type PickerTab } from "./reference-image-picker-tabs";
import { DriveImageBrowser } from "./drive/drive-image-browser";
import { GenerationsImageBrowser } from "./generations/generations-image-browser";
import { ReferenceImageFooter } from "./reference-image-footer";

export type SelectedImage = {
  source: "drive" | "generated";
  imageUrl: string;
  filename: string;
  driveFileId?: string;
  driveMimeType?: string;
  generationId?: string;
};

type Props = {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (images: SelectedImage[]) => void;
};

export function ReferenceImagePickerDialog({
  canvasId,
  open,
  onOpenChange,
  onAdd,
}: Props) {
  const [activeTab, setActiveTab] = useState<PickerTab>("drive");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // We store a flat map of id → SelectedImage to reconstruct on confirm
  const [imageMap, setImageMap] = useState<Map<string, SelectedImage>>(new Map());

  function handleToggle(id: string, image: SelectedImage) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setImageMap((m) => new Map(m).set(id, image));
      }
      return next;
    });
  }

  function handleTabChange(tab: PickerTab) {
    setActiveTab(tab);
    setSearchQuery("");
  }

  function handleAdd() {
    const images = Array.from(selectedIds)
      .map((id) => imageMap.get(id))
      .filter((img): img is SelectedImage => img != null);
    onAdd(images);
    handleClose();
  }

  function handleClose() {
    onOpenChange(false);
    setSelectedIds(new Set());
    setImageMap(new Map());
    setSearchQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[600px] max-w-[860px] flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="font-display text-base font-semibold">
            Add Reference Image
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* left sidebar */}
          <div className="w-48 shrink-0 border-r border-border bg-muted/30 px-3 py-4">
            <ReferenceImagePickerTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </div>

          {/* right main area */}
          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
            {activeTab === "drive" ? (
              <DriveImageBrowser
                open={open}
                selectedIds={selectedIds}
                onToggle={(id, image) => handleToggle(id, image)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            ) : (
              <GenerationsImageBrowser
                canvasId={canvasId}
                open={open}
                selectedIds={selectedIds}
                onToggle={(id, image) => handleToggle(id, image)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            )}
          </div>
        </div>

        <ReferenceImageFooter
          selectedCount={selectedIds.size}
          onAdd={handleAdd}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update `DriveImageBrowser` and `GenerationsImageBrowser` to pass `SelectedImage` through `onToggle`**

The `onToggle` signature needs to carry the image data so the dialog can store it. Update the browser component props:

In `drive-image-browser.tsx`, change:
```ts
// old
onToggle: (id: string) => void;

// new
onToggle: (id: string, image: SelectedImage) => void;
```

And in the map:
```ts
// old
onToggle={() => onToggle(img.id)}

// new (inside the fetchFiles .then, build a driveFile lookup map, or pass inline):
onToggle={(id) =>
  onToggle(id, {
    source: "drive",
    imageUrl: f.thumbnailUrl ?? "",
    filename: f.name,
    driveFileId: f.id,
    driveMimeType: f.mimeType,
  })
}
```

Pass the image data when calling `onToggle` in `ReferenceImageGrid` too — update its prop type:
```ts
// reference-image-grid.tsx
onToggle: (id: string) => void;
// stays the same — the browser components wrap this
```

The browsers call `onToggle(id, imageData)` and pass a wrapper down to the grid that only needs `id`:

```tsx
// In DriveImageBrowser, pass to ReferenceImageGrid:
onToggle={(id) => {
  const img = driveImages.find((f) => f.id === id);
  if (!img) return;
  onToggle(id, {
    source: "drive",
    imageUrl: img.imageUrl,
    filename: img.filename,
    driveFileId: img.driveFileId,
    driveMimeType: img.driveMimeType,
  });
}}
```

Store `driveFileId` and `driveMimeType` on the `GridImage` type by extending it in the Drive browser:

```ts
// drive-image-browser.tsx — local type
type DriveGridImage = GridImage & { driveFileId: string; driveMimeType: string };
```

In `GenerationsImageBrowser`, similar pattern:
```tsx
onToggle={(id) => {
  const img = genImages.find((g) => g.id === id);
  if (!img) return;
  onToggle(id, {
    source: "generated",
    imageUrl: img.imageUrl,
    filename: img.filename,
    generationId: id,
  });
}}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/reference-image-picker-dialog.tsx \
        src/components/canvas/drive/drive-image-browser.tsx \
        src/components/canvas/generations/generations-image-browser.tsx
git commit -m "feat: ReferenceImagePickerDialog — two-panel dialog shell with Drive and Generated tabs"
```

---

## Task 11: `use-reference-image-picker.ts` — hook + node spawn logic

**Files:**
- Create: `src/hooks/use-reference-image-picker.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/use-reference-image-picker.ts
"use client";

import { useState, useCallback } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import type { SelectedImage } from "@/components/canvas/reference-image-picker-dialog";

const COLS = 3;
const GAP_X = 220;
const GAP_Y = 260;
const OFFSET_X = 280;

export function useReferenceImagePicker(canvasId: string) {
  const [open, setOpen] = useState(false);
  const [spawnPosition, setSpawnPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const openPicker = useCallback((nodePosition: { x: number; y: number }) => {
    setSpawnPosition(nodePosition);
    setOpen(true);
  }, []);

  const handleAdd = useCallback(
    (images: SelectedImage[]) => {
      const base = { x: spawnPosition.x + OFFSET_X, y: spawnPosition.y };

      images.forEach((image, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const position = {
          x: base.x + col * GAP_X,
          y: base.y + row * GAP_Y,
        };

        const nodeId = crypto.randomUUID();
        addNode("file", position, nodeId);

        // Populate node data after creation
        const nodeData: Record<string, unknown> = {
          fileKind: "image",
          fileUrl: image.imageUrl,
          filename: image.filename,
        };

        if (image.source === "drive") {
          nodeData.driveFileId = image.driveFileId;
          nodeData.driveMimeType = image.driveMimeType;
          nodeData.driveFileName = image.filename;
        } else {
          nodeData.meta = { sourceGenerationId: image.generationId };
        }

        updateNodeData(nodeId, nodeData);
      });

      setOpen(false);
    },
    [spawnPosition, addNode, updateNodeData]
  );

  return { open, setOpen, openPicker, handleAdd, canvasId };
}
```

- [ ] **Step 2: Check that `addNode` and `updateNodeData` exist in canvas-store**

`addNode` takes `(type, position, id?)` — confirmed from Task 1 research.
`updateNodeData` takes `(id, data)` — this is standard in all nodes. If the signature differs, check `src/lib/canvas-store.ts` and adjust.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-reference-image-picker.ts
git commit -m "feat: useReferenceImagePicker — open/close state and node spawn logic"
```

---

## Task 12: Wire context menu and `FileNode`

**Files:**
- Modify: `src/components/nodes/node-context-menu.tsx`
- Modify: `src/components/nodes/file-node.tsx`

- [ ] **Step 1: Update `NodeContextMenu` to accept `onAddReferenceImage`**

```tsx
// src/components/nodes/node-context-menu.tsx
"use client";

import { Copy, ImagePlus, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type Props = {
  children: React.ReactNode;
  onDuplicate: () => void;
  onDelete?: () => void;
  onAddReferenceImage?: () => void;
};

export function NodeContextMenu({ children, onDuplicate, onDelete, onAddReferenceImage }: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 size-3.5" strokeWidth={1.5} />
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        {onAddReferenceImage && (
          <ContextMenuItem onClick={onAddReferenceImage}>
            <ImagePlus className="mr-2 size-3.5" strokeWidth={1.5} />
            Add Reference Image
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

- [ ] **Step 2: Wire `useReferenceImagePicker` into `FileNode`**

At the top of `FileNode`, add:

```tsx
import { useReferenceImagePicker } from "@/hooks/use-reference-image-picker";
import { ReferenceImagePickerDialog } from "@/components/canvas/reference-image-picker-dialog";
```

Inside `FileNode`, get `canvasId` from the canvas store (it's on the store as `canvasId`):

```tsx
const canvasId = useCanvasStore((s) => s.canvasId);
const { open, setOpen, openPicker, handleAdd } = useReferenceImagePicker(canvasId);
```

Pass position to openPicker using the node's position. In `@xyflow/react`, node position is available via `positionAbsoluteX` / `positionAbsoluteY` on `NodeProps`, or via `useNodeId` + store lookup. The simplest approach is to destructure `positionAbsoluteX` and `positionAbsoluteY` from `NodeProps`:

```tsx
export function FileNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps) {
  // ...existing code...
  const { open, setOpen, openPicker, handleAdd } = useReferenceImagePicker(canvasId);

  // In the NodeContextMenu:
  return (
    <>
      <NodeContextMenu
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onAddReferenceImage={() => openPicker({ x: positionAbsoluteX, y: positionAbsoluteY })}
      >
        {/* ...existing node JSX... */}
      </NodeContextMenu>

      <ReferenceImagePickerDialog
        canvasId={canvasId}
        open={open}
        onOpenChange={setOpen}
        onAdd={handleAdd}
      />
    </>
  );
}
```

- [ ] **Step 3: Check that `canvasId` is on the canvas store**

Run:
```bash
grep -n "canvasId" src/lib/canvas-store.ts | head -20
```

If not present, find how the canvas id is accessed (it may be on the store as `id` or passed via context). Adjust accordingly.

- [ ] **Step 4: Start dev server and verify**

```bash
cd creativeos-mvp && npm run dev
```

1. Open a canvas with at least one node
2. Right-click a file node → confirm "Add Reference Image" appears in the context menu
3. Click it → confirm the dialog opens with two tabs (Drive, Generated)
4. Switch between tabs — no errors in console
5. Select an image → confirm footer count updates
6. Click "Add 1 image" → confirm a file node spawns near the right-clicked node

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/node-context-menu.tsx \
        src/components/nodes/file-node.tsx
git commit -m "feat: wire Add Reference Image to FileNode context menu and dialog"
```

---

## Task 13: Add "Add Reference Image" to all other node types

The context menu is used by every node type. We want the option available on all nodes, not just file nodes. Move the `useReferenceImagePicker` hook call to each node that uses `NodeContextMenu`.

- [ ] **Step 1: Find all nodes that use `NodeContextMenu`**

```bash
grep -rl "NodeContextMenu" src/components/nodes/
```

- [ ] **Step 2: For each node file found, add the same wiring as Task 12 Step 2**

The pattern is identical for each node:
1. Import `useReferenceImagePicker` and `ReferenceImagePickerDialog`
2. Get `canvasId` from store
3. Destructure `{ open, setOpen, openPicker, handleAdd }` from the hook
4. Destructure `positionAbsoluteX, positionAbsoluteY` from `NodeProps`
5. Pass `onAddReferenceImage` to `NodeContextMenu`
6. Render `<ReferenceImagePickerDialog>` as a sibling (wrapped in a fragment)

- [ ] **Step 3: Verify on each node type in dev**

Right-click each node type and confirm "Add Reference Image" appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/
git commit -m "feat: Add Reference Image context menu item on all node types"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| Context menu entry point | Task 12, 13 |
| Dialog shell (two-panel, tabs, footer) | Task 10, 9, 5 |
| Image card with checkbox | Task 3 |
| Image grid + search + states | Task 4 |
| Generated images tab (Supabase query) | Task 1, 6 |
| Drive tab (custom browser, folder nav, pagination) | Task 2, 7, 8 |
| Node spawn near right-clicked node (grid layout) | Task 11 |
| Drive provenance fields on spawned node | Task 11 |
| Generation traceability (`meta.sourceGenerationId`) | Task 11 |
| Yuvabe design system (shadow-card, primary ring, Lucide 1.5 stroke) | Task 3, 4, 5, 9 |
| shadcn primitives only (Button, Input, Dialog) | All tasks |

**No gaps found.**

**Placeholder scan:** No TBDs, no "handle edge cases" vagueness, all code is complete.

**Type consistency:**
- `SelectedImage` defined in Task 10 (`reference-image-picker-dialog.tsx`), imported by Task 11
- `GridImage` defined in Task 4 (`reference-image-grid.tsx`), imported by Tasks 6, 8
- `CanvasGenerationItem` defined in Task 1 (API route), imported by Task 6
- `DriveFilesResponse` defined in Task 2 (API route), imported by Task 8
- `FolderCrumb` defined in Task 7, imported by Task 8
- `PickerTab` defined in Task 9, imported by Task 10
- `onToggle` signature: `ReferenceImageGrid` takes `(id: string) => void`; browsers wrap this to pass `SelectedImage` up to the dialog — consistent across Tasks 8, 6, 10
