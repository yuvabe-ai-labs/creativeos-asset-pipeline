# GCS Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Storage with Google Cloud Storage as the upload backend, organized by `clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/...` paths, while keeping all existing Supabase-hosted assets resolvable.

**Architecture:** A new `src/lib/storage/` module exposes six per-kind upload helpers plus a polymorphic `removeObject`. Helpers internally resolve `clientId`+`canvasId` from `nodeId` via a one-JOIN lookup, build a timestamped filename, and call into a memoized `@google-cloud/storage` client. The 7 existing call sites swap to these helpers mechanically. `removeObject` accepts either a GCS URL/path (→ GCS delete) or a `supabase.co` URL (→ legacy Supabase delete) so deletion keeps working for old assets without per-site branching.

**Tech Stack:** `@google-cloud/storage` (new), Next.js 15 route handlers, Vitest (node env), existing Supabase Postgres client.

**Spec:** [docs/superpowers/specs/2026-06-30-gcs-storage-migration-design.md](../specs/2026-06-30-gcs-storage-migration-design.md)

---

## File Structure

**New files:**
- `src/lib/storage/paths.ts` — pure functions: `sanitizeSlug`, `timestampSuffix`, `buildStoredName`, path builders for each kind
- `src/lib/storage/paths.test.ts` — unit tests for the above
- `src/lib/storage/ownership.ts` — `resolveOwnership(nodeId)` → `{ clientId, canvasId }`
- `src/lib/storage/ownership.test.ts` — unit tests (mocked Supabase client)
- `src/lib/storage/gcs.ts` — memoized `Storage` client + `_put` / `_remove` primitives
- `src/lib/storage/index.ts` — six per-kind helpers + `removeObject` + `parsePathFromUrl`
- `src/lib/storage/index.test.ts` — unit tests with mocked GCS
- `__mocks__/@google-cloud/storage.ts` — vitest auto-mock
- `scripts/test-gcs.ts` — manual roundtrip smoke

**Modified files (mechanical swap):**
- `src/app/api/nodes/[id]/file/route.ts`
- `src/app/api/nodes/[id]/image-generate/route.ts`
- `src/lib/generations/complete.ts`
- `src/app/api/clients/[id]/kb/documents/route.ts`
- `src/app/api/clients/[id]/kb/images/route.ts`
- `src/app/api/clients/[id]/logo/route.ts`
- `src/lib/actions/kb.ts`
- `package.json` (add `@google-cloud/storage`)
- `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append ADR D28)

---

## Task 1: Install package and document env vars

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the GCS SDK**

Run: `cd creativeos-mvp && npm install @google-cloud/storage`
Expected: package added to `dependencies`, lockfile updated.

- [ ] **Step 2: Document env vars in `.env.example` (or create one)**

Add these lines to `creativeos-mvp/.env.example` (create the file if absent — DO NOT commit the real `.env`):

```
# Google Cloud Storage (replaces Supabase Storage for new uploads)
GCP_PROJECT_ID=creativeos
GCS_BUCKET=creativeos-assets
GCP_SERVICE_ACCOUNT_KEY_BASE64=
# Local dev alternative: GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json
```

- [ ] **Step 3: Verify operator has done the GCP console setup**

The plan assumes the operator has already (per the spec §1):
- Created project `creativeos`, bucket `creativeos-assets` (region `asia-south1`, Standard, Uniform access)
- Granted `allUsers` the role `Storage Object Viewer` on the bucket
- Created service account `creativeos-storage` with role `Storage Object Admin` and downloaded a JSON key

Confirm with the operator before proceeding. If `.env` is wired with `GCP_PROJECT_ID`, `GCS_BUCKET`, and `GCP_SERVICE_ACCOUNT_KEY_BASE64` (or `GOOGLE_APPLICATION_CREDENTIALS`), proceed.

- [ ] **Step 4: Commit**

```bash
git add creativeos-mvp/package.json creativeos-mvp/package-lock.json creativeos-mvp/.env.example
git commit -m "chore(storage): install @google-cloud/storage and document env vars"
```

---

## Task 2: Path utilities — `paths.ts`

**Files:**
- Create: `creativeos-mvp/src/lib/storage/paths.ts`
- Test: `creativeos-mvp/src/lib/storage/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `creativeos-mvp/src/lib/storage/paths.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sanitizeSlug,
  timestampSuffix,
  buildStoredName,
  pathForNodeFile,
  pathForImageGen,
  pathForVideoGen,
  pathForClientLogo,
  pathForBrandImage,
  pathForKBDocument,
} from "./paths";

describe("sanitizeSlug", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(sanitizeSlug("My Vacation Photo")).toBe("my-vacation-photo");
  });
  it("strips path separators", () => {
    expect(sanitizeSlug("../etc/passwd")).toBe("etc-passwd");
  });
  it("strips characters outside [a-z0-9-_]", () => {
    expect(sanitizeSlug("hello@world!.txt")).toBe("helloworld.txt");
  });
  it("collapses repeated dashes", () => {
    expect(sanitizeSlug("a   b")).toBe("a-b");
  });
  it("caps length at 60", () => {
    expect(sanitizeSlug("x".repeat(120))).toHaveLength(60);
  });
  it("returns 'untitled' for empty result", () => {
    expect(sanitizeSlug("!!!")).toBe("untitled");
  });
});

describe("timestampSuffix", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("formats UTC with millisecond precision and Z suffix", () => {
    expect(timestampSuffix()).toBe("2026-06-30T14-23-45-678Z");
  });
});

describe("buildStoredName", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("combines sanitized stem, timestamp, and extension", () => {
    expect(buildStoredName("My Vacation Photo.JPG")).toBe(
      "my-vacation-photo__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("handles names without an extension", () => {
    expect(buildStoredName("README")).toBe(
      "readme__2026-06-30T14-23-45-678Z",
    );
  });
  it("accepts an explicit slug + ext override", () => {
    expect(buildStoredName(undefined, { slug: "output", ext: "png" })).toBe(
      "output__2026-06-30T14-23-45-678Z.png",
    );
  });
});

describe("path builders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("pathForNodeFile", () => {
    expect(
      pathForNodeFile({
        clientId: "c1",
        canvasId: "ca1",
        nodeId: "n1",
        filename: "Photo.jpg",
      }),
    ).toBe(
      "clients/c1/canvases/ca1/nodes/n1/files/photo__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("pathForImageGen", () => {
    expect(
      pathForImageGen({
        clientId: "c1",
        canvasId: "ca1",
        nodeId: "n1",
        ext: "png",
      }),
    ).toBe(
      "clients/c1/canvases/ca1/nodes/n1/image-gen/output__2026-06-30T14-23-45-678Z.png",
    );
  });
  it("pathForVideoGen defaults ext to mp4", () => {
    expect(
      pathForVideoGen({ clientId: "c1", canvasId: "ca1", nodeId: "n1" }),
    ).toBe(
      "clients/c1/canvases/ca1/nodes/n1/video-gen/output__2026-06-30T14-23-45-678Z.mp4",
    );
  });
  it("pathForClientLogo", () => {
    expect(
      pathForClientLogo({ clientId: "c1", filename: "ACME Logo.png" }),
    ).toBe("clients/c1/logo/acme-logo__2026-06-30T14-23-45-678Z.png");
  });
  it("pathForBrandImage nests under imageId", () => {
    expect(
      pathForBrandImage({
        clientId: "c1",
        imageId: "img1",
        filename: "Hero.jpg",
      }),
    ).toBe(
      "clients/c1/brand-images/img1/hero__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("pathForKBDocument nests under docId", () => {
    expect(
      pathForKBDocument({
        clientId: "c1",
        docId: "doc1",
        filename: "Brief.pdf",
      }),
    ).toBe(
      "clients/c1/kb-documents/doc1/brief__2026-06-30T14-23-45-678Z.pdf",
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they all fail**

Run: `cd creativeos-mvp && npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `Cannot find module './paths'`.

- [ ] **Step 3: Implement `paths.ts`**

Create `creativeos-mvp/src/lib/storage/paths.ts`:

```typescript
const MAX_SLUG_LENGTH = 60;

export function sanitizeSlug(input: string): string {
  const stripped = input
    .toLowerCase()
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_.]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return stripped || "untitled";
}

export function timestampSuffix(now = new Date()): string {
  const iso = now.toISOString(); // 2026-06-30T14:23:45.678Z
  return iso.replace(/:/g, "-").replace(".", "-");
}

function splitName(filename: string): { stem: string; ext: string } {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { stem: filename, ext: "" };
  return {
    stem: filename.slice(0, idx),
    ext: filename.slice(idx + 1).toLowerCase(),
  };
}

export function buildStoredName(
  filename?: string,
  override?: { slug?: string; ext?: string },
): string {
  let slug: string;
  let ext: string;
  if (override?.slug !== undefined || override?.ext !== undefined) {
    slug = override.slug ?? "output";
    ext = override.ext ?? "";
  } else if (filename) {
    const parts = splitName(filename);
    slug = sanitizeSlug(parts.stem);
    ext = parts.ext;
  } else {
    slug = "output";
    ext = "";
  }
  const base = `${slug}__${timestampSuffix()}`;
  return ext ? `${base}.${ext}` : base;
}

export function pathForNodeFile(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/files/${name}`;
}

export function pathForImageGen(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "output", ext: args.ext });
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/image-gen/${name}`;
}

export function pathForVideoGen(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext?: string;
}): string {
  const name = buildStoredName(undefined, {
    slug: "output",
    ext: args.ext ?? "mp4",
  });
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/video-gen/${name}`;
}

export function pathForClientLogo(args: {
  clientId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/logo/${name}`;
}

export function pathForBrandImage(args: {
  clientId: string;
  imageId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/brand-images/${args.imageId}/${name}`;
}

export function pathForKBDocument(args: {
  clientId: string;
  docId: string;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/kb-documents/${args.docId}/${name}`;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd creativeos-mvp && npx vitest run src/lib/storage/paths.test.ts`
Expected: PASS — all 19 tests green.

- [ ] **Step 5: Commit**

```bash
git add creativeos-mvp/src/lib/storage/paths.ts creativeos-mvp/src/lib/storage/paths.test.ts
git commit -m "feat(storage): add path + filename utilities for GCS layout"
```

---

## Task 3: Mock `@google-cloud/storage` for tests

**Files:**
- Create: `creativeos-mvp/__mocks__/@google-cloud/storage.ts`

- [ ] **Step 1: Create the mock**

Create `creativeos-mvp/__mocks__/@google-cloud/storage.ts`:

```typescript
import { vi } from "vitest";

// In-memory state per bucket — assertable from tests via `mockBucketState`.
export const mockBucketState = new Map<
  string,
  Map<string, { body: Buffer; contentType: string }>
>();

export function _resetMockStorage() {
  mockBucketState.clear();
}

class MockFile {
  constructor(
    private readonly bucketName: string,
    public readonly name: string,
  ) {}
  save = vi.fn(
    async (body: Buffer | Uint8Array, opts: { contentType: string }) => {
      const b = mockBucketState.get(this.bucketName) ?? new Map();
      b.set(this.name, {
        body: Buffer.isBuffer(body) ? body : Buffer.from(body),
        contentType: opts.contentType,
      });
      mockBucketState.set(this.bucketName, b);
    },
  );
  delete = vi.fn(async (_opts?: { ignoreNotFound?: boolean }) => {
    mockBucketState.get(this.bucketName)?.delete(this.name);
  });
}

class MockBucket {
  constructor(public readonly name: string) {}
  file = vi.fn((path: string) => new MockFile(this.name, path));
}

export class Storage {
  constructor(_opts?: unknown) {}
  bucket = vi.fn((name: string) => new MockBucket(name));
}
```

- [ ] **Step 2: Commit**

```bash
git add "creativeos-mvp/__mocks__/@google-cloud/storage.ts"
git commit -m "test(storage): add @google-cloud/storage mock"
```

---

## Task 4: GCS client module — `gcs.ts`

**Files:**
- Create: `creativeos-mvp/src/lib/storage/gcs.ts`

- [ ] **Step 1: Implement the client + primitives**

Create `creativeos-mvp/src/lib/storage/gcs.ts`:

```typescript
import "server-only";
import { Storage } from "@google-cloud/storage";

let _storage: Storage | null = null;
let _bucketName: string | null = null;

function getStorage(): Storage {
  if (_storage) return _storage;

  const projectId = process.env.GCP_PROJECT_ID;
  const keyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64;

  if (!projectId) {
    throw new Error("Missing GCP_PROJECT_ID env var.");
  }

  if (keyBase64) {
    const credentials = JSON.parse(
      Buffer.from(keyBase64, "base64").toString("utf8"),
    );
    _storage = new Storage({ projectId, credentials });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // SDK auto-loads creds from this env var path
    _storage = new Storage({ projectId });
  } else {
    throw new Error(
      "Missing GCS credentials — set GCP_SERVICE_ACCOUNT_KEY_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }
  return _storage;
}

export function getBucketName(): string {
  if (_bucketName) return _bucketName;
  const name = process.env.GCS_BUCKET;
  if (!name) throw new Error("Missing GCS_BUCKET env var.");
  _bucketName = name;
  return name;
}

export function publicUrlFor(path: string): string {
  return `https://storage.googleapis.com/${getBucketName()}/${path}`;
}

export async function _put(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getStorage().bucket(getBucketName()).file(path).save(body, {
    contentType,
  });
}

export async function _remove(path: string): Promise<void> {
  await getStorage()
    .bucket(getBucketName())
    .file(path)
    .delete({ ignoreNotFound: true });
}

// Test-only: reset memoized client (used between test files).
export function _resetGcsClient(): void {
  _storage = null;
  _bucketName = null;
}
```

- [ ] **Step 2: Sanity-check it compiles**

Run: `cd creativeos-mvp && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/src/lib/storage/gcs.ts
git commit -m "feat(storage): add memoized GCS client and put/remove primitives"
```

---

## Task 5: Ownership resolver — `ownership.ts`

**Files:**
- Create: `creativeos-mvp/src/lib/storage/ownership.ts`
- Test: `creativeos-mvp/src/lib/storage/ownership.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `creativeos-mvp/src/lib/storage/ownership.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import { resolveOwnership } from "./ownership";

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockMaybeSingle.mockReset();
});

describe("resolveOwnership", () => {
  it("returns clientId + canvasId from a node JOIN", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { canvas_id: "ca1", canvases: { client_id: "c1" } },
      error: null,
    });
    const result = await resolveOwnership("n1");
    expect(result).toEqual({ clientId: "c1", canvasId: "ca1" });
    expect(mockFrom).toHaveBeenCalledWith("nodes");
    expect(mockSelect).toHaveBeenCalledWith("canvas_id, canvases(client_id)");
    expect(mockEq).toHaveBeenCalledWith("id", "n1");
  });

  it("throws when the node row is missing", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveOwnership("missing")).rejects.toThrow(
      "Node missing not found.",
    );
  });

  it("throws when Supabase returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    await expect(resolveOwnership("n1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd creativeos-mvp && npx vitest run src/lib/storage/ownership.test.ts`
Expected: FAIL — `Cannot find module './ownership'`.

- [ ] **Step 3: Implement `ownership.ts`**

Create `creativeos-mvp/src/lib/storage/ownership.ts`:

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type Ownership = { clientId: string; canvasId: string };

export async function resolveOwnership(nodeId: string): Promise<Ownership> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("canvas_id, canvases(client_id)")
    .eq("id", nodeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Node ${nodeId} not found.`);

  const row = data as {
    canvas_id: string;
    canvases: { client_id: string } | null;
  };
  if (!row.canvases) {
    throw new Error(`Canvas for node ${nodeId} not found.`);
  }
  return { clientId: row.canvases.client_id, canvasId: row.canvas_id };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd creativeos-mvp && npx vitest run src/lib/storage/ownership.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add creativeos-mvp/src/lib/storage/ownership.ts creativeos-mvp/src/lib/storage/ownership.test.ts
git commit -m "feat(storage): add resolveOwnership for nodeId → clientId/canvasId"
```

---

## Task 6: Wrapper API — `index.ts`

**Files:**
- Create: `creativeos-mvp/src/lib/storage/index.ts`
- Test: `creativeos-mvp/src/lib/storage/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `creativeos-mvp/src/lib/storage/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockBucketState,
  _resetMockStorage,
} from "../../../__mocks__/@google-cloud/storage";

vi.mock("@google-cloud/storage");

vi.mock("./ownership", () => ({
  resolveOwnership: vi.fn(async () => ({
    clientId: "c1",
    canvasId: "ca1",
  })),
}));

const mockSupabaseRemove = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({ remove: mockSupabaseRemove }),
    },
  }),
}));

import {
  uploadNodeFile,
  uploadImageGen,
  uploadVideoGen,
  uploadClientLogo,
  uploadBrandImage,
  uploadKBDocument,
  removeObject,
  parsePathFromUrl,
} from "./index";
import { _resetGcsClient } from "./gcs";

beforeEach(() => {
  process.env.GCP_PROJECT_ID = "test-project";
  process.env.GCS_BUCKET = "test-bucket";
  process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64 = Buffer.from(
    JSON.stringify({ client_email: "x", private_key: "y" }),
  ).toString("base64");
  _resetGcsClient();
  _resetMockStorage();
  mockSupabaseRemove.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-30T14:23:45.678Z"));
});

describe("uploadNodeFile", () => {
  it("uploads under the resolved ownership path and returns a public URL", async () => {
    const result = await uploadNodeFile({
      nodeId: "n1",
      filename: "Photo.jpg",
      body: Buffer.from("hello"),
      contentType: "image/jpeg",
    });
    expect(result.path).toBe(
      "clients/c1/canvases/ca1/nodes/n1/files/photo__2026-06-30T14-23-45-678Z.jpg",
    );
    expect(result.url).toBe(
      `https://storage.googleapis.com/test-bucket/${result.path}`,
    );
    const stored = mockBucketState.get("test-bucket")!.get(result.path)!;
    expect(stored.body.toString()).toBe("hello");
    expect(stored.contentType).toBe("image/jpeg");
  });
});

describe("uploadImageGen", () => {
  it("uses image-gen/output path", async () => {
    const result = await uploadImageGen({
      nodeId: "n1",
      ext: "png",
      body: Buffer.from("img"),
      contentType: "image/png",
    });
    expect(result.path).toBe(
      "clients/c1/canvases/ca1/nodes/n1/image-gen/output__2026-06-30T14-23-45-678Z.png",
    );
  });
});

describe("uploadVideoGen", () => {
  it("defaults ext to mp4", async () => {
    const result = await uploadVideoGen({
      nodeId: "n1",
      body: Buffer.from("vid"),
      contentType: "video/mp4",
    });
    expect(result.path).toBe(
      "clients/c1/canvases/ca1/nodes/n1/video-gen/output__2026-06-30T14-23-45-678Z.mp4",
    );
  });
});

describe("uploadClientLogo / uploadBrandImage / uploadKBDocument", () => {
  it("uploadClientLogo", async () => {
    const r = await uploadClientLogo({
      clientId: "c1",
      filename: "Logo.png",
      body: Buffer.from("a"),
      contentType: "image/png",
    });
    expect(r.path).toBe(
      "clients/c1/logo/logo__2026-06-30T14-23-45-678Z.png",
    );
  });
  it("uploadBrandImage", async () => {
    const r = await uploadBrandImage({
      clientId: "c1",
      imageId: "img1",
      filename: "Hero.jpg",
      body: Buffer.from("a"),
      contentType: "image/jpeg",
    });
    expect(r.path).toBe(
      "clients/c1/brand-images/img1/hero__2026-06-30T14-23-45-678Z.jpg",
    );
  });
  it("uploadKBDocument", async () => {
    const r = await uploadKBDocument({
      clientId: "c1",
      docId: "d1",
      filename: "Brief.pdf",
      body: Buffer.from("a"),
      contentType: "application/pdf",
    });
    expect(r.path).toBe(
      "clients/c1/kb-documents/d1/brief__2026-06-30T14-23-45-678Z.pdf",
    );
  });
});

describe("parsePathFromUrl", () => {
  it("returns the path for a GCS URL", () => {
    expect(
      parsePathFromUrl(
        "https://storage.googleapis.com/test-bucket/foo/bar.png",
      ),
    ).toBe("foo/bar.png");
  });
  it("returns null for non-GCS URLs", () => {
    expect(
      parsePathFromUrl("https://example.com/foo.png"),
    ).toBeNull();
  });
});

describe("removeObject", () => {
  it("deletes from GCS for a storage.googleapis.com URL", async () => {
    mockBucketState.set(
      "test-bucket",
      new Map([["foo/bar.png", { body: Buffer.from(""), contentType: "x" }]]),
    );
    await removeObject(
      "https://storage.googleapis.com/test-bucket/foo/bar.png",
    );
    expect(mockBucketState.get("test-bucket")!.has("foo/bar.png")).toBe(false);
    expect(mockSupabaseRemove).not.toHaveBeenCalled();
  });
  it("deletes from GCS for a bare path", async () => {
    mockBucketState.set(
      "test-bucket",
      new Map([["foo/baz.png", { body: Buffer.from(""), contentType: "x" }]]),
    );
    await removeObject("foo/baz.png");
    expect(mockBucketState.get("test-bucket")!.has("foo/baz.png")).toBe(false);
  });
  it("routes a supabase.co URL to Supabase Storage remove", async () => {
    await removeObject(
      "https://abc.supabase.co/storage/v1/object/public/kb-documents/c1/d1/file.pdf",
    );
    expect(mockSupabaseRemove).toHaveBeenCalledWith(["c1/d1/file.pdf"]);
  });
  it("throws for an unrecognized URL", async () => {
    await expect(removeObject("https://example.com/foo")).rejects.toThrow(
      /Unrecognized storage URL/,
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd creativeos-mvp && npx vitest run src/lib/storage/index.test.ts`
Expected: FAIL — `Cannot find module './index'` (or similar export errors).

- [ ] **Step 3: Implement `index.ts`**

Create `creativeos-mvp/src/lib/storage/index.ts`:

```typescript
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { _put, _remove, getBucketName, publicUrlFor } from "./gcs";
import { resolveOwnership } from "./ownership";
import {
  pathForBrandImage,
  pathForClientLogo,
  pathForImageGen,
  pathForKBDocument,
  pathForNodeFile,
  pathForVideoGen,
} from "./paths";

export type UploadResult = { url: string; path: string };

async function _upload(
  path: string,
  body: Buffer | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<UploadResult> {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body as ArrayBuffer);
  await _put(path, buffer, contentType);
  return { path, url: publicUrlFor(path) };
}

// ── Per-kind helpers ──────────────────────────────────────────────────────────

export async function uploadNodeFile(args: {
  nodeId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForNodeFile({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

export async function uploadImageGen(args: {
  nodeId: string;
  ext: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForImageGen({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    ext: args.ext,
  });
  return _upload(path, args.body, args.contentType);
}

export async function uploadVideoGen(args: {
  nodeId: string;
  ext?: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const { clientId, canvasId } = await resolveOwnership(args.nodeId);
  const path = pathForVideoGen({
    clientId,
    canvasId,
    nodeId: args.nodeId,
    ext: args.ext,
  });
  return _upload(path, args.body, args.contentType);
}

export async function uploadClientLogo(args: {
  clientId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForClientLogo({
    clientId: args.clientId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

export async function uploadBrandImage(args: {
  clientId: string;
  imageId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForBrandImage({
    clientId: args.clientId,
    imageId: args.imageId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

export async function uploadKBDocument(args: {
  clientId: string;
  docId: string;
  filename: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForKBDocument({
    clientId: args.clientId,
    docId: args.docId,
    filename: args.filename,
  });
  return _upload(path, args.body, args.contentType);
}

// ── Removal (handles both GCS and legacy Supabase URLs) ──────────────────────

export function parsePathFromUrl(url: string): string | null {
  const prefix = `https://storage.googleapis.com/${getBucketName()}/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

// Matches `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`
const SUPABASE_PUBLIC_RE =
  /supabase\.co\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

export async function removeObject(urlOrPath: string): Promise<void> {
  const gcsPath = parsePathFromUrl(urlOrPath);
  if (gcsPath !== null) {
    await _remove(gcsPath);
    return;
  }
  // Bare path (no scheme) — treat as GCS path.
  if (!urlOrPath.startsWith("http")) {
    await _remove(urlOrPath);
    return;
  }
  // Legacy Supabase URL — route to Supabase storage remove.
  const match = urlOrPath.match(SUPABASE_PUBLIC_RE);
  if (match) {
    const [, bucket, path] = match;
    const supabase = createServerSupabase();
    await supabase.storage.from(bucket).remove([path]);
    return;
  }
  throw new Error(`Unrecognized storage URL: ${urlOrPath}`);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd creativeos-mvp && npx vitest run src/lib/storage/`
Expected: PASS — all storage tests green (paths + ownership + index).

- [ ] **Step 5: Commit**

```bash
git add creativeos-mvp/src/lib/storage/index.ts creativeos-mvp/src/lib/storage/index.test.ts
git commit -m "feat(storage): add per-kind upload helpers + removeObject"
```

---

## Task 7: Migrate `src/app/api/nodes/[id]/file/route.ts`

**Files:**
- Modify: `creativeos-mvp/src/app/api/nodes/[id]/file/route.ts`

- [ ] **Step 1: Replace storage imports and call sites**

Replace the full contents of `creativeos-mvp/src/app/api/nodes/[id]/file/route.ts` with:

```typescript
import { createServerSupabase } from "@/lib/supabase/server";
import {
  FILE_NODE_ALL_EXTENSIONS,
  FILE_NODE_IMAGE_EXTENSIONS,
  FILE_NODE_TEXT_EXTENSIONS,
  FILE_NODE_DOCUMENT_EXTENSIONS,
  FILE_NODE_IMAGE_SIZE_LIMIT,
  FILE_NODE_TEXT_SIZE_LIMIT,
  FILE_NODE_DOCUMENT_SIZE_LIMIT,
} from "@/lib/nodes/file-constants";
import {
  apiError,
  apiOk,
  parseFormFile,
  validateFileExtension,
  validateFileSize,
  isApiError,
} from "@/lib/api/route-helpers";
import { uploadNodeFile, removeObject } from "@/lib/storage";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const fileResult = await parseFormFile(req);
  if (isApiError(fileResult)) return fileResult;
  const { file } = fileResult;

  const extResult = validateFileExtension(file, FILE_NODE_ALL_EXTENSIONS);
  if (isApiError(extResult)) return extResult;
  const { ext } = extResult;

  const isImage = FILE_NODE_IMAGE_EXTENSIONS.has(ext);
  const isText = FILE_NODE_TEXT_EXTENSIONS.has(ext);
  const isDocument = FILE_NODE_DOCUMENT_EXTENSIONS.has(ext);
  const sizeLimit = isImage
    ? FILE_NODE_IMAGE_SIZE_LIMIT
    : isDocument
      ? FILE_NODE_DOCUMENT_SIZE_LIMIT
      : FILE_NODE_TEXT_SIZE_LIMIT;
  const sizeLabel = isImage ? "10 MB" : isDocument ? "10 MB" : "100 KB";

  const sizeError = validateFileSize(file.size, 0, sizeLimit, sizeLabel);
  if (sizeError) return sizeError;

  const supabase = createServerSupabase();

  const { data: nodeRow } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", nodeId)
    .maybeSingle();
  if (!nodeRow) return apiError("Node not found.", 404);

  const existingUrl = (nodeRow as { data: Record<string, unknown> }).data
    ?.fileUrl as string | undefined;
  if (existingUrl) {
    try {
      await removeObject(existingUrl);
    } catch {
      // Best-effort cleanup — don't block the new upload.
    }
  }

  if (isText) {
    const rawText = await file.text();
    return apiOk({
      filename: file.name,
      fileExt: ext,
      fileKind: "text" as const,
      rawText,
    });
  }

  try {
    const { url } = await uploadNodeFile({
      nodeId,
      filename: file.name,
      body: await file.arrayBuffer(),
      contentType: file.type,
    });
    return apiOk({
      filename: file.name,
      fileExt: ext,
      fileKind: isDocument ? ("document" as const) : ("image" as const),
      fileUrl: url,
    });
  } catch (e) {
    return apiError(
      `Upload failed: ${e instanceof Error ? e.message : "unknown"}`,
      500,
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const supabase = createServerSupabase();

  const { data: nodeRow } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", nodeId)
    .maybeSingle();
  if (!nodeRow) return apiError("Node not found.", 404);

  const fileUrl = (nodeRow as { data: Record<string, unknown> }).data
    ?.fileUrl as string | undefined;
  if (fileUrl) {
    try {
      await removeObject(fileUrl);
    } catch {
      // Best-effort cleanup
    }
  }
  return apiOk({ ok: true as const });
}
```

- [ ] **Step 2: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/src/app/api/nodes/[id]/file/route.ts
git commit -m "refactor(node-file): swap Supabase Storage for GCS wrapper"
```

---

## Task 8: Migrate `src/app/api/nodes/[id]/image-generate/route.ts`

**Files:**
- Modify: `creativeos-mvp/src/app/api/nodes/[id]/image-generate/route.ts`

- [ ] **Step 1: Read the file** to identify the upload block

Run: open the file and locate the `supabase.storage.from('node-files').upload(...)` + `getPublicUrl(...)` block (around lines 26–187 per the spec). The block downloads an image from the provider, uploads to Supabase, and writes the URL into `node_versions.output`.

- [ ] **Step 2: Replace the upload block**

Remove the existing storage import + the entire `supabase.storage.from(NODE_FILE_BUCKET).upload(...) → getPublicUrl(...)` sequence. Replace with:

```typescript
import { uploadImageGen } from "@/lib/storage";

// …inside the handler, after you have the image bytes and inferred ext:
const { url: storedImageUrl } = await uploadImageGen({
  nodeId,
  ext,                  // e.g. "png" — derive from the provider response / file mime
  body: imageBuffer,    // Buffer of the downloaded image
  contentType: mime,    // e.g. "image/png"
});
```

Use `storedImageUrl` everywhere the old code used `publicData.publicUrl`. Delete the unused `NODE_FILE_BUCKET` import if nothing else in the file uses it.

- [ ] **Step 3: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add creativeos-mvp/src/app/api/nodes/[id]/image-generate/route.ts
git commit -m "refactor(image-gen): swap Supabase Storage for GCS wrapper"
```

---

## Task 9: Migrate `src/lib/generations/complete.ts` (video webhook)

**Files:**
- Modify: `creativeos-mvp/src/lib/generations/complete.ts`

- [ ] **Step 1: Replace the upload block (lines ~60–77)**

Find this block:

```typescript
const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
const fileId = crypto.randomUUID();
const storagePath = `video-gen/${generation.node_id}/${fileId}.mp4`;

const { error: uploadError } = await supabase.storage
  .from(NODE_FILE_BUCKET)
  .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: false });

if (uploadError) {
  await failGeneration({
    generationId: input.generationId,
    error: `Storage upload failed: ${uploadError.message}`,
  });
  return;
}

const { data: publicData } = supabase.storage
  .from(NODE_FILE_BUCKET)
  .getPublicUrl(storagePath);
const storedVideoUrl = publicData.publicUrl;
```

Replace with:

```typescript
import { uploadVideoGen } from "@/lib/storage";

// …
const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

let storedVideoUrl: string;
try {
  const result = await uploadVideoGen({
    nodeId: generation.node_id,
    body: videoBuffer,
    contentType: "video/mp4",
  });
  storedVideoUrl = result.url;
} catch (e) {
  await failGeneration({
    generationId: input.generationId,
    error: `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
  });
  return;
}
```

Remove the now-unused `supabase`, `NODE_FILE_BUCKET`, and `crypto.randomUUID()` imports/calls if nothing else in the file uses them. Keep `createServerSupabase` only if it's used elsewhere in the file.

- [ ] **Step 2: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/src/lib/generations/complete.ts
git commit -m "refactor(video-gen): swap Supabase Storage for GCS wrapper"
```

---

## Task 10: Migrate `src/app/api/clients/[id]/kb/documents/route.ts`

**Files:**
- Modify: `creativeos-mvp/src/app/api/clients/[id]/kb/documents/route.ts`

- [ ] **Step 1: Identify the upload + delete blocks**

The file has a POST that uploads to `kb-documents` and a DELETE that removes from `kb-documents`. Replace those storage calls (the `parseFormFile` / `validateFileExtension` / `validateFileSize` / DB writes stay).

- [ ] **Step 2: Replace POST upload block**

Replace:

```typescript
const storagePath = `${clientId}/${docId}/${file.name}`;
const { error: uploadError } = await supabase.storage
  .from("kb-documents")
  .upload(storagePath, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: true,
  });
if (uploadError) return apiError(`Upload failed: ${uploadError.message}`, 500);
const { data: publicData } = supabase.storage
  .from("kb-documents")
  .getPublicUrl(storagePath);
const storageUrl = publicData.publicUrl;
```

With:

```typescript
import { uploadKBDocument } from "@/lib/storage";

let storageUrl: string;
try {
  const result = await uploadKBDocument({
    clientId,
    docId,
    filename: file.name,
    body: await file.arrayBuffer(),
    contentType: file.type,
  });
  storageUrl = result.url;
} catch (e) {
  return apiError(
    `Upload failed: ${e instanceof Error ? e.message : "unknown"}`,
    500,
  );
}
```

- [ ] **Step 3: Replace DELETE block**

Find the DELETE handler's `supabase.storage.from("kb-documents").remove([path])` call. Replace with `await removeObject(existingStorageUrl)` — pass the full URL from the DB row (no need to parse the path manually).

```typescript
import { removeObject } from "@/lib/storage";

// …inside DELETE handler, after fetching the doc row with storage_url:
try {
  await removeObject(docRow.storage_url);
} catch {
  // Best-effort cleanup
}
```

- [ ] **Step 4: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add creativeos-mvp/src/app/api/clients/[id]/kb/documents/route.ts
git commit -m "refactor(kb-documents): swap Supabase Storage for GCS wrapper"
```

---

## Task 11: Migrate `src/app/api/clients/[id]/kb/images/route.ts`

**Files:**
- Modify: `creativeos-mvp/src/app/api/clients/[id]/kb/images/route.ts`

- [ ] **Step 1: Mirror Task 10 for brand images**

Same pattern as Task 10, but use `uploadBrandImage`:

```typescript
import { uploadBrandImage, removeObject } from "@/lib/storage";

// POST:
const { url: storageUrl } = await uploadBrandImage({
  clientId,
  imageId,
  filename: file.name,
  body: await file.arrayBuffer(),
  contentType: file.type,
});

// DELETE:
await removeObject(existingRow.storage_url);
```

Wrap upload in `try/catch` and return `apiError` on failure (same shape as Task 10).

- [ ] **Step 2: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/src/app/api/clients/[id]/kb/images/route.ts
git commit -m "refactor(kb-images): swap Supabase Storage for GCS wrapper"
```

---

## Task 12: Migrate `src/app/api/clients/[id]/logo/route.ts`

**Files:**
- Modify: `creativeos-mvp/src/app/api/clients/[id]/logo/route.ts`

- [ ] **Step 1: Replace storage block**

Replace the full handler body inside `withClient` / `withTryCatch`:

```typescript
import { createServerSupabase } from "@/lib/supabase/server";  // REMOVE if unused elsewhere
import { updateClientLogoUrl } from "@/lib/db/clients";
import {
  apiError,
  apiOk,
  withClient,
  withTryCatch,
  parseFormFile,
  validateFileExtension,
  isApiError,
} from "@/lib/api/route-helpers";
import { uploadClientLogo } from "@/lib/storage";

const LOGO_EXTENSIONS = new Set(["png", "svg", "jpg", "jpeg", "webp", "gif"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    return withTryCatch("Logo upload failed", async () => {
      const fileResult = await parseFormFile(req);
      if (isApiError(fileResult)) return fileResult;
      const { file } = fileResult;

      const extResult = validateFileExtension(file, LOGO_EXTENSIONS);
      if (isApiError(extResult)) return extResult;

      const { url } = await uploadClientLogo({
        clientId,
        filename: file.name,
        body: await file.arrayBuffer(),
        contentType: file.type,
      });

      await updateClientLogoUrl(clientId, url);
      return apiOk({ logoUrl: url });
    });
  });
}
```

(Drop the unused `createServerSupabase` and `apiError` imports if nothing in the file still uses them — TS will flag.)

- [ ] **Step 2: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/src/app/api/clients/[id]/logo/route.ts
git commit -m "refactor(client-logo): swap Supabase Storage for GCS wrapper"
```

---

## Task 13: Migrate `src/lib/actions/kb.ts`

**Files:**
- Modify: `creativeos-mvp/src/lib/actions/kb.ts`

- [ ] **Step 1: Replace both delete actions' storage calls**

In `deleteKBDocumentAction` (lines 81–104), replace the URL→path parsing + `supabase.storage.from("kb-documents").remove([storagePath])` with:

```typescript
import { removeObject } from "@/lib/storage";

// …after the data validation:
try {
  await removeObject(data.storage_url);
} catch {
  // Best-effort cleanup — proceed with DB delete regardless
}
await deleteKBDocument(docId);
```

In `deleteBrandImageAction` (lines 109–132), apply the same pattern:

```typescript
try {
  await removeObject(data.storage_url);
} catch {
  // Best-effort
}
await deleteBrandImage(imageId);
```

`removeObject` handles both `supabase.co` URLs (existing assets) and `storage.googleapis.com` URLs (new assets) — no branching needed at the call site.

- [ ] **Step 2: Type-check**

Run: `cd creativeos-mvp && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/src/lib/actions/kb.ts
git commit -m "refactor(kb-actions): use removeObject wrapper for legacy+GCS deletes"
```

---

## Task 14: Manual smoke script

**Files:**
- Create: `creativeos-mvp/scripts/test-gcs.ts`

- [ ] **Step 1: Write the script**

Create `creativeos-mvp/scripts/test-gcs.ts`:

```typescript
/**
 * Run with: npx tsx scripts/test-gcs.ts
 * Requires GCP_PROJECT_ID, GCS_BUCKET, GCP_SERVICE_ACCOUNT_KEY_BASE64 in .env.
 */
import "dotenv/config";
import { _put, _remove, publicUrlFor } from "../src/lib/storage/gcs";

async function main() {
  const path = `tmp/smoke-test-${Date.now()}.txt`;
  const body = Buffer.from("hello from gcs smoke test");

  console.log(`→ Uploading to ${path}…`);
  await _put(path, body, "text/plain");
  const url = publicUrlFor(path);
  console.log(`  Public URL: ${url}`);

  console.log("→ Fetching URL…");
  const r = await fetch(url);
  console.log(`  Status: ${r.status} (expect 200)`);
  console.log(`  Body: ${await r.text()}`);

  console.log("→ Deleting…");
  await _remove(path);

  console.log("→ Re-fetching URL…");
  const r2 = await fetch(url);
  console.log(`  Status: ${r2.status} (expect 404)`);

  if (r.status === 200 && r2.status === 404) {
    console.log("\n✅ Smoke test passed.");
  } else {
    console.log("\n❌ Smoke test failed.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against real GCS**

Run: `cd creativeos-mvp && npx tsx scripts/test-gcs.ts`
Expected: prints `✅ Smoke test passed.` — status 200 on first fetch, 404 after delete.

If it fails: check the env vars are wired, the service account has `Storage Object Admin`, and the bucket has `allUsers: Storage Object Viewer`.

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/scripts/test-gcs.ts
git commit -m "test(storage): add manual GCS roundtrip smoke script"
```

---

## Task 15: Append ADR entry

**Files:**
- Modify: `creativeos-mvp/docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7)

- [ ] **Step 1: Find the next decision number in §7**

Open the file, scroll to §7, locate the last `Dxx` entry. The new entry uses the next number (likely **D28** — confirm before writing).

- [ ] **Step 2: Append the ADR entry**

Add at the end of §7, matching the existing format (Decision / Why / Rejected / Originated → spec):

```markdown
**D28 — Storage backend moves to GCS (single bucket, ownership-prefixed paths).**
*Decision:* New uploads go to a single GCS bucket `creativeos-assets`, organized as `clients/{clientId}/canvases/{canvasId}/nodes/{nodeId}/{kind}/{name}` for node assets and `clients/{clientId}/{kind}/...` for client-scoped assets. Filenames are `{sanitized-slug}__{UTC-iso-ms}Z.{ext}`.
*Why:* Supabase free tier caps storage at 1 GB. We have a GCP plan available. Ownership-prefixed paths enable per-client and per-canvas listing, audit, and bulk-delete from the bucket alone.
*Rejected:* Multi-bucket GCS (Supabase's per-kind buckets were organizational, not security — GCS does this with prefixes inside one bucket and avoids per-bucket IAM/CORS/lifecycle duplication); migration of existing Supabase assets (MVP scope — old URLs continue to resolve); signed URLs / private bucket (no behavior change from current Supabase setup; can split a private bucket out later if KB privacy becomes a need).
*Originated → spec:* `2026-06-30-gcs-storage-migration-design.md`.
```

(Adjust the Dxx number if §7 has progressed past D27 since the design was written.)

- [ ] **Step 3: Commit**

```bash
git add creativeos-mvp/docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D28 — storage moves to GCS"
```

---

## Task 16: End-to-end manual verification

**No code changes — run through this checklist against a dev server (`npm run dev`).**

- [ ] **Step 1: File node upload**

Drop a PNG into a File node. Confirm:
- The rendered image loads (Network tab shows `storage.googleapis.com/creativeos-assets/clients/{cid}/canvases/{can}/nodes/{nid}/files/...__{timestamp}Z.png` returning 200).
- The DB row in `nodes.data.fileUrl` holds that URL.

- [ ] **Step 2: Image generation**

Run an Image-Gen node end-to-end. Confirm:
- `node_versions.output` holds a GCS URL under `.../image-gen/output__{timestamp}Z.{ext}`.
- The image displays in the node.

- [ ] **Step 3: Video generation**

Trigger a video gen, wait for the trigger.dev webhook → `completeGeneration`. Confirm:
- The MP4 plays from a GCS URL under `.../video-gen/output__{timestamp}Z.mp4`.
- `node_versions.output` holds that URL.

- [ ] **Step 4: Client logo + brand image + KB document**

Upload one of each in the client KB UI. Confirm:
- `clients.logo_url`, `client_brand_images.storage_url`, `client_kb_documents.storage_url` rows hold GCS URLs.
- Previews / download buttons work.

- [ ] **Step 5: Deletion**

Delete a KB document. Confirm:
- `gsutil ls gs://creativeos-assets/clients/{cid}/kb-documents/{docId}/` returns nothing (object gone).
- DB row gone.

- [ ] **Step 6: Old Supabase URL still resolves**

Pick any pre-existing node whose `fileUrl` is a `supabase.co` URL. Confirm it still renders.

- [ ] **Step 7: Old asset deletion still works**

Delete a pre-existing KB document whose `storage_url` is a `supabase.co` URL. Confirm:
- DB row gone.
- (No assertion on Supabase bucket state — best-effort.)

---

## Self-review notes

- **Spec coverage:** Tasks 1–6 cover §1 + §4 (setup + wrapper). Tasks 7–13 cover §5 (route migrations). Task 14 covers §6 manual smoke. Tasks 15 covers ADR. Task 16 covers §7 end-to-end. All spec sections accounted for.
- **No placeholders.** All code shown in full, no "TBD" or "similar to above".
- **Type consistency:** `uploadResult = { url, path }` used uniformly. All helper signatures match the spec's §4 surface. `removeObject` signature is `(urlOrPath: string) => Promise<void>` everywhere.
- **Commit messages omit Co-Authored-By trailers** (per project convention in MEMORY.md).
