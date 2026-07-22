# Client Moodboards (Slice A — in-app core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-level Moodboards — named URL-first reference collections surfaced as a Gallery tab, where dragging an item onto the canvas re-hosts it to GCS as a File node.

**Architecture:** Two new Postgres tables (`moodboards`, `moodboard_items`) store only URLs. New API routes do board/item CRUD (nothing is fetched at add time) plus a `POST /api/nodes/[id]/file/from-url` route that mirrors the existing `/file/drive` route to re-host an image server-side **only when it is used**. The Gallery drawer gains a third tab that reuses the existing folder-drilldown, grid, selection, and `handleAdd` commit path.

**Tech Stack:** Next.js (App Router, `force-dynamic` pages), TypeScript, Supabase (Postgres + `@supabase/supabase-js` service-role server client), Google Cloud Storage (via `@/lib/storage`), React 19 + `@xyflow/react`, Base UI shadcn components, Vitest (node env).

**Scope:** This plan is **Slice A only** — the in-app core, fully testable by pasting an image URL into a board. The Chrome capture extension (Slice B) and the deferred increments (thumbnail caching, F6 embeddings) are **out of scope** and get their own later plan. Spec: `docs/superpowers/specs/2026-07-22-client-moodboards-design.md`.

## Global Constraints

- **Controls are shadcn primitives only** (`src/components/ui/*`, Base UI registry) — never raw `<button>`/`<input>`/`<textarea>`; compose via the `render` prop, not `asChild`. (CLAUDE.md)
- **API routes** use `apiError` / `apiOk` — never `NextResponse.json(...)` directly; `withClient` for every route under `src/app/api/clients/[id]/`; `withTryCatch` for any multi-step async / remote-fetch handler. (`docs/api-routes.md`)
- **DB modules** are `import "server-only"`, go through `createServerSupabase()`, use **snake_case** columns, and `throw` on `error`. (matches `src/lib/db/clients.ts`)
- **Migrations** are sequential SQL in `supabase/migrations/`; next number is **0012**; use `gen_random_uuid()`, `references … on delete cascade`, `timestamptz not null default now()`; **no RLS** (auth deferred, D14).
- **Image constraints:** allowed extensions `FILE_NODE_IMAGE_EXTENSIONS` = `{png, jpg, jpeg, webp}`; size cap `FILE_NODE_IMAGE_SIZE_LIMIT` = 10 MB. Import from `@/lib/nodes/file-constants`.
- **Storage:** re-host bytes only via `uploadNodeFile` from `@/lib/storage`; DB rows hold only URLs (D13).
- **Tests:** `npm test` runs `vitest run`. Route handlers are unit-tested by mocking `@/lib/storage`, `@/lib/supabase/server`, `server-only`, and the db module. UI is verified by running the app (`npm run dev`).
- **Endpoint auth:** routes the extension will call (`/api/moodboards/*`) are **open** (D14), matching the existing open `/api/nodes/[id]/file/*` routes.

---

## File Structure

**New files:**
- `supabase/migrations/0012_moodboards.sql` — the two tables + indexes.
- `src/lib/db/moodboards.ts` — typed CRUD query layer (server-only).
- `src/app/api/clients/[id]/moodboards/route.ts` — `GET` (list) + `POST` (create) boards (`withClient`).
- `src/app/api/clients/[id]/moodboards/route.test.ts`
- `src/app/api/moodboards/[id]/route.ts` — `DELETE` board (open).
- `src/app/api/moodboards/[id]/items/route.ts` — `GET` (list) + `POST` (add) items (open).
- `src/app/api/moodboards/[id]/items/route.test.ts`
- `src/app/api/moodboards/[id]/items/[itemId]/route.ts` — `DELETE` item (open).
- `src/app/api/nodes/[id]/file/from-url/route.ts` — re-host-on-use.
- `src/app/api/nodes/[id]/file/from-url/route.test.ts`
- `src/lib/moodboards/filename.ts` + `src/lib/moodboards/filename.test.ts` — `filenameFromUrl` pure helper.
- `src/hooks/use-moodboards.ts` — client hook (fetch boards/items, create/add/remove).
- `src/components/canvas/gallery-drawer/gallery-add-url.tsx` — the add-by-URL input (Slice-A test path).

**Modified files:**
- `src/services/file-node.service.ts` — add `pickFromUrl`.
- `src/components/canvas/gallery-drawer/types.ts` — `GalleryTab` gains `"moodboard"`; `GalleryImage.source` gains `"moodboard"` + `sourceUrl?`.
- `src/components/canvas/gallery-drawer/gallery-tabs.tsx` — add the Moodboards tab.
- `src/hooks/use-gallery-drawer.ts` — `source: "moodboard"` branch in `handleAdd`.
- `src/components/canvas/gallery-drawer/gallery-drawer.tsx` — render the Moodboards tab (board list ↔ board contents + add-by-URL).

---

## Task 1: Schema + data layer

**Files:**
- Create: `supabase/migrations/0012_moodboards.sql`
- Create: `src/lib/db/moodboards.ts`

**Interfaces:**
- Consumes: `createServerSupabase` from `@/lib/supabase/server`.
- Produces (imported by later tasks):
  - `type Moodboard = { id: string; client_id: string; name: string; created_at: string }`
  - `type MoodboardItem = { id: string; moodboard_id: string; image_url: string; source_url: string | null; position: number; added_at: string }`
  - `listMoodboards(clientId: string): Promise<Moodboard[]>`
  - `createMoodboard(clientId: string, name: string): Promise<Moodboard>`
  - `deleteMoodboard(id: string): Promise<void>`
  - `listItems(moodboardId: string): Promise<MoodboardItem[]>`
  - `addItem(moodboardId: string, input: { imageUrl: string; sourceUrl?: string }): Promise<MoodboardItem>`
  - `removeItem(itemId: string): Promise<void>`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0012_moodboards.sql`:

```sql
-- Client-level moodboards: named reference collections (URL-first — rows hold
-- image URLs, never bytes; full-res is re-hosted to GCS only on use). D13/D14.

create table moodboards (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table moodboard_items (
  id           uuid primary key default gen_random_uuid(),
  moodboard_id uuid not null references moodboards(id) on delete cascade,
  image_url    text not null,          -- original image src (e.g. i.pinimg.com/…)
  source_url   text,                   -- provenance page the image was found on
  position     int  not null default 0,
  added_at     timestamptz not null default now()
);

create index moodboards_client_id_idx     on moodboards(client_id);
create index moodboard_items_board_id_idx on moodboard_items(moodboard_id);
```

- [ ] **Step 2: Apply the migration**

Apply it the same way the prior `0001`–`0011` migrations were applied to this project's Supabase database — either paste the file's SQL into the Supabase Dashboard **SQL editor**, or, if you have direct DB access, run:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0012_moodboards.sql
```

- [ ] **Step 3: Verify the tables exist**

Run (SQL editor or psql):

```sql
select column_name, data_type from information_schema.columns
where table_name in ('moodboards','moodboard_items') order by table_name, ordinal_position;
```

Expected: 4 rows for `moodboards` (id, client_id, name, created_at) and 6 for `moodboard_items` (id, moodboard_id, image_url, source_url, position, added_at).

- [ ] **Step 4: Write the db query module**

Create `src/lib/db/moodboards.ts` (mirrors `src/lib/db/clients.ts` conventions):

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type Moodboard = {
  id: string;
  client_id: string;
  name: string;
  created_at: string;
};

export type MoodboardItem = {
  id: string;
  moodboard_id: string;
  image_url: string;
  source_url: string | null;
  position: number;
  added_at: string;
};

export async function listMoodboards(clientId: string): Promise<Moodboard[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Moodboard[];
}

export async function createMoodboard(clientId: string, name: string): Promise<Moodboard> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .insert({ client_id: clientId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Moodboard;
}

export async function deleteMoodboard(id: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("moodboards").delete().eq("id", id);
  if (error) throw error;
}

export async function listItems(moodboardId: string): Promise<MoodboardItem[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("*")
    .eq("moodboard_id", moodboardId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MoodboardItem[];
}

export async function addItem(
  moodboardId: string,
  input: { imageUrl: string; sourceUrl?: string },
): Promise<MoodboardItem> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .insert({ moodboard_id: moodboardId, image_url: input.imageUrl, source_url: input.sourceUrl ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as MoodboardItem;
}

export async function removeItem(itemId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("moodboard_items").delete().eq("id", itemId);
  if (error) throw error;
}
```

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/db/moodboards.ts`
Expected: no errors. (Db modules follow the repo's untested thin-wrapper convention like `clients.ts`; behavior is covered by the route tests in Tasks 2–3 and manual verification.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0012_moodboards.sql src/lib/db/moodboards.ts
git commit -m "feat(moodboards): schema + db query layer"
```

---

## Task 2: Board routes — list & create

**Files:**
- Create: `src/app/api/clients/[id]/moodboards/route.ts`
- Test: `src/app/api/clients/[id]/moodboards/route.test.ts`

**Interfaces:**
- Consumes: `listMoodboards`, `createMoodboard` (Task 1); `withClient`, `apiOk`, `apiError` (`@/lib/api/route-helpers`).
- Produces: `GET /api/clients/[id]/moodboards` → `{ moodboards: Moodboard[] }`; `POST` body `{ name: string }` → `{ moodboard: Moodboard }` (201).

- [ ] **Step 1: Write the failing test**

Create `src/app/api/clients/[id]/moodboards/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", name: "Acme" })),
}));
vi.mock("@/lib/db/moodboards", () => ({
  listMoodboards: vi.fn(),
  createMoodboard: vi.fn(),
}));

import { listMoodboards, createMoodboard } from "@/lib/db/moodboards";
import { getClientById } from "@/lib/db/clients";

const params = Promise.resolve({ id: "client-1" });

describe("/api/clients/[id]/moodboards", () => {
  beforeEach(() => vi.resetAllMocks());

  it("GET lists the client's boards", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", name: "Acme" } as never);
    vi.mocked(listMoodboards).mockResolvedValue([
      { id: "b1", client_id: "client-1", name: "Face cream", created_at: "t" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/client-1/moodboards"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moodboards).toHaveLength(1);
    expect(vi.mocked(listMoodboards)).toHaveBeenCalledWith("client-1");
  });

  it("POST creates a board and returns 201", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", name: "Acme" } as never);
    vi.mocked(createMoodboard).mockResolvedValue({ id: "b2", client_id: "client-1", name: "Hair oil", created_at: "t" });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/clients/client-1/moodboards", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Hair oil" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.moodboard.name).toBe("Hair oil");
    expect(vi.mocked(createMoodboard)).toHaveBeenCalledWith("client-1", "Hair oil");
  });

  it("POST returns 400 when name is missing", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", name: "Acme" } as never);
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/clients/client-1/moodboards", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/clients/\[id\]/moodboards`
Expected: FAIL — `Failed to load ./route` (route not created yet).

- [ ] **Step 3: Write the route**

Create `src/app/api/clients/[id]/moodboards/route.ts`:

```ts
import { NextRequest } from "next/server";
import { apiError, apiOk, withClient } from "@/lib/api/route-helpers";
import { listMoodboards, createMoodboard } from "@/lib/db/moodboards";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(params, async (clientId) => {
    const moodboards = await listMoodboards(clientId);
    return apiOk({ moodboards });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(params, async (clientId) => {
    let body: { name?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const name = body.name?.trim();
    if (!name) return apiError("name is required", 400);
    const moodboard = await createMoodboard(clientId, name);
    return apiOk({ moodboard }, 201);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/app/api/clients/\[id\]/moodboards`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[id]/moodboards/"
git commit -m "feat(moodboards): board list + create routes"
```

---

## Task 3: Item routes — list, add, remove; delete board

**Files:**
- Create: `src/app/api/moodboards/[id]/items/route.ts`
- Create: `src/app/api/moodboards/[id]/items/[itemId]/route.ts`
- Create: `src/app/api/moodboards/[id]/route.ts`
- Test: `src/app/api/moodboards/[id]/items/route.test.ts`

**Interfaces:**
- Consumes: `listItems`, `addItem`, `removeItem`, `deleteMoodboard` (Task 1); `apiOk`, `apiError` (`@/lib/api/route-helpers`).
- Produces (open, no `withClient`):
  - `GET  /api/moodboards/[id]/items` → `{ items: MoodboardItem[] }`
  - `POST /api/moodboards/[id]/items` body `{ imageUrl, sourceUrl? }` → `{ item: MoodboardItem }` (201)
  - `DELETE /api/moodboards/[id]/items/[itemId]` → `{ ok: true }`
  - `DELETE /api/moodboards/[id]` → `{ ok: true }`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/moodboards/[id]/items/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  listItems: vi.fn(),
  addItem: vi.fn(),
}));

import { listItems, addItem } from "@/lib/db/moodboards";

const params = Promise.resolve({ id: "board-1" });

describe("/api/moodboards/[id]/items", () => {
  beforeEach(() => vi.resetAllMocks());

  it("GET lists items", async () => {
    vi.mocked(listItems).mockResolvedValue([
      { id: "i1", moodboard_id: "board-1", image_url: "https://x/y.jpg", source_url: null, position: 0, added_at: "t" },
    ]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/moodboards/board-1/items"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("board-1");
  });

  it("POST adds an item and returns 201", async () => {
    vi.mocked(addItem).mockResolvedValue({
      id: "i2", moodboard_id: "board-1", image_url: "https://x/z.jpg", source_url: "https://pin", position: 0, added_at: "t",
    });
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://x/z.jpg", sourceUrl: "https://pin" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    expect((await res.json()).item.image_url).toBe("https://x/z.jpg");
    expect(vi.mocked(addItem)).toHaveBeenCalledWith("board-1", { imageUrl: "https://x/z.jpg", sourceUrl: "https://pin" });
  });

  it("POST returns 400 when imageUrl is missing", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/moodboards/board-1/items", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/moodboards`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write the items list/add route**

Create `src/app/api/moodboards/[id]/items/route.ts`:

```ts
import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { listItems, addItem } from "@/lib/db/moodboards";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: moodboardId } = await params;
  const items = await listItems(moodboardId);
  return apiOk({ items });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: moodboardId } = await params;
  let body: { imageUrl?: string; sourceUrl?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return apiError("imageUrl is required", 400);
  const item = await addItem(moodboardId, { imageUrl, sourceUrl: body.sourceUrl });
  return apiOk({ item }, 201);
}
```

- [ ] **Step 4: Write the item-delete route**

Create `src/app/api/moodboards/[id]/items/[itemId]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api/route-helpers";
import { removeItem } from "@/lib/db/moodboards";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  await removeItem(itemId);
  return apiOk({ ok: true });
}
```

- [ ] **Step 5: Write the board-delete route**

Create `src/app/api/moodboards/[id]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api/route-helpers";
import { deleteMoodboard } from "@/lib/db/moodboards";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteMoodboard(id);
  return apiOk({ ok: true });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/app/api/moodboards`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/moodboards/"
git commit -m "feat(moodboards): item list/add/remove + board delete routes"
```

---

## Task 4: Re-host-on-use route — `POST /api/nodes/[id]/file/from-url`

**Files:**
- Create: `src/app/api/nodes/[id]/file/from-url/route.ts`
- Test: `src/app/api/nodes/[id]/file/from-url/route.test.ts`

**Interfaces:**
- Consumes: `uploadNodeFile`, `removeObject` (`@/lib/storage`); `createServerSupabase` (`@/lib/supabase/server`); `FILE_NODE_IMAGE_EXTENSIONS`, `FILE_NODE_IMAGE_SIZE_LIMIT` (`@/lib/nodes/file-constants`); `apiOk`, `apiError` (`@/lib/api/route-helpers`).
- Produces: `POST /api/nodes/[id]/file/from-url` body `{ imageUrl: string; sourceUrl?: string; filename?: string }` → `{ fileUrl, filename, fileExt, fileKind: "image", sourceUrl }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/nodes/[id]/file/from-url/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ uploadNodeFile: vi.fn(), removeObject: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: {} } }) }) }) }),
  })),
}));

import { uploadNodeFile } from "@/lib/storage";

function makeReq(body: object) {
  return new NextRequest("http://localhost/api/nodes/node-1/file/from-url", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "node-1" });

function stubFetch(contentType: string, byteLength: number) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(byteLength),
  })));
}

describe("POST /api/nodes/[id]/file/from-url", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

  it("re-hosts a remote image to GCS and returns the patch", async () => {
    stubFetch("image/png", 100);
    vi.mocked(uploadNodeFile).mockResolvedValueOnce({ url: "https://gcs/bucket/ref.png", path: "p/ref.png" });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ imageUrl: "https://i.pinimg.com/x/ref.png", sourceUrl: "https://pin" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileUrl).toBe("https://gcs/bucket/ref.png");
    expect(body.fileKind).toBe("image");
    expect(body.fileExt).toBe("png");
    expect(vi.mocked(uploadNodeFile)).toHaveBeenCalledOnce();
  });

  it("rejects a non-image content-type with 400", async () => {
    stubFetch("text/html", 100);
    const { POST } = await import("./route");
    const res = await POST(makeReq({ imageUrl: "https://x/page.html" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(uploadNodeFile)).not.toHaveBeenCalled();
  });

  it("rejects an oversize image with 400", async () => {
    stubFetch("image/png", 11 * 1024 * 1024);
    const { POST } = await import("./route");
    const res = await POST(makeReq({ imageUrl: "https://x/big.png" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 400 when imageUrl is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeReq({}), { params });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/app/api/nodes/\[id\]/file/from-url`
Expected: FAIL — route module not found.

- [ ] **Step 3: Write the route**

Create `src/app/api/nodes/[id]/file/from-url/route.ts` (mirrors the image path of `/file/drive`, but fetches an arbitrary URL and is image-only):

```ts
import { NextRequest } from "next/server";
import { uploadNodeFile, removeObject } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { FILE_NODE_IMAGE_EXTENSIONS, FILE_NODE_IMAGE_SIZE_LIMIT } from "@/lib/nodes/file-constants";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function extFromUrl(url: string): string {
  const clean = url.split("?")[0].split("#")[0];
  return clean.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: nodeId } = await params;

  let body: { imageUrl?: string; sourceUrl?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return apiError("imageUrl is required", 400);

  // Verify node exists before touching the network or GCS.
  const supabase = createServerSupabase();
  const { data: nodeRow } = await supabase.from("nodes").select("data").eq("id", nodeId).maybeSingle();
  if (!nodeRow) return apiError("Node not found.", 404);

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return apiError(`Could not fetch image (HTTP ${res.status}).`, 400);

    const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
    const ext = MIME_TO_EXT[contentType] ?? extFromUrl(imageUrl);
    if (!FILE_NODE_IMAGE_EXTENSIONS.has(ext)) {
      return apiError(`Unsupported image type '${contentType || ext}'.`, 400);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > FILE_NODE_IMAGE_SIZE_LIMIT) {
      return apiError("Image too large. Maximum size is 10 MB.", 400);
    }

    // Clean up an existing file on the node if present (mirror /file/drive).
    const existingUrl = (nodeRow as { data: Record<string, unknown> }).data?.fileUrl as string | undefined;
    if (existingUrl) {
      try { await removeObject(existingUrl); } catch { /* best-effort */ }
    }

    const filename = body.filename?.trim() || `reference.${ext === "jpeg" ? "jpg" : ext}`;
    const canonicalContentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const { url: fileUrl } = await uploadNodeFile({ nodeId, filename, body: buffer, contentType: canonicalContentType });

    return apiOk({
      fileUrl,
      filename,
      fileExt: ext,
      fileKind: "image" as const,
      sourceUrl: body.sourceUrl ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return apiError(`Failed to import image from URL: ${message}`, 500);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/app/api/nodes/\[id\]/file/from-url`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/file/from-url/"
git commit -m "feat(moodboards): re-host image-from-URL route (used on drag-to-canvas)"
```

---

## Task 5: Client service + filename helper + gallery commit branch

**Files:**
- Create: `src/lib/moodboards/filename.ts`
- Test: `src/lib/moodboards/filename.test.ts`
- Modify: `src/services/file-node.service.ts`
- Modify: `src/components/canvas/gallery-drawer/types.ts`
- Modify: `src/hooks/use-gallery-drawer.ts`

**Interfaces:**
- Produces: `filenameFromUrl(url: string): string`; `fileNodeService.pickFromUrl(nodeId, { imageUrl, sourceUrl })`; `GalleryImage.source` includes `"moodboard"` + optional `sourceUrl`; `handleAdd` re-hosts `source: "moodboard"` images via `pickFromUrl`.
- Consumes: `POST /api/nodes/[id]/file/from-url` (Task 4).

- [ ] **Step 1: Write the failing test for the filename helper**

Create `src/lib/moodboards/filename.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filenameFromUrl } from "./filename";

describe("filenameFromUrl", () => {
  it("uses the last path segment", () => {
    expect(filenameFromUrl("https://i.pinimg.com/736x/ab/cd/photo.jpg")).toBe("photo.jpg");
  });
  it("strips query and hash", () => {
    expect(filenameFromUrl("https://x/y/shot.png?w=736#frag")).toBe("shot.png");
  });
  it("falls back to reference.jpg when there is no image extension", () => {
    expect(filenameFromUrl("https://x/pin/12345")).toBe("reference.jpg");
  });
  it("falls back on an unparseable url", () => {
    expect(filenameFromUrl("not a url")).toBe("reference.jpg");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/moodboards/filename`
Expected: FAIL — `filename` module not found.

- [ ] **Step 3: Write the helper**

Create `src/lib/moodboards/filename.ts`:

```ts
import { FILE_NODE_IMAGE_EXTENSIONS } from "@/lib/nodes/file-constants";

// Derive a File-node filename from a remote image URL; fall back to a generic
// name when the URL carries no recognizable image extension.
export function filenameFromUrl(url: string): string {
  try {
    const path = url.split("?")[0].split("#")[0];
    const last = path.split("/").pop() ?? "";
    const ext = last.split(".").pop()?.toLowerCase() ?? "";
    if (last.includes(".") && FILE_NODE_IMAGE_EXTENSIONS.has(ext)) return last;
  } catch {
    /* fall through */
  }
  return "reference.jpg";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/moodboards/filename`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `pickFromUrl` to the file-node service**

In `src/services/file-node.service.ts`, add this method to the `FileNodeService` class (mirrors `pickFromDrive`), and widen `FileUploadResult` is not needed — it returns its own shape:

```ts
  async pickFromUrl(
    nodeId: string,
    input: { imageUrl: string; sourceUrl?: string; filename?: string },
  ): Promise<{ fileUrl: string; filename: string; fileExt: string; fileKind: "image"; sourceUrl: string | null }> {
    const res = await fetch(`/api/nodes/${nodeId}/file/from-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to import image from URL");
    return json as { fileUrl: string; filename: string; fileExt: string; fileKind: "image"; sourceUrl: string | null };
  }
```

- [ ] **Step 6: Extend the GalleryImage type**

In `src/components/canvas/gallery-drawer/types.ts`, update `GalleryTab` and `GalleryImage`:

```ts
export type GalleryTab = "references" | "assets" | "moodboard";
```

```ts
  source: "drive" | "generated" | "moodboard";
  /** MIME type of the Drive file — required when source === "drive" for import. */
  driveMimeType?: string;
  /** Provenance page URL — set when source === "moodboard". */
  sourceUrl?: string;
  generationId?: string;
```

- [ ] **Step 7: Add the moodboard branch to `handleAdd`**

In `src/hooks/use-gallery-drawer.ts`, (a) add a collector alongside `drivePicks`, (b) add the branch, and (c) after the drive loop, kick off the URL imports. Add near `const drivePicks` (line ~32):

```ts
      const urlPicks: { nodeId: string; image: GalleryImage }[] = [];
```

Replace the `if (image.source === "drive" …) { … } else { … }` block with a three-way branch:

```ts
        if (image.source === "drive" && image.driveMimeType) {
          updateNodeData(nodeId, {
            title,
            fileKind: "image",
            filename: image.filename,
            driveFileId: image.id,
            driveMimeType: image.driveMimeType,
            driveFileName: image.filename,
            uploading: true,
          });
          drivePicks.push({ nodeId, image });
        } else if (image.source === "moodboard") {
          updateNodeData(nodeId, {
            title,
            fileKind: "image",
            filename: image.filename,
            uploading: true,
          });
          urlPicks.push({ nodeId, image });
        } else {
          updateNodeData(nodeId, {
            title,
            fileKind: "image",
            fileUrl: image.imageUrl,
            filename: image.filename,
            meta: { sourceGenerationId: image.generationId },
          });
        }
```

Then, after the existing `if (drivePicks.length > 0) { … }` block, add:

```ts
      if (urlPicks.length > 0) {
        void (async () => {
          try {
            await flushAutosave();
          } catch (err) {
            console.error("[gallery] autosave flush failed:", err);
          }
          for (const pick of urlPicks) {
            void importUrlFile({ nodeId: pick.nodeId, image: pick.image, updateNodeData });
          }
        })();
      }
```

Add the import helper at the bottom of the file (mirrors `importDriveFile`):

```ts
async function importUrlFile({
  nodeId,
  image,
  updateNodeData,
}: {
  nodeId: string;
  image: GalleryImage;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
}) {
  try {
    const result = await fileNodeService.pickFromUrl(nodeId, {
      imageUrl: image.imageUrl,
      sourceUrl: image.sourceUrl,
      filename: image.filename,
    });
    updateNodeData(nodeId, {
      fileUrl: result.fileUrl,
      filename: result.filename,
      fileExt: result.fileExt,
      fileKind: "image",
      uploading: false,
    });
  } catch (err) {
    updateNodeData(nodeId, {
      uploading: false,
      uploadError: err instanceof Error ? err.message : "Import failed",
    });
  }
}
```

- [ ] **Step 8: Type-check, lint, and run the unit test**

Run: `npx tsc --noEmit && npx eslint src/hooks/use-gallery-drawer.ts src/services/file-node.service.ts src/lib/moodboards/filename.ts && npm test -- src/lib/moodboards/filename`
Expected: no type/lint errors; filename test PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/moodboards/ src/services/file-node.service.ts src/components/canvas/gallery-drawer/types.ts src/hooks/use-gallery-drawer.ts
git commit -m "feat(moodboards): pickFromUrl service + handleAdd re-host branch + filename helper"
```

---

## Task 6: `use-moodboards` hook + Moodboards tab + board list

**Files:**
- Create: `src/hooks/use-moodboards.ts`
- Modify: `src/components/canvas/gallery-drawer/gallery-tabs.tsx`
- Modify: `src/components/canvas/gallery-drawer/gallery-drawer.tsx`

**Interfaces:**
- Produces: `useMoodboards(clientId)` → `{ boards, items, loading, selectedBoardId, selectBoard, createBoard, addItemUrl, removeItem, refresh }`; a rendered **Moodboards** tab that lists boards as folder tiles and lets you create one.
- Consumes: routes from Tasks 2–3; `GalleryFolderTile`, `GalleryTabs`, `Button`, `Input`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/use-moodboards.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Moodboard, MoodboardItem } from "@/lib/db/moodboards";

export function useMoodboards(clientId: string) {
  const [boards, setBoards] = useState<Moodboard[]>([]);
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBoards = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/moodboards`);
    if (!res.ok) return;
    const json = (await res.json()) as { moodboards: Moodboard[] };
    setBoards(json.moodboards);
  }, [clientId]);

  const loadItems = useCallback(async (boardId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/moodboards/${boardId}/items`);
      if (!res.ok) return;
      const json = (await res.json()) as { items: MoodboardItem[] };
      setItems(json.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBoards(); }, [loadBoards]);
  useEffect(() => {
    if (selectedBoardId) void loadItems(selectedBoardId);
    else setItems([]);
  }, [selectedBoardId, loadItems]);

  const selectBoard = useCallback((id: string | null) => setSelectedBoardId(id), []);

  const createBoard = useCallback(async (name: string) => {
    const res = await fetch(`/api/clients/${clientId}/moodboards`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    if (res.ok) await loadBoards();
  }, [clientId, loadBoards]);

  const addItemUrl = useCallback(async (imageUrl: string) => {
    if (!selectedBoardId) return;
    const res = await fetch(`/api/moodboards/${selectedBoardId}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl }),
    });
    if (res.ok) await loadItems(selectedBoardId);
  }, [selectedBoardId, loadItems]);

  const removeItem = useCallback(async (itemId: string) => {
    if (!selectedBoardId) return;
    const res = await fetch(`/api/moodboards/${selectedBoardId}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) await loadItems(selectedBoardId);
  }, [selectedBoardId, loadItems]);

  const refresh = useCallback(() => {
    void loadBoards();
    if (selectedBoardId) void loadItems(selectedBoardId);
  }, [loadBoards, loadItems, selectedBoardId]);

  return { boards, items, selectedBoardId, loading, selectBoard, createBoard, addItemUrl, removeItem, refresh };
}
```

- [ ] **Step 2: Add the Moodboards tab**

In `src/components/canvas/gallery-drawer/gallery-tabs.tsx`, extend the `TABS` array:

```ts
const TABS: { id: GalleryTab; label: string }[] = [
  { id: "references", label: "References" },
  { id: "assets", label: "Assets" },
  { id: "moodboard", label: "Moodboards" },
];
```

- [ ] **Step 3: Wire the hook + board list into the drawer**

In `src/components/canvas/gallery-drawer/gallery-drawer.tsx`:

(a) import the hook and add state, near the other hooks (after `const generations = …`):

```ts
  const moodboards = useMoodboards(clientId);
```

with the import at the top:

```ts
import { useMoodboards } from "@/hooks/use-moodboards";
```

(b) In the drawer body (inside the `<div className="flex-1 overflow-y-auto px-4 py-3">`), add a `tab === "moodboard"` branch that shows the board list when no board is selected. Place it as the first child of that scroll container:

```tsx
            {tab === "moodboard" && !moodboards.selectedBoardId ? (
              <div className="flex flex-col gap-1">
                {moodboards.boards.map((b) => (
                  <GalleryFolderTile
                    key={b.id}
                    folder={{ id: b.id, name: b.name }}
                    onClick={() => moodboards.selectBoard(b.id)}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 w-full justify-start border border-dashed border-primary/40 text-primary hover:bg-primary/5"
                  onClick={() => {
                    const name = window.prompt("New moodboard name");
                    if (name?.trim()) void moodboards.createBoard(name.trim());
                  }}
                >
                  + New moodboard
                </Button>
              </div>
            ) : null}
```

(Keep the existing `noFolderLinked ? … : ( references/assets content )` block; guard it so it only renders for the non-moodboard tabs — wrap its condition as `{tab !== "moodboard" && ( … existing block … )}`. The moodboard board-contents view is added in Task 7.)

- [ ] **Step 4: Verify by running the app**

Run: `npm run dev`, open a canvas, open the Gallery, click the **Moodboards** tab.
Expected: the tab appears; with no boards you see just the dashed **+ New moodboard** chip; creating one (enter a name) makes a folder tile appear; clicking a tile selects it (contents are empty until Task 7). Confirm no console errors and the References/Assets tabs still work.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-moodboards.ts src/components/canvas/gallery-drawer/gallery-tabs.tsx src/components/canvas/gallery-drawer/gallery-drawer.tsx
git commit -m "feat(moodboards): use-moodboards hook, Moodboards tab, board list + create"
```

---

## Task 7: Board contents + add-by-URL + drag-to-canvas

**Files:**
- Create: `src/components/canvas/gallery-drawer/gallery-add-url.tsx`
- Modify: `src/components/canvas/gallery-drawer/gallery-drawer.tsx`

**Interfaces:**
- Consumes: `useMoodboards` (Task 6), `filenameFromUrl` (Task 5), the existing `GalleryContent`, `GalleryBreadcrumb`, selection state + `handleCommit` in the drawer, and the `handleAdd` moodboard branch (Task 5).
- Produces: a board-contents view where items render in the grid, an **Add image URL** field appends items, and selecting + **Add** (or drag) creates re-hosted File nodes.

- [ ] **Step 1: Build the add-by-URL input**

Create `src/components/canvas/gallery-drawer/gallery-add-url.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = { onAdd: (url: string) => void };

export function GalleryAddUrl({ onAdd }: Props) {
  const [url, setUrl] = useState("");
  function submit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setUrl("");
  }
  return (
    <div className="mb-2 flex items-center gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder="Paste an image URL…"
        className="h-9 text-sm"
      />
      <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1" onClick={submit} disabled={!url.trim()}>
        <Plus className="size-3.5" strokeWidth={1.5} /> Add
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Map moodboard items into `activeImages` and render contents**

In `src/components/canvas/gallery-drawer/gallery-drawer.tsx`:

(a) import the helper + component:

```ts
import { filenameFromUrl } from "@/lib/moodboards/filename";
import { GalleryAddUrl } from "./gallery-add-url";
```

(b) Build the moodboard images list (near the `references`/`assets` `useMemo`s):

```ts
  const moodboardImages: GalleryImage[] = useMemo(
    () =>
      moodboards.items.map((it) => ({
        id: it.id,
        imageUrl: it.image_url,
        previewUrl: it.image_url,
        filename: filenameFromUrl(it.image_url),
        subtitle: new Date(it.added_at).toLocaleDateString(),
        source: "moodboard" as const,
        sourceUrl: it.source_url ?? undefined,
      })),
    [moodboards.items],
  );
```

(c) Extend `activeImages` so the grid shows moodboard items when a board is open:

```ts
  const activeImages =
    tab === "references" ? references : tab === "assets" ? filteredAssets : moodboardImages;
```

(d) In the body, add the **board-contents** branch (when a board IS selected) right after the board-list branch from Task 6:

```tsx
            {tab === "moodboard" && moodboards.selectedBoardId ? (
              <>
                <GalleryBreadcrumb
                  stack={[{ id: moodboards.selectedBoardId, name: moodboards.boards.find((b) => b.id === moodboards.selectedBoardId)?.name ?? "Board" }]}
                  onNavigateTo={() => moodboards.selectBoard(null)}
                />
                <GalleryAddUrl onAdd={(url) => void moodboards.addItemUrl(url)} />
                <GalleryContent
                  loading={moodboards.loading}
                  loadError={null}
                  onRetry={moodboards.refresh}
                  images={activeImages}
                  emptyMessage="No references yet — paste an image URL to add one."
                  viewMode={viewMode}
                  selectedIds={selectedIds}
                  onToggle={toggleSelect}
                  onPreview={setPreviewId}
                  onDragStartImage={handleDragStartImage}
                  onSentinelInView={() => {}}
                  hasMore={false}
                  loadingMore={false}
                />
              </>
            ) : null}
```

(e) Ensure `toggleSelect` can find moodboard images: in `toggleSelect`, the `allImages` lookup currently spreads `references`/`assets`. Extend it:

```ts
    const allImages = [...references, ...assets, ...moodboardImages];
```

and likewise the `previewImage` lookup:

```ts
  const previewImage = previewId
    ? [...references, ...assets, ...moodboardImages].find((i) => i.id === previewId)
    : null;
```

- [ ] **Step 3: Verify the full loop by running the app**

Run: `npm run dev`. Open Gallery → Moodboards → open a board → paste a Pinterest image URL (e.g. an `i.pinimg.com/…jpg` link) → it appears in the grid. Select it → **Add** (footer). 
Expected: a File node appears on the canvas; after a moment its image loads from a **GCS** URL (not `i.pinimg.com`) and the node shows pixel dimensions (client-measured, already shipped). Dragging a tile onto the canvas does the same. The `moodboard_items` row remains (staging is durable; only *use* re-hosts).

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/canvas/gallery-drawer/gallery-add-url.tsx src/components/canvas/gallery-drawer/gallery-drawer.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/gallery-drawer/gallery-add-url.tsx src/components/canvas/gallery-drawer/gallery-drawer.tsx
git commit -m "feat(moodboards): board contents, add-by-URL, drag-to-canvas re-host"
```

---

## Self-Review

**Spec coverage:**
- Client-level boards (`client_id` FK) — Task 1. ✓
- URL-only storage (no bytes/thumb/embedding at add) — Task 1 schema + Task 3 add route (inserts row, fetches nothing). ✓
- Re-host **only on use** — Task 4 route + Task 5 `handleAdd` moodboard branch. ✓
- Gallery Moodboards tab, board drill-down, add-by-URL, drag-to-canvas — Tasks 6–7. ✓
- Open endpoints for `/api/moodboards/*` (D14) — Tasks 2–3 (board create/list is `withClient`; item + board-delete routes are open, ready for the Slice-B extension). ✓
- Deferred (thumbnails, embeddings, extension) — explicitly out of scope; no tasks, matching the spec's non-goals. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every test step has real assertions; every run step has an exact command + expected result. ✓

**Type consistency:** `Moodboard`/`MoodboardItem` (Task 1) are the types consumed by the routes (Tasks 2–3) and the hook (Task 6). `pickFromUrl`'s return shape (Task 5) matches the `from-url` route's `apiOk` body (Task 4): `{ fileUrl, filename, fileExt, fileKind, sourceUrl }`. `GalleryImage.source` gains `"moodboard"` (Task 5) before it is produced in `moodboardImages` (Task 7). `useMoodboards` method names (`selectBoard`, `createBoard`, `addItemUrl`, `removeItem`, `refresh`, `selectedBoardId`, `boards`, `items`, `loading`) are used identically in Tasks 6–7. ✓

**Note on `gallery-drawer.tsx`:** this file is already large (~440 lines). This plan adds contained branches rather than restructuring it. If it becomes unwieldy while implementing Task 7, extracting a `<GalleryMoodboardPane>` component is a reasonable in-task split (keep the drawer's selection/commit props flowing in).
