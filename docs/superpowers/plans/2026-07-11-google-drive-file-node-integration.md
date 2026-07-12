# Google Drive File Node Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to pick files from a team-owned Google Drive folder directly inside the File node focus view; picked files are downloaded server-side and uploaded to GCS, making the node behave identically to a locally uploaded file.

**Architecture:** A new `GET /api/drive/picker-token` route exchanges a stored refresh token for a short-lived access token used by the Google Picker JS SDK on the client. When the user picks a file, `POST /api/nodes/[id]/file/drive` fetches the file bytes from Drive server-side and uploads them to GCS via the existing `uploadNodeFile()` infra. `FileNodeData` gets three new optional fields (`driveFileId`, `driveFileName`, `driveMimeType`) for provenance — the rest of the node is unchanged.

**Tech Stack:** Next.js App Router route handlers, Google Drive API v3, Google Picker API (client-side JS SDK), `@google-cloud/storage` (existing), Vitest for unit tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/canvas-nodes.ts` | Add `driveFileId`, `driveFileName`, `driveMimeType` to `FileNodeData` |
| Create | `src/lib/drive/client.ts` | Server-side Drive API helpers: token exchange + file fetch |
| Create | `src/lib/drive/client.test.ts` | Unit tests for Drive helpers |
| Create | `src/app/api/drive/picker-token/route.ts` | `GET` — returns short-lived access token + clientId |
| Create | `src/app/api/drive/picker-token/route.test.ts` | Unit tests for picker-token route |
| Create | `src/app/api/nodes/[id]/file/drive/route.ts` | `POST` — fetch from Drive, upload to GCS, return FileNodeData patch |
| Create | `src/app/api/nodes/[id]/file/drive/route.test.ts` | Unit tests for drive upload route |
| Create | `src/hooks/use-google-picker.ts` | Client hook: lazy-load Picker SDK, open picker, return picked file metadata |
| Modify | `src/components/nodes/file-focus-view.tsx` | Add "Pick from Google Drive" button + wire to hook + call drive service |
| Modify | `src/services/file-node.service.ts` | Add `pickFromDrive(nodeId, driveFile)` method |
| Modify | `.env.example` | Document new env vars |

---

## Task 1: Extend FileNodeData type

**Files:**
- Modify: `src/lib/canvas-nodes.ts`

- [ ] **Step 1: Add drive fields to FileNodeData**

Open `src/lib/canvas-nodes.ts` and add three optional fields to `FileNodeData`:

```typescript
export type FileNodeData = {
  title?: string;
  filename?: string;
  fileExt?: string;
  fileKind?: "text" | "image" | "document";
  fileUrl?: string;
  rawText?: string;
  useLlm?: boolean;
  llmPrompt?: string;
  processedOutput?: string;
  fileSizeBytes?: number;
  imageWidth?: number;
  imageHeight?: number;
  // Drive provenance — set when file originated from Google Drive
  driveFileId?: string;
  driveFileName?: string;
  driveMimeType?: string;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd e:\CreativeOS\creativeos-mvp
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/canvas-nodes.ts
git commit -m "feat(file-node): add drive provenance fields to FileNodeData"
```

---

## Task 2: Server-side Drive API helpers

**Files:**
- Create: `src/lib/drive/client.ts`
- Create: `src/lib/drive/client.test.ts`

These helpers do two things: exchange a refresh token for an access token, and fetch file bytes from Drive using that token.

- [ ] **Step 1: Write failing tests**

Create `src/lib/drive/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("exchangeRefreshToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GDRIVE_CLIENT_ID = "test-client-id";
    process.env.GDRIVE_CLIENT_SECRET = "test-client-secret";
    process.env.GDRIVE_REFRESH_TOKEN = "test-refresh-token";
  });

  it("returns access token on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "ya29.test", expires_in: 3600 }),
    });

    const { exchangeRefreshToken } = await import("./client");
    const token = await exchangeRefreshToken();
    expect(token).toBe("ya29.test");
  });

  it("throws when Google returns an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "invalid_grant",
    });

    const { exchangeRefreshToken } = await import("./client");
    await expect(exchangeRefreshToken()).rejects.toThrow("Drive token exchange failed");
  });

  it("throws when env vars are missing", async () => {
    delete process.env.GDRIVE_CLIENT_ID;

    const { exchangeRefreshToken } = await import("./client");
    await expect(exchangeRefreshToken()).rejects.toThrow("GDRIVE_CLIENT_ID");
  });
});

describe("fetchDriveFileBuffer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns buffer and content-type on success", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => (h === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => fakeBytes.buffer,
    });

    const { fetchDriveFileBuffer } = await import("./client");
    const result = await fetchDriveFileBuffer("file-id-123", "ya29.test");
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.contentType).toBe("image/png");
  });

  it("throws when Drive returns 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });

    const { fetchDriveFileBuffer } = await import("./client");
    await expect(fetchDriveFileBuffer("file-id-123", "ya29.test")).rejects.toThrow(
      "Failed to fetch Drive file"
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/drive/client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Drive helpers**

Create `src/lib/drive/client.ts`:

```typescript
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export async function exchangeRefreshToken(): Promise<string> {
  const clientId = requireEnv("GDRIVE_CLIENT_ID");
  const clientSecret = requireEnv("GDRIVE_CLIENT_SECRET");
  const refreshToken = requireEnv("GDRIVE_REFRESH_TOKEN");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive token exchange failed: ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

export async function fetchDriveFileBuffer(
  fileId: string,
  accessToken: string
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Drive file ${fileId}: ${res.status} ${text}`);
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer, contentType };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/drive/client.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/drive/client.ts src/lib/drive/client.test.ts
git commit -m "feat(drive): add server-side Drive token exchange and file fetch helpers"
```

---

## Task 3: Picker token API route

**Files:**
- Create: `src/app/api/drive/picker-token/route.ts`
- Create: `src/app/api/drive/picker-token/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/drive/picker-token/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(),
}));

import { exchangeRefreshToken } from "@/lib/drive/client";

describe("GET /api/drive/picker-token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GDRIVE_CLIENT_ID = "test-client-id";
  });

  it("returns accessToken and clientId", async () => {
    vi.mocked(exchangeRefreshToken).mockResolvedValueOnce("ya29.test");

    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accessToken).toBe("ya29.test");
    expect(body.clientId).toBe("test-client-id");
  });

  it("returns 500 when token exchange fails", async () => {
    vi.mocked(exchangeRefreshToken).mockRejectedValueOnce(new Error("invalid_grant"));

    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Google Drive/i);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/drive/picker-token/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement route**

Create `src/app/api/drive/picker-token/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";

export async function GET() {
  try {
    const accessToken = await exchangeRefreshToken();
    const clientId = process.env.GDRIVE_CLIENT_ID ?? "";
    return NextResponse.json({ accessToken, clientId });
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Google Drive. Check server configuration." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/app/api/drive/picker-token/route.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/drive/picker-token/route.ts src/app/api/drive/picker-token/route.test.ts
git commit -m "feat(drive): add GET /api/drive/picker-token route"
```

---

## Task 4: Drive file upload route

**Files:**
- Create: `src/app/api/nodes/[id]/file/drive/route.ts`
- Create: `src/app/api/nodes/[id]/file/drive/route.test.ts`

This route receives a picked Drive file's metadata, downloads the file bytes server-side, and uploads to GCS using the existing `uploadNodeFile()`.

- [ ] **Step 1: Write failing tests**

Create `src/app/api/nodes/[id]/file/drive/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn().mockResolvedValue("ya29.test"),
  fetchDriveFileBuffer: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  uploadNodeFile: vi.fn(),
  removeObject: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { exchangeRefreshToken, fetchDriveFileBuffer } from "@/lib/drive/client";
import { uploadNodeFile, removeObject } from "@/lib/storage";

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/nodes/node-1/file/drive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "node-1" });

describe("POST /api/nodes/[id]/file/drive", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(exchangeRefreshToken).mockResolvedValue("ya29.test");
  });

  it("returns 400 for unsupported MIME type", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "abc", driveFileName: "virus.exe", driveMimeType: "application/x-msdownload" }),
      { params }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not supported/i);
  });

  it("uploads image to GCS and returns FileNodeData patch", async () => {
    const fakeBuffer = new ArrayBuffer(100);
    vi.mocked(fetchDriveFileBuffer).mockResolvedValueOnce({
      buffer: fakeBuffer,
      contentType: "image/png",
    });
    vi.mocked(uploadNodeFile).mockResolvedValueOnce({
      url: "https://storage.googleapis.com/bucket/path/logo.png",
      path: "path/logo.png",
    });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "file-123", driveFileName: "logo.png", driveMimeType: "image/png" }),
      { params }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileUrl).toBe("https://storage.googleapis.com/bucket/path/logo.png");
    expect(body.fileKind).toBe("image");
    expect(body.fileExt).toBe("png");
    expect(body.driveFileId).toBe("file-123");
    expect(body.driveFileName).toBe("logo.png");
    expect(body.driveMimeType).toBe("image/png");
  });

  it("stores rawText inline for text/plain files", async () => {
    const encoder = new TextEncoder();
    const fakeBuffer = encoder.encode("hello world").buffer;
    vi.mocked(fetchDriveFileBuffer).mockResolvedValueOnce({
      buffer: fakeBuffer,
      contentType: "text/plain",
    });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "txt-1", driveFileName: "notes.txt", driveMimeType: "text/plain" }),
      { params }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rawText).toBe("hello world");
    expect(body.fileUrl).toBeUndefined();
    expect(uploadNodeFile).not.toHaveBeenCalled();
  });

  it("returns 400 when body is missing required fields", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "abc" }), // missing driveFileName + driveMimeType
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when Drive fetch fails", async () => {
    vi.mocked(fetchDriveFileBuffer).mockRejectedValueOnce(new Error("403 Forbidden"));

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ driveFileId: "bad", driveFileName: "img.png", driveMimeType: "image/png" }),
      { params }
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Google Drive/i);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/nodes/[id]/file/drive/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/nodes/[id]/file/drive/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { exchangeRefreshToken, fetchDriveFileBuffer } from "@/lib/drive/client";
import { uploadNodeFile, removeObject } from "@/lib/storage";
import { createServerSupabase } from "@/lib/supabase/server";

const ALLOWED_MIME_TYPES: Record<string, { ext: string; fileKind: "image" | "document" | "text" }> = {
  "image/png": { ext: "png", fileKind: "image" },
  "image/jpeg": { ext: "jpg", fileKind: "image" },
  "image/webp": { ext: "webp", fileKind: "image" },
  "application/pdf": { ext: "pdf", fileKind: "document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    fileKind: "document",
  },
  "text/plain": { ext: "txt", fileKind: "text" },
};

const MAX_BYTES_IMAGE_DOC = 10 * 1024 * 1024; // 10 MB
const MAX_BYTES_TEXT = 100 * 1024; // 100 KB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: nodeId } = await params;

  let body: { driveFileId?: string; driveFileName?: string; driveMimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { driveFileId, driveFileName, driveMimeType } = body;
  if (!driveFileId || !driveFileName || !driveMimeType) {
    return NextResponse.json(
      { error: "driveFileId, driveFileName, and driveMimeType are required" },
      { status: 400 }
    );
  }

  const mimeInfo = ALLOWED_MIME_TYPES[driveMimeType];
  if (!mimeInfo) {
    return NextResponse.json(
      { error: `File type not supported: ${driveMimeType}` },
      { status: 400 }
    );
  }

  const { ext, fileKind } = mimeInfo;

  try {
    const accessToken = await exchangeRefreshToken();
    const { buffer, contentType } = await fetchDriveFileBuffer(driveFileId, accessToken);

    // Enforce size limits
    const maxBytes = fileKind === "text" ? MAX_BYTES_TEXT : MAX_BYTES_IMAGE_DOC;
    if (buffer.byteLength > maxBytes) {
      const limitLabel = fileKind === "text" ? "100 KB" : "10 MB";
      return NextResponse.json(
        { error: `File too large. Maximum size is ${limitLabel}.` },
        { status: 400 }
      );
    }

    // Clean up existing file if present
    const supabase = createServerSupabase();
    const { data: node } = await supabase
      .from("nodes")
      .select("data")
      .eq("id", nodeId)
      .single();
    const existingUrl = node?.data?.fileUrl as string | undefined;
    if (existingUrl) {
      await removeObject(existingUrl);
    }

    // Text files stored inline — no GCS upload
    if (fileKind === "text") {
      const rawText = new TextDecoder().decode(buffer);
      return NextResponse.json({
        filename: driveFileName,
        fileExt: ext,
        fileKind,
        rawText,
        fileSizeBytes: buffer.byteLength,
        driveFileId,
        driveFileName,
        driveMimeType,
      });
    }

    // Images and documents — upload to GCS
    const { url: fileUrl } = await uploadNodeFile({
      nodeId,
      filename: driveFileName,
      body: Buffer.from(buffer),
      contentType: contentType,
    });

    return NextResponse.json({
      filename: driveFileName,
      fileExt: ext,
      fileKind,
      fileUrl,
      fileSizeBytes: buffer.byteLength,
      driveFileId,
      driveFileName,
      driveMimeType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to import file from Google Drive: ${message}` },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/app/api/nodes/[id]/file/drive/route.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/nodes/[id]/file/drive/route.ts src/app/api/nodes/[id]/file/drive/route.test.ts
git commit -m "feat(drive): add POST /api/nodes/[id]/file/drive route"
```

---

## Task 5: Client-side Drive picker hook

**Files:**
- Create: `src/hooks/use-google-picker.ts`

This hook lazy-loads the Google Picker JS SDK and opens the picker. No unit test (browser SDK interaction — not testable in Node/Vitest).

- [ ] **Step 1: Declare the picked file type**

At the top of `src/hooks/use-google-picker.ts`, define the return shape from the Picker callback:

```typescript
export type DrivePickedFile = {
  driveFileId: string;
  driveFileName: string;
  driveMimeType: string;
};
```

- [ ] **Step 2: Implement the hook**

Full file `src/hooks/use-google-picker.ts`:

```typescript
"use client";

import { useCallback, useRef } from "react";

export type DrivePickedFile = {
  driveFileId: string;
  driveFileName: string;
  driveMimeType: string;
};

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

function loadPickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));
    if ((window as any).google?.picker) return resolve();
    const existing = document.getElementById("gapi-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(script);
  });
}

export function useGooglePicker(onPick: (file: DrivePickedFile) => void) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const openPicker = useCallback(async () => {
    await loadPickerScript();

    // Load the picker library
    await new Promise<void>((resolve) => {
      (window as any).gapi.load("picker", { callback: resolve });
    });

    // Fetch token from our server
    const tokenRes = await fetch("/api/drive/picker-token");
    if (!tokenRes.ok) throw new Error("Could not connect to Google Drive");
    const { accessToken, clientId } = await tokenRes.json();

    const google = (window as any).google;

    const picker = new google.picker.PickerBuilder()
      .addView(
        new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes(ALLOWED_MIME_TYPES)
      )
      .setOAuthToken(accessToken)
      .setDeveloperKey("") // not needed when using OAuth token
      .setAppId(clientId)
      .setSelectableMimeTypes(ALLOWED_MIME_TYPES)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          onPickRef.current({
            driveFileId: doc.id,
            driveFileName: doc.name,
            driveMimeType: doc.mimeType,
          });
        }
      })
      .build();

    picker.setVisible(true);
  }, []);

  return { openPicker };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-google-picker.ts
git commit -m "feat(drive): add useGooglePicker hook for client-side Picker SDK"
```

---

## Task 6: Add pickFromDrive to file node service

**Files:**
- Modify: `src/services/file-node.service.ts`

- [ ] **Step 1: Add the DrivePickedFile import and pickFromDrive method**

Open `src/services/file-node.service.ts`. At the top, add the import:

```typescript
import type { DrivePickedFile } from "@/hooks/use-google-picker";
```

Then add a `pickFromDrive` method to the `FileNodeService` class (alongside the existing `upload`, `remove`, `extract` methods):

```typescript
async pickFromDrive(nodeId: string, driveFile: DrivePickedFile): Promise<FileUploadResult> {
  const res = await fetch(`/api/nodes/${nodeId}/file/drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(driveFile),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to import file from Google Drive");
  }
  return res.json() as Promise<FileUploadResult>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/file-node.service.ts
git commit -m "feat(drive): add pickFromDrive method to FileNodeService"
```

---

## Task 7: Wire Drive picker into File focus view

**Files:**
- Modify: `src/components/nodes/file-focus-view.tsx`

- [ ] **Step 1: Add the Drive picker button and handler**

Open `src/components/nodes/file-focus-view.tsx`.

Add the import at the top (alongside existing imports):

```typescript
import { useGooglePicker } from "@/hooks/use-google-picker";
```

Inside the component, after the existing state declarations, add the picker setup and handler. Add this after the `handleRemove` function:

```typescript
const handleDrivePick = useCallback(
  async (driveFile: { driveFileId: string; driveFileName: string; driveMimeType: string }) => {
    setReplacing(true);
    try {
      const result = await fileNodeService.pickFromDrive(nodeId, driveFile);
      const title = result.filename
        ? result.filename.replace(/\.[^.]+$/, "")
        : data.title ?? "";
      onUpdate({ ...result, title });
      toast.success("File imported from Google Drive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import from Google Drive");
    } finally {
      setReplacing(false);
    }
  },
  [nodeId, data.title, onUpdate]
);

const handleOpenPicker = useCallback(async () => {
  try {
    await openPicker();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not open Google Drive");
  }
}, [openPicker]);

const { openPicker } = useGooglePicker(handleDrivePick);
```

> Note: declare `openPicker` before `handleOpenPicker` uses it. Reorder so `useGooglePicker` call comes before `handleOpenPicker`.

The correct order in the component body:

```typescript
const { openPicker } = useGooglePicker(handleDrivePick);

const handleOpenPicker = useCallback(async () => {
  try {
    await openPicker();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not open Google Drive");
  }
}, [openPicker]);
```

- [ ] **Step 2: Add the button to the empty/upload UI**

In the `file-focus-view.tsx` render, find the section that renders the "Upload" button (in the empty state). It should look something like a `<label>` or `<Button>` that triggers `handleUpload`. Add the Drive button as a sibling:

```tsx
{/* existing upload button */}
<Button variant="outline" asChild>
  <label className="cursor-pointer">
    <input
      type="file"
      className="sr-only"
      accept=".txt,.png,.jpg,.jpeg,.webp,.pdf,.docx"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) handleUpload(f);
        e.target.value = "";
      }}
    />
    Upload from computer
  </label>
</Button>

{/* new Drive button */}
<Button
  variant="outline"
  onClick={handleOpenPicker}
  disabled={replacing || loading}
>
  Pick from Google Drive
</Button>
```

Also add the Drive button to the **replace state** (when a file already exists), alongside the existing replace/remove actions:

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={handleOpenPicker}
  disabled={replacing}
>
  Replace from Drive
</Button>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/file-focus-view.tsx
git commit -m "feat(drive): add Google Drive picker button to file focus view"
```

---

## Task 8: Environment variables

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document new env vars**

Open `.env.example` and add a new section for Google Drive:

```bash
# Google Drive integration (for File node "Pick from Google Drive" feature)
# Register an OAuth 2.0 Web Application client in GCP Console
GDRIVE_CLIENT_ID=
GDRIVE_CLIENT_SECRET=
# Refresh token for the team Google account that owns/has access to client folders
GDRIVE_REFRESH_TOKEN=
```

- [ ] **Step 2: Add vars to local .env**

Add the three new vars to your local `.env` file with real values from GCP Console. (Not committed.)

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: document GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN env vars"
```

---

## Task 9: Full run test

**Manual verification steps:**

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open a canvas with a File node, open its focus view**

Open any client canvas → add or click a File node → open the focus view.

- [ ] **Step 3: Click "Pick from Google Drive"**

The Google Picker should open. Browse to a shared client folder. Pick an image (e.g., a PNG logo).

Expected:
- Picker opens with Google's native UI
- After picking, loading state shows on the node
- File preview appears in the focus view (same as a locally uploaded image)
- Toast: "File imported from Google Drive"

- [ ] **Step 4: Verify GCS — not Drive — is the source**

Check the `fileUrl` in the node data (open browser devtools → network → canvas save request). It should be `https://storage.googleapis.com/...`, not a Drive URL.

- [ ] **Step 5: Test with a PDF**

Repeat with a PDF file. Verify the document preview renders.

- [ ] **Step 6: Test with a text file**

Repeat with a `.txt` file. Verify `rawText` is populated and the text preview shows.

- [ ] **Step 7: Test unsupported file type**

In the picker, try to pick a `.mp4` or `.exe` — it should not appear because `setSelectableMimeTypes` filters to the allowlist.

- [ ] **Step 8: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Step 9: Final commit if any tweaks made**

```bash
git add -p
git commit -m "fix(drive): manual test tweaks"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Auth: team refresh token → short-lived access token | Task 2 + Task 3 |
| New env vars: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN | Task 8 |
| FileNodeData: driveFileId, driveFileName, driveMimeType fields | Task 1 |
| UI: "Pick from Google Drive" button in file focus view | Task 7 |
| Picker: lazy-load SDK, configure MIME allowlist, selectFolderEnabled=false | Task 5 |
| POST /api/nodes/[id]/file/drive route | Task 4 |
| Download from Drive server-side, upload to GCS | Task 4 |
| Text files stored as rawText inline (no GCS) | Task 4 |
| Old GCS file removed on replace | Task 4 |
| Same size limits as local upload | Task 4 |
| Error handling: picker token fail, drive fetch fail, unsupported MIME | Tasks 3, 4, 5, 7 |

**Type consistency check:**
- `DrivePickedFile` defined in `use-google-picker.ts`, imported in `file-node.service.ts` and used in `file-focus-view.tsx` — consistent.
- Route response shape matches `FileUploadResult` plus drive fields — `pickFromDrive` returns `FileUploadResult` which is a superset.
- `fileKind`, `fileExt`, `fileUrl`, `rawText` all use exact same names as existing `FileNodeData`.
