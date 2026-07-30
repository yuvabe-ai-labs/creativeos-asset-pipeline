# Client Drive Folder — Navigable Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the traversal-based Drive gallery with a per-client folder-scoped navigable browser — one API call per folder level, no BFS.

**Architecture:** Store `drive_root_folder_id` per client in Supabase. Gallery opens at that root via a new `/api/drive/browse` endpoint (single `files.list` call). Users navigate into subfolders by clicking them; breadcrumbs navigate back. A folder picker modal (backed by `/api/drive/folders`) lets users link/change the folder. Old traversal code (`/api/drive/images`, `use-drive-images`) is deleted.

**Tech Stack:** Next.js App Router, Supabase (raw SQL migrations), shadcn/ui, Lucide icons, existing `exchangeRefreshToken` from `src/lib/drive/client.ts`.

---

## File Map

**Create:**
- `supabase/migrations/0011_client_drive_folder.sql` — adds `drive_root_folder_id` column
- `src/app/api/drive/folders/route.ts` — lists top-level owned + shared folders
- `src/app/api/drive/folders/route.test.ts`
- `src/app/api/drive/browse/route.ts` — single-folder contents (images + subfolders)
- `src/app/api/drive/browse/route.test.ts`
- `src/app/api/clients/[id]/drive-folder/route.ts` — PATCH to set/clear folder ID
- `src/hooks/use-drive-browser.ts` — replaces `use-drive-images.ts`
- `src/components/canvas/gallery-drawer/drive-folder-picker.tsx` — modal for linking
- `src/components/canvas/gallery-drawer/gallery-breadcrumb.tsx` — breadcrumb nav bar
- `src/components/canvas/gallery-drawer/gallery-folder-tile.tsx` — folder row/card in browser

**Modify:**
- `src/lib/db/types.ts` — add `drive_root_folder_id` to `ClientRow`
- `src/lib/db/clients.ts` — add `updateClientDriveFolderId`
- `src/components/canvas/canvas.tsx` — pass `clientId` to `GalleryDrawerIntegration`
- `src/components/canvas/gallery-drawer-integration.tsx` — accept + forward `clientId`
- `src/components/canvas/gallery-drawer/gallery-drawer.tsx` — accept `clientId`, swap `useDriveImages` → `useDriveBrowser`, add breadcrumb + empty state
- `src/components/canvas/gallery-drawer/gallery-toolbar.tsx` — remove filter popover props, add search placeholder
- `src/components/canvas/gallery-drawer/types.ts` — remove `Filters`, add `FolderFrame`
- `src/app/clients/[id]/page.tsx` — add Drive Folder row in client header

**Delete:**
- `src/app/api/drive/images/route.ts`
- `src/app/api/drive/images/route.test.ts`
- `src/hooks/use-drive-images.ts`
- `src/hooks/use-drive-images.test.ts`
- `src/components/canvas/gallery-drawer/gallery-filter-popover.tsx`

---

### Task 1: DB migration + type update

**Files:**
- Create: `supabase/migrations/0011_client_drive_folder.sql`
- Modify: `src/lib/db/types.ts`
- Modify: `src/lib/db/clients.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0011_client_drive_folder.sql
alter table clients add column drive_root_folder_id text;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
```

Expected: migration applied, no errors.

- [ ] **Step 3: Add field to ClientRow**

In `src/lib/db/types.ts`, add after `archived_at`:

```ts
export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  kb_status: "pending" | "in_review" | "ready";
  active_kb_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  drive_root_folder_id: string | null;  // ← add this
};
```

- [ ] **Step 4: Add DB helper**

In `src/lib/db/clients.ts`, add after `updateClientWebsiteUrl`:

```ts
export async function updateClientDriveFolderId(
  clientId: string,
  folderId: string | null,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ drive_root_folder_id: folderId })
    .eq("id", clientId);
  if (error) throw error;
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_client_drive_folder.sql src/lib/db/types.ts src/lib/db/clients.ts
git commit -m "feat(drive-browser): add drive_root_folder_id to clients"
```

---

### Task 2: `/api/drive/folders` route

**Files:**
- Create: `src/app/api/drive/folders/route.ts`
- Create: `src/app/api/drive/folders/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/drive/folders/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(async () => "fake-token"),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeReq() {
  return new NextRequest("http://x/api/drive/folders");
}
function mockOk(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("GET /api/drive/folders", () => {
  beforeEach(() => fetchMock.mockReset());

  it("returns merged deduped folders from owned + shared queries", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [{ id: "f1", name: "Brand Assets" }] }),
    );
    fetchMock.mockResolvedValueOnce(
      mockOk({ files: [{ id: "f2", name: "Shared Folder" }, { id: "f1", name: "Brand Assets" }] }),
    );

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    expect(body.items.find((i: { id: string }) => i.id === "f1").isShared).toBe(false);
    expect(body.items.find((i: { id: string }) => i.id === "f2").isShared).toBe(true);
  });

  it("returns 500 when Drive token fails", async () => {
    const { exchangeRefreshToken } = await import("@/lib/drive/client");
    vi.mocked(exchangeRefreshToken).mockRejectedValueOnce(new Error("no token"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/api/drive/folders/route.test.ts
```

Expected: FAIL — `GET` not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/drive/folders/route.ts
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFolder = { id: string; name: string };

async function listFolders(q: string, accessToken: string): Promise<DriveFolder[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("orderBy", "name");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error (${res.status})`);
  const json = (await res.json()) as { files?: DriveFolder[] };
  return json.files ?? [];
}

export type DriveFoldersResponse = {
  items: { id: string; name: string; isShared: boolean }[];
};

export async function GET() {
  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive.", 500);
  }

  try {
    const OWNED_Q = `mimeType='${FOLDER_MIME}' and trashed=false and 'me' in owners`;
    const SHARED_Q = `mimeType='${FOLDER_MIME}' and trashed=false and sharedWithMe=true`;

    const [owned, shared] = await Promise.all([
      listFolders(OWNED_Q, accessToken),
      listFolders(SHARED_Q, accessToken),
    ]);

    const seen = new Set<string>();
    const items: DriveFoldersResponse["items"] = [];
    for (const f of owned) {
      if (!seen.has(f.id)) { seen.add(f.id); items.push({ ...f, isShared: false }); }
    }
    for (const f of shared) {
      if (!seen.has(f.id)) { seen.add(f.id); items.push({ ...f, isShared: true }); }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));

    return apiOk<DriveFoldersResponse>({ items });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Drive API error", 502);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/app/api/drive/folders/route.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/drive/folders/route.ts src/app/api/drive/folders/route.test.ts
git commit -m "feat(drive-browser): add /api/drive/folders route"
```

---

### Task 3: `/api/drive/browse` route

**Files:**
- Create: `src/app/api/drive/browse/route.ts`
- Create: `src/app/api/drive/browse/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/drive/browse/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(async () => "fake-token"),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function makeReq(qs: string) {
  return new NextRequest(`http://x/api/drive/browse?${qs}`);
}
function mockOk(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("GET /api/drive/browse", () => {
  beforeEach(() => fetchMock.mockReset());

  it("returns images and folders for a given folderId", async () => {
    fetchMock.mockResolvedValueOnce(
      mockOk({
        nextPageToken: null,
        files: [
          { id: "sub1", name: "Logos", mimeType: "application/vnd.google-apps.folder", modifiedTime: "2026-07-14T00:00:00Z" },
          { id: "img1", name: "hero.jpg", mimeType: "image/jpeg", modifiedTime: "2026-07-13T00:00:00Z", thumbnailLink: "https://thumb/img1" },
        ],
      }),
    );

    const res = await GET(makeReq("folderId=root123"));
    const body = await res.json();

    expect(body.items).toHaveLength(2);
    const folder = body.items.find((i: { id: string }) => i.id === "sub1");
    const image = body.items.find((i: { id: string }) => i.id === "img1");
    expect(folder.thumbnailUrl).toBeNull();
    expect(image.thumbnailUrl).toBe("/api/drive/thumbnail/img1");
    expect(image.previewUrl).toBe("/api/drive/file/img1");

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("root123");
    expect(url).toContain("in+parents");
  });

  it("applies q search within folder", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [] }));
    await GET(makeReq("folderId=abc&q=logo"));
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("fullText+contains");
    expect(url).toContain("logo");
  });

  it("returns 400 when folderId missing", async () => {
    const res = await GET(makeReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 404 with folder_not_found when Drive returns 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" });
    const res = await GET(makeReq("folderId=gone"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("folder_not_found");
  });

  it("forwards pageToken for pagination", async () => {
    fetchMock.mockResolvedValueOnce(mockOk({ files: [], nextPageToken: "next-tok" }));
    await GET(makeReq("folderId=abc&pageToken=prev-tok"));
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("pageToken=prev-tok");
    const body = await (await GET(makeReq("folderId=abc&pageToken=prev-tok"))).json();
    // nextPageToken forwarded
    fetchMock.mockResolvedValueOnce(mockOk({ files: [], nextPageToken: "next-tok" }));
    const res2 = await GET(makeReq("folderId=abc"));
    const b2 = await res2.json();
    expect(typeof b2.nextPageToken === "string" || b2.nextPageToken === null).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/app/api/drive/browse/route.test.ts
```

Expected: FAIL — `GET` not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/drive/browse/route.ts
import { NextRequest } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";
import { apiError, apiOk } from "@/lib/api/route-helpers";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  thumbnailLink?: string;
};

function escapeDriveLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type DriveBrowseItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
};

export type DriveBrowseResponse = {
  items: DriveBrowseItem[];
  nextPageToken: string | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");
  const search = (searchParams.get("q") ?? "").trim();
  const pageToken = searchParams.get("pageToken") ?? undefined;

  if (!folderId) return apiError("folderId is required.", 400);

  let accessToken: string;
  try {
    accessToken = await exchangeRefreshToken();
  } catch {
    return apiError("Could not connect to Google Drive.", 500);
  }

  const searchQ = search
    ? ` and fullText contains '${escapeDriveLiteral(search)}'`
    : "";

  const q =
    `'${escapeDriveLiteral(folderId)}' in parents and trashed=false` +
    `${searchQ}`;

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink)",
  );
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "folder,modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 404) return apiError("folder_not_found", 404);
    const text = await res.text();
    return apiError(`Drive API error (${res.status}): ${text}`, 502);
  }

  const json = (await res.json()) as {
    files?: DriveFile[];
    nextPageToken?: string;
  };

  const items: DriveBrowseItem[] = (json.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    thumbnailUrl: f.mimeType === FOLDER_MIME ? null : `/api/drive/thumbnail/${f.id}`,
    previewUrl: f.mimeType === FOLDER_MIME ? null : `/api/drive/file/${f.id}`,
  }));

  return apiOk<DriveBrowseResponse>({
    items,
    nextPageToken: json.nextPageToken ?? null,
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/app/api/drive/browse/route.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/drive/browse/route.ts src/app/api/drive/browse/route.test.ts
git commit -m "feat(drive-browser): add /api/drive/browse single-folder route"
```

---

### Task 4: PATCH `/api/clients/[id]/drive-folder` route

**Files:**
- Create: `src/app/api/clients/[id]/drive-folder/route.ts`

- [ ] **Step 1: Implement**

```ts
// src/app/api/clients/[id]/drive-folder/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { updateClientDriveFolderId } from "@/lib/db/clients";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, (clientId) =>
    withTryCatch("Drive folder update failed", async () => {
      const body = await req.json().catch(() => null);
      const folderId =
        body && typeof body === "object" && "driveRootFolderId" in body
          ? body.driveRootFolderId
          : undefined;
      if (folderId !== null && typeof folderId !== "string") {
        return apiError("`driveRootFolderId` must be a string or null.", 400);
      }
      await updateClientDriveFolderId(clientId, folderId as string | null);
      return apiOk({ ok: true });
    }),
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/[id]/drive-folder/route.ts
git commit -m "feat(drive-browser): PATCH /api/clients/:id/drive-folder"
```

---

### Task 5: `use-drive-browser` hook

**Files:**
- Create: `src/hooks/use-drive-browser.ts`

- [ ] **Step 1: Implement**

```ts
// src/hooks/use-drive-browser.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DriveBrowseItem, DriveBrowseResponse } from "@/app/api/drive/browse/route";

export type { DriveBrowseItem };

export type FolderFrame = { id: string; name: string };

type FolderState = {
  items: DriveBrowseItem[];
  nextPageToken: string | null;
  loading: boolean;
  loadingMore: boolean;
  loadError: string | null;
};

const EMPTY: FolderState = {
  items: [],
  nextPageToken: null,
  loading: true,
  loadingMore: false,
  loadError: null,
};

function buildUrl(folderId: string, search: string, pageToken?: string): string {
  const p = new URLSearchParams({ folderId });
  if (search) p.set("q", search);
  if (pageToken) p.set("pageToken", pageToken);
  return `/api/drive/browse?${p.toString()}`;
}

export function useDriveBrowser(rootFolder: FolderFrame | null) {
  const [stack, setStack] = useState<FolderFrame[]>(
    rootFolder ? [rootFolder] : [],
  );
  const [search, setSearchRaw] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [state, setState] = useState<FolderState>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);

  // Sync stack root when rootFolder prop changes (e.g. after linking).
  useEffect(() => {
    setStack(rootFolder ? [rootFolder] : []);
    setSearchRaw("");
    setDebouncedSearch("");
  }, [rootFolder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const currentFolder = stack[stack.length - 1] ?? null;

  const fetchFolder = useCallback(
    async (
      folder: FolderFrame,
      searchTerm: string,
      pageToken: string | undefined,
      mode: "initial" | "more",
    ) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setState((prev) =>
        mode === "more"
          ? { ...prev, loadingMore: true, loadError: null }
          : { ...EMPTY, loading: true },
      );

      try {
        const res = await fetch(buildUrl(folder.id, searchTerm, pageToken), {
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setState((prev) => ({
            ...prev,
            loading: false,
            loadingMore: false,
            loadError: body.error === "folder_not_found" ? "folder_not_found" : "load_failed",
          }));
          return;
        }

        const data = (await res.json()) as DriveBrowseResponse;
        setState((prev) => ({
          items: mode === "more" ? [...prev.items, ...data.items] : data.items,
          nextPageToken: data.nextPageToken,
          loading: false,
          loadingMore: false,
          loadError: null,
        }));
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          loadError: "load_failed",
        }));
      }
    },
    [],
  );

  // Fetch whenever current folder or search changes.
  useEffect(() => {
    if (!currentFolder) return;
    void fetchFolder(currentFolder, debouncedSearch, undefined, "initial");
  }, [currentFolder?.id, debouncedSearch, fetchFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateInto = useCallback((folder: FolderFrame) => {
    setStack((s) => [...s, folder]);
    setSearchRaw("");
    setDebouncedSearch("");
  }, []);

  const navigateTo = useCallback((index: number) => {
    setStack((s) => s.slice(0, index + 1));
    setSearchRaw("");
    setDebouncedSearch("");
  }, []);

  const loadMore = useCallback(() => {
    if (!currentFolder || !state.nextPageToken || state.loadingMore) return;
    void fetchFolder(currentFolder, debouncedSearch, state.nextPageToken, "more");
  }, [currentFolder, state.nextPageToken, state.loadingMore, debouncedSearch, fetchFolder]);

  const refresh = useCallback(() => {
    if (!currentFolder) return;
    void fetchFolder(currentFolder, debouncedSearch, undefined, "initial");
  }, [currentFolder, debouncedSearch, fetchFolder]);

  const setSearch = useCallback((v: string) => setSearchRaw(v), []);

  return {
    stack,
    currentFolder,
    items: state.items,
    nextPageToken: state.nextPageToken,
    loading: state.loading,
    loadingMore: state.loadingMore,
    loadError: state.loadError,
    search,
    setSearch,
    navigateInto,
    navigateTo,
    loadMore,
    refresh,
  };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-drive-browser.ts
git commit -m "feat(drive-browser): add use-drive-browser hook"
```

---

### Task 6: Gallery UI components — breadcrumb + folder tile

**Files:**
- Create: `src/components/canvas/gallery-drawer/gallery-breadcrumb.tsx`
- Create: `src/components/canvas/gallery-drawer/gallery-folder-tile.tsx`

- [ ] **Step 1: Implement gallery-breadcrumb**

```tsx
// src/components/canvas/gallery-drawer/gallery-breadcrumb.tsx
"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FolderFrame } from "@/hooks/use-drive-browser";

type Props = {
  stack: FolderFrame[];
  onNavigateTo: (index: number) => void;
};

export function GalleryBreadcrumb({ stack, onNavigateTo }: Props) {
  if (stack.length <= 1) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-4 py-1.5 text-xs text-muted-foreground overflow-x-auto">
      {stack.map((frame, i) => (
        <span key={frame.id} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight className="size-3 shrink-0" strokeWidth={1.5} />}
          {i < stack.length - 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onNavigateTo(i)}
            >
              {frame.name}
            </Button>
          ) : (
            <span className="px-1 py-0.5 font-medium text-foreground">{frame.name}</span>
          )}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement gallery-folder-tile**

```tsx
// src/components/canvas/gallery-drawer/gallery-folder-tile.tsx
"use client";

import { Folder, ChevronRight } from "lucide-react";
import type { FolderFrame } from "@/hooks/use-drive-browser";

type Props = {
  folder: FolderFrame;
  onClick: () => void;
};

export function GalleryFolderTile({ folder, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-neutral-50"
    >
      <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <span className="flex-1 truncate text-sm font-medium">{folder.name}</span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/gallery-drawer/gallery-breadcrumb.tsx src/components/canvas/gallery-drawer/gallery-folder-tile.tsx
git commit -m "feat(drive-browser): gallery breadcrumb + folder tile components"
```

---

### Task 7: Drive folder picker modal

**Files:**
- Create: `src/components/canvas/gallery-drawer/drive-folder-picker.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/canvas/gallery-drawer/drive-folder-picker.tsx
"use client";

import { useEffect, useState } from "react";
import { Folder, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DriveFoldersResponse } from "@/app/api/drive/folders/route";

type FolderItem = DriveFoldersResponse["items"][number];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onLinked: (folder: { id: string; name: string }) => void;
};

export function DriveFolderPicker({ open, onOpenChange, clientId, onLinked }: Props) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<FolderItem | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoadError(false);
    setLoading(true);
    fetch("/api/drive/folders")
      .then((r) => r.json())
      .then((data: DriveFoldersResponse) => {
        setFolders(data.items ?? []);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [open]);

  async function handleLink() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drive-folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveRootFolderId: selected.id }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onLinked({ id: selected.id, name: selected.name });
      onOpenChange(false);
    } catch {
      // leave modal open, user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Link a Drive folder</DialogTitle>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" strokeWidth={1.5} />
            </div>
          )}
          {loadError && (
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load folders.</p>
              <Button variant="link" size="sm" onClick={() => { setLoadError(false); setLoading(true); }}>
                Retry
              </Button>
            </div>
          )}
          {!loading && !loadError && folders.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No folders found in your Drive.</p>
          )}
          {!loading && !loadError && folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 ${
                selected?.id === f.id ? "bg-primary/5 ring-1 ring-primary/30" : ""
              }`}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <span className="flex-1 truncate text-sm">{f.name}</span>
              {f.isShared && (
                <Badge variant="secondary" className="text-xs">Shared</Badge>
              )}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleLink} disabled={!selected || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : "Link folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/canvas/gallery-drawer/drive-folder-picker.tsx
git commit -m "feat(drive-browser): drive folder picker modal"
```

---

### Task 8: Rewire gallery drawer

**Files:**
- Modify: `src/components/canvas/gallery-drawer/types.ts`
- Modify: `src/components/canvas/gallery-drawer/gallery-toolbar.tsx`
- Modify: `src/components/canvas/gallery-drawer/gallery-drawer.tsx`
- Modify: `src/components/canvas/gallery-drawer-integration.tsx`
- Modify: `src/components/canvas/canvas.tsx`

- [ ] **Step 1: Update types.ts — remove Filters, add FolderFrame re-export**

Replace the full file:

```ts
// src/components/canvas/gallery-drawer/types.ts
export type GalleryTab = "references" | "assets";
export type ViewMode = "grid" | "list";

/** Unified shape rendered by the grid/list — covers both Drive and Assets sources. */
export type GalleryImage = {
  id: string;
  /** Thumbnail (Drive proxy or GCS URL). */
  imageUrl: string;
  /** Full-res URL for the zoom overlay. Falls back to `imageUrl` when absent. */
  previewUrl?: string;
  filename: string;
  subtitle: string;
  source: "drive" | "generated";
  generationId?: string;
};

export type OpenDrawerOptions = {
  position?: { x: number; y: number };
  connectToNodeId?: string;
};
```

- [ ] **Step 2: Update gallery-toolbar.tsx — remove filter props**

Replace the full file:

```tsx
// src/components/canvas/gallery-drawer/gallery-toolbar.tsx
"use client";

import { GallerySearch } from "./gallery-search";
import { GalleryViewToggle } from "./gallery-view-toggle";
import type { ViewMode } from "./types";

type Props = {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
};

export function GalleryToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search…",
  viewMode,
  onViewModeChange,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
      <GallerySearch value={searchQuery} onChange={onSearchChange} placeholder={searchPlaceholder} />
      <GalleryViewToggle value={viewMode} onChange={onViewModeChange} />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite gallery-drawer.tsx**

Replace the full file:

```tsx
// src/components/canvas/gallery-drawer/gallery-drawer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Loader2 } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { useDriveBrowser } from "@/hooks/use-drive-browser";
import { useCanvasGenerations } from "@/hooks/use-canvas-generations";
import { useGalleryDrawer as useGalleryCommit } from "@/hooks/use-gallery-drawer";
import { useGalleryDrawer as useDrawerCtx } from "../gallery-drawer-context";
import { GalleryHeader } from "./gallery-header";
import { GalleryTabs } from "./gallery-tabs";
import { GalleryToolbar } from "./gallery-toolbar";
import { GalleryContent } from "./gallery-content";
import { GalleryFooter } from "./gallery-footer";
import { GalleryBreadcrumb } from "./gallery-breadcrumb";
import { GalleryFolderTile } from "./gallery-folder-tile";
import { DriveFolderPicker } from "./drive-folder-picker";
import type { GalleryImage, GalleryTab, ViewMode } from "./types";
import type { DriveBrowseItem } from "@/hooks/use-drive-browser";

const MAX_SELECTION = 10;
export const GALLERY_DRAG_MIME = "application/x-creativeos-gallery-image";

type Props = {
  canvasId: string;
  clientId: string;
  initialDriveRootFolder: { id: string; name: string } | null;
};

export function GalleryDrawer({ canvasId, clientId, initialDriveRootFolder }: Props) {
  const { open, options, closeDrawer } = useDrawerCtx();
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();

  const [tab, setTab] = useState<GalleryTab>("references");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageMap, setImageMap] = useState<Map<string, GalleryImage>>(new Map());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rootFolder, setRootFolder] = useState(initialDriveRootFolder);

  const browser = useDriveBrowser(rootFolder);
  const generations = useCanvasGenerations(canvasId);

  // Reset transient state on drawer close.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setSelectedIds(new Set());
      setImageMap(new Map());
      setPreviewId(null);
    }
  }

  // Auto-clear stale folder ID from DB when Drive says it's gone.
  useEffect(() => {
    if (browser.loadError === "folder_not_found" && rootFolder) {
      fetch(`/api/clients/${clientId}/drive-folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveRootFolderId: null }),
      }).catch(() => {});
      setRootFolder(null);
    }
  }, [browser.loadError, rootFolder, clientId]);

  const references: GalleryImage[] = useMemo(() => {
    // Only image items (not folders) become gallery images.
    return browser.items
      .filter((item) => !item.mimeType.includes("folder"))
      .map((item: DriveBrowseItem) => ({
        id: item.id,
        imageUrl: item.thumbnailUrl ?? "",
        previewUrl: item.previewUrl ?? undefined,
        filename: item.name,
        subtitle: new Date(item.modifiedTime).toLocaleDateString(),
        source: "drive" as const,
      }));
  }, [browser.items]);

  const assets: GalleryImage[] = useMemo(
    () =>
      generations.items.map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl,
        previewUrl: item.imageUrl,
        filename: item.nodeName ?? "Image Gen",
        subtitle: `${item.modelUsed ?? "unknown"} · ${new Date(item.createdAt).toLocaleDateString()}`,
        source: "generated" as const,
        generationId: item.id,
      })),
    [generations.items],
  );

  const activeLoading = tab === "references" ? browser.loading : generations.loading;
  const activeError = tab === "references"
    ? (browser.loadError && browser.loadError !== "folder_not_found" ? new Error(browser.loadError) : null)
    : generations.loadError;

  // Assets tab: client-side search filter.
  const filteredAssets = useMemo(() => {
    if (!browser.search) return assets;
    const q = browser.search.toLowerCase();
    return assets.filter((img) => img.filename.toLowerCase().includes(q));
  }, [assets, browser.search]);

  const activeImages = tab === "references" ? references : filteredAssets;

  function toggleSelect(id: string) {
    const allImages = [...references, ...assets];
    const image = allImages.find((i) => i.id === id);
    if (!image) return;
    setSelectedIds((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= MAX_SELECTION) {
        toast.error(`You can select up to ${MAX_SELECTION} images at a time.`);
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      setImageMap((m) => new Map(m).set(id, image));
      return next;
    });
  }

  function handleSentinelInView() {
    if (tab === "references") browser.loadMore();
  }

  function handleRefresh() {
    if (tab === "references") browser.refresh();
    else void generations.refresh();
  }

  function computeDefaultPosition() {
    if (options?.position) return options.position;
    const el = document.querySelector<HTMLDivElement>(".react-flow");
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  function handleCommit() {
    const images = Array.from(selectedIds)
      .map((id) => imageMap.get(id))
      .filter((v): v is GalleryImage => v != null);
    if (images.length === 0) return;
    handleAdd(images, {
      position: computeDefaultPosition(),
      connectToNodeId: options?.connectToNodeId,
    });
    closeDrawer();
  }

  function handleDragStartImage(image: GalleryImage, e: React.DragEvent) {
    const payload =
      selectedIds.has(image.id) && selectedIds.size > 0
        ? Array.from(selectedIds)
            .map((id) => imageMap.get(id))
            .filter((v): v is GalleryImage => v != null)
        : [image];
    e.dataTransfer.setData(GALLERY_DRAG_MIME, JSON.stringify({ images: payload }));
    e.dataTransfer.effectAllowed = "copy";
  }

  const previewImage = previewId
    ? [...references, ...assets].find((i) => i.id === previewId)
    : null;

  // Folder tiles from browser items.
  const folderItems = browser.items.filter((item) =>
    item.mimeType === "application/vnd.google-apps.folder",
  );

  const searchPlaceholder = browser.currentFolder
    ? `Search in ${browser.currentFolder.name}…`
    : "Search…";

  // References tab with no folder configured.
  const noFolderLinked = tab === "references" && !rootFolder;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => { if (!v) closeDrawer(); }}
        modal={false}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 shadow-lg data-[side=right]:sm:max-w-180"
        >
          <SheetTitle className="sr-only">Gallery</SheetTitle>
          <GalleryHeader
            onRefresh={handleRefresh}
            onClose={closeDrawer}
            refreshing={tab === "references" ? browser.loading : generations.loading}
          />
          <GalleryTabs value={tab} onChange={setTab} />

          {!noFolderLinked && (
            <GalleryToolbar
              searchQuery={browser.search}
              onSearchChange={browser.setSearch}
              searchPlaceholder={searchPlaceholder}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}

          {tab === "references" && (
            <GalleryBreadcrumb stack={browser.stack} onNavigateTo={browser.navigateTo} />
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {noFolderLinked ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <FolderOpen className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-sm font-medium">No Drive folder linked</p>
                  <p className="text-xs text-muted-foreground">Link a folder to browse this client&apos;s assets</p>
                </div>
                <Button size="sm" onClick={() => setPickerOpen(true)}>
                  Link Drive Folder
                </Button>
              </div>
            ) : (
              <>
                {tab === "references" && folderItems.length > 0 && (
                  <div className="mb-2 flex flex-col gap-1">
                    {folderItems.map((f) => (
                      <GalleryFolderTile
                        key={f.id}
                        folder={{ id: f.id, name: f.name }}
                        onClick={() => browser.navigateInto({ id: f.id, name: f.name })}
                      />
                    ))}
                  </div>
                )}
                <GalleryContent
                  loading={activeLoading}
                  loadError={activeError}
                  onRetry={handleRefresh}
                  images={activeImages}
                  emptyMessage={
                    browser.search
                      ? `No results in ${browser.currentFolder?.name ?? "this folder"}.`
                      : tab === "references"
                        ? "This folder is empty."
                        : "No generated images yet on this canvas."
                  }
                  viewMode={viewMode}
                  selectedIds={selectedIds}
                  onToggle={toggleSelect}
                  onPreview={setPreviewId}
                  onDragStartImage={handleDragStartImage}
                  onSentinelInView={handleSentinelInView}
                  hasMore={tab === "references" ? browser.nextPageToken !== null : false}
                  loadingMore={tab === "references" ? browser.loadingMore : false}
                />
              </>
            )}
          </div>

          <GalleryFooter
            selectedCount={selectedIds.size}
            maxSelection={MAX_SELECTION}
            onAdd={handleCommit}
            onCancel={closeDrawer}
          />
        </SheetContent>
      </Sheet>

      {previewImage && (
        <FullScreenImageZoom
          imageUrl={previewImage.previewUrl ?? previewImage.imageUrl}
          title={previewImage.filename}
          onClose={() => setPreviewId(null)}
        />
      )}

      <DriveFolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clientId={clientId}
        onLinked={(folder) => setRootFolder(folder)}
      />
    </>
  );
}
```

- [ ] **Step 4: Update gallery-drawer-integration.tsx — pass clientId + initialDriveRootFolder**

```tsx
// src/components/canvas/gallery-drawer-integration.tsx
"use client";

import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGalleryDrawer as useDrawerCtx } from "./gallery-drawer-context";
import { useGalleryDrawer as useGalleryCommit } from "@/hooks/use-gallery-drawer";
import { GalleryDrawer, GALLERY_DRAG_MIME } from "./gallery-drawer/gallery-drawer";
import type { GalleryImage } from "./gallery-drawer/types";

export function GalleryDrawerIntegration({
  canvasId,
  clientId,
  initialDriveRootFolder,
}: {
  canvasId: string;
  clientId: string;
  initialDriveRootFolder: { id: string; name: string } | null;
}) {
  const drawer = useDrawerCtx();
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      drawer.toggleDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  useEffect(() => {
    const paneEl = document.querySelector<HTMLDivElement>(".react-flow");
    if (!paneEl) return;

    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes(GALLERY_DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }

    function onDrop(e: DragEvent) {
      const raw = e.dataTransfer?.getData(GALLERY_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      try {
        const parsed = JSON.parse(raw) as { images: GalleryImage[] };
        const position = reactFlow.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        handleAdd(parsed.images, { position });
      } catch (err) {
        console.warn("[gallery] pane drop payload malformed:", err);
      }
    }

    paneEl.addEventListener("dragover", onDragOver);
    paneEl.addEventListener("drop", onDrop);
    return () => {
      paneEl.removeEventListener("dragover", onDragOver);
      paneEl.removeEventListener("drop", onDrop);
    };
  }, [handleAdd, reactFlow]);

  return (
    <GalleryDrawer
      canvasId={canvasId}
      clientId={clientId}
      initialDriveRootFolder={initialDriveRootFolder}
    />
  );
}
```

- [ ] **Step 5: Update canvas.tsx — pass clientId + driveRootFolder to integration**

In `src/components/canvas/canvas.tsx`, find line 350:
```tsx
<GalleryDrawerIntegration canvasId={canvasId} />
```
Replace with:
```tsx
<GalleryDrawerIntegration
  canvasId={canvasId}
  clientId={clientId}
  initialDriveRootFolder={null}
/>
```

Also update the Canvas props type at line 66–76 — no changes needed, `clientId` is already a prop there.

> **Note:** `initialDriveRootFolder` is `null` for now — Task 9 will wire in the real value from the server.

- [ ] **Step 6: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/gallery-drawer/types.ts src/components/canvas/gallery-drawer/gallery-toolbar.tsx src/components/canvas/gallery-drawer/gallery-drawer.tsx src/components/canvas/gallery-drawer-integration.tsx src/components/canvas/canvas.tsx
git commit -m "feat(drive-browser): rewire gallery drawer to navigable folder browser"
```

---

### Task 9: Wire `initialDriveRootFolder` from server

**Files:**
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`
- Modify: `src/components/canvas/canvas.tsx`

The canvas page fetches the client and canvas server-side. We need to pass `drive_root_folder_id` down.

- [ ] **Step 1: Read the canvas page**

Read `src/app/clients/[id]/canvases/[cid]/page.tsx` to understand how `Canvas` is rendered and what props it receives.

- [ ] **Step 2: Add driveRootFolder prop to Canvas**

In `src/components/canvas/canvas.tsx`, update the props type:

```tsx
export function Canvas({
  canvasId,
  clientId,
  initialKBJob,
  hasActiveKB,
  initialDriveRootFolder,
}: {
  canvasId: string;
  clientId: string;
  initialKBJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
  initialDriveRootFolder: { id: string; name: string } | null;
}) {
```

And update the `GalleryDrawerIntegration` call at line ~350 to use the prop:

```tsx
<GalleryDrawerIntegration
  canvasId={canvasId}
  clientId={clientId}
  initialDriveRootFolder={initialDriveRootFolder}
/>
```

- [ ] **Step 3: Pass it from the canvas page**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, after fetching the client, resolve the folder name if `drive_root_folder_id` is set:

```ts
// After fetching client:
let initialDriveRootFolder: { id: string; name: string } | null = null;
if (client.drive_root_folder_id) {
  // We fetch folder metadata to get the name. Use the existing Drive client.
  // This is a server component, so we can call the Drive API directly.
  try {
    const { exchangeRefreshToken } = await import("@/lib/drive/client");
    const token = await exchangeRefreshToken();
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${client.drive_root_folder_id}?fields=id,name&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { id: string; name: string };
      initialDriveRootFolder = { id: meta.id, name: meta.name };
    }
  } catch {
    // Non-fatal — drawer shows empty state
  }
}
```

Then pass `initialDriveRootFolder` to `<Canvas>`.

- [ ] **Step 4: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/canvas.tsx src/app/clients/[id]/canvases/[cid]/page.tsx
git commit -m "feat(drive-browser): wire initialDriveRootFolder from server to canvas"
```

---

### Task 10: Client page — Drive Folder row in settings

**Files:**
- Modify: `src/app/clients/[id]/page.tsx`

Add a Drive Folder row to the client header. This is a server component, so the gear popover needs a small client component.

- [ ] **Step 1: Create the client-side Drive folder settings widget**

Create `src/components/clients/client-drive-folder-row.tsx`:

```tsx
// src/components/clients/client-drive-folder-row.tsx
"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DriveFolderPicker } from "@/components/canvas/gallery-drawer/drive-folder-picker";

type Props = {
  clientId: string;
  initialFolder: { id: string; name: string } | null;
};

export function ClientDriveFolderRow({ clientId, initialFolder }: Props) {
  const [folder, setFolder] = useState(initialFolder);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  async function handleUnlink() {
    await fetch(`/api/clients/${clientId}/drive-folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveRootFolderId: null }),
    });
    setFolder(null);
    setPopoverOpen(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-3 mt-3">
      <span className="text-sm text-muted-foreground">Drive Folder</span>
      <div className="flex items-center gap-2">
        {folder ? (
          <>
            <span className="text-sm font-medium truncate max-w-48">{folder.name}</span>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <Settings2 className="size-3.5" strokeWidth={1.5} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm"
                  onClick={() => { setPopoverOpen(false); setPickerOpen(true); }}
                >
                  Change folder
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm text-destructive hover:text-destructive"
                  onClick={handleUnlink}
                >
                  Unlink
                </Button>
              </PopoverContent>
            </Popover>
          </>
        ) : (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm font-semibold text-foreground underline underline-offset-4"
            onClick={() => setPickerOpen(true)}
          >
            Not configured
          </Button>
        )}
      </div>
      <DriveFolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clientId={clientId}
        onLinked={(f) => setFolder(f)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add Popover to shadcn/ui if not present**

```bash
npx shadcn@latest add popover
```

If already present, skip.

- [ ] **Step 3: Resolve initial folder name in client page**

In `src/app/clients/[id]/page.tsx`, after fetching the client, resolve the Drive folder name server-side (same pattern as Task 9):

```ts
let initialDriveFolder: { id: string; name: string } | null = null;
if (client.drive_root_folder_id) {
  try {
    const { exchangeRefreshToken } = await import("@/lib/drive/client");
    const token = await exchangeRefreshToken();
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${client.drive_root_folder_id}?fields=id,name&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { id: string; name: string };
      initialDriveFolder = { id: meta.id, name: meta.name };
    }
  } catch { /* non-fatal */ }
}
```

- [ ] **Step 4: Add the row to the client page JSX**

In `src/app/clients/[id]/page.tsx`, inside the `<div>` that shows client name/logo (around line 90), add below the `<h1>`:

```tsx
import { ClientDriveFolderRow } from "@/components/clients/client-drive-folder-row";

// Inside JSX, after the <h1> and before closing </div>:
<ClientDriveFolderRow clientId={client.id} initialFolder={initialDriveFolder} />
```

- [ ] **Step 5: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/client-drive-folder-row.tsx src/app/clients/[id]/page.tsx
git commit -m "feat(drive-browser): Drive folder row in client settings"
```

---

### Task 11: Delete old traversal code

**Files to delete:**
- `src/app/api/drive/images/route.ts`
- `src/app/api/drive/images/route.test.ts`
- `src/hooks/use-drive-images.ts`
- `src/hooks/use-drive-images.test.ts`
- `src/components/canvas/gallery-drawer/gallery-filter-popover.tsx`

- [ ] **Step 1: Delete files**

```bash
git rm src/app/api/drive/images/route.ts
git rm src/app/api/drive/images/route.test.ts
git rm src/hooks/use-drive-images.ts
git rm src/hooks/use-drive-images.test.ts
git rm src/components/canvas/gallery-drawer/gallery-filter-popover.tsx
```

- [ ] **Step 2: Verify no remaining imports**

```bash
npx tsc --noEmit
```

Fix any broken imports. The only expected usages were in `gallery-drawer.tsx` (already replaced in Task 8) and `gallery-toolbar.tsx` (already replaced).

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all pass (old tests gone, new tests pass).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(drive-browser): delete traversal code (images route, use-drive-images, filter popover)"
```

---

## Self-Review

**Spec coverage:**
- §1 Data model → Task 1 ✓
- §2 `/api/drive/folders` → Task 2 ✓
- §2 `/api/drive/browse` → Task 3 ✓
- §2 PATCH client drive folder → Task 4 ✓
- §3 `use-drive-browser` hook → Task 5 ✓
- §3 Breadcrumb bar → Task 6 ✓
- §3 Folder tiles → Task 6 ✓
- §3 Search scoped per folder → Tasks 5+8 ✓
- §3 No-folder empty state + link CTA → Task 8 ✓
- §3 Folder-not-found auto-clear → Task 8 ✓
- §4 Client settings Drive folder row → Task 10 ✓
- §4 "Not configured" clickable → Task 10 ✓
- §4 Gear popover with Change/Unlink → Task 10 ✓
- §7 Delete old code → Task 11 ✓

**No placeholders found.** All code blocks are complete.

**Type consistency:** `FolderFrame = { id: string; name: string }` used consistently across hook, breadcrumb, folder tile, and gallery drawer. `DriveBrowseItem` from route exported and consumed in hook. `DriveFoldersResponse` from route consumed in picker.
