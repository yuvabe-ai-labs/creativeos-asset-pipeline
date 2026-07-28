# Reference Clipper Implementation Plan

> ## ⛔ RETIRED — 2026-07-28 (D82). Do not execute this plan.
>
> This plan was executed and the feature shipped on 2026-07-05. It has since been **removed from
> the codebase** and superseded by **Client Moodboards (D81)** — see
> [`2026-07-22-client-moodboards-design.md`](../specs/2026-07-22-client-moodboards-design.md) and
> the retirement banner on
> [`2026-07-05-reference-clipper-design.md`](../specs/2026-07-05-reference-clipper-design.md).
> Kept as a historical record only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome side-panel extension that collects image references while browsing and pushes them, on demand, as File nodes onto the CreativeOS canvas open in the active tab.

**Architecture:** The extension (plain MV3, no build step) collects right-clicked images into `chrome.storage.local` and, on "Push," fetches each image's bytes and POSTs them — plus the active tab's full URL — to one new open, slug-based route `POST /api/ingest-image`. The route parses the URL to slugs, resolves the canvas, creates a `file` node, uploads the image to GCS (reusing `uploadNodeFile`), and returns. The extension then reloads the tab so the new nodes render via the canvas's normal server-component load. No realtime.

**Tech Stack:** Next.js (App Router, Node runtime route handler), Supabase (service-role server client), Google Cloud Storage (`uploadNodeFile`), Chrome Extensions Manifest V3 (`contextMenus`, `sidePanel`, `storage`, `tabs`), Vitest (node env) for the pure logic.

**Spec:** [docs/superpowers/specs/2026-07-05-reference-clipper-design.md](../specs/2026-07-05-reference-clipper-design.md)

## Global Constraints

- **Extension has no build step** — plain `.js`/`.html`/`.css` in `clipper-extension/`, loaded unpacked. No npm deps, no bundler, no TypeScript in the extension.
- **Manifest V3.** Permissions: `contextMenus`, `storage`, `sidePanel`, `tabs`. `host_permissions: ["<all_urls>"]` (fetch arbitrary image bytes + POST to any app origin).
- **No new npm dependencies** anywhere.
- **Route conventions** ([docs/api-routes.md](../../api-routes.md)): use `apiError` / `apiOk` — never `NextResponse.json` directly. Wrap the async work in `withTryCatch`. The route is deliberately top-level and slug-based — it does **not** use `withClient` (that helper resolves a client **UUID**; the extension only has slugs).
- **Image constraints — reuse, don't redeclare:** import `FILE_NODE_IMAGE_EXTENSIONS` (`png`, `jpg`, `jpeg`, `webp`) and `FILE_NODE_IMAGE_SIZE_LIMIT` (10 MB) from `@/lib/nodes/file-constants`.
- **Node row ordering:** the `nodes` row MUST be inserted before `uploadNodeFile`, because `resolveOwnership(nodeId)` walks node→canvas→client to build the GCS path (same ordering the paste flow uses).
- **Endpoint is open** (no auth) — matches D14. Do not add auth in this plan.
- **Tests:** pure logic lives under `src/lib/reference-clipper/` and is unit-tested with vitest (`environment: "node"`, `include: ["src/**/*.test.ts"]`). The route and the extension are verified **manually** by running the app — this matches the repo convention (routes/UI are not unit-tested here; the load-bearing logic is extracted into tested pure functions, exactly as the generation-tray spec §11 does).
- **No existing app files are modified.** Everything is additive.

---

## File Structure

**New — app (TypeScript, tested):**
- `src/lib/reference-clipper/canvas-url.ts` — `parseCanvasUrl(url)`; the one source of truth for "is this a canvas URL, and what are its slugs?"
- `src/lib/reference-clipper/canvas-url.test.ts`
- `src/lib/reference-clipper/position.ts` — `computeStaggeredPosition(existingCount)`.
- `src/lib/reference-clipper/position.test.ts`
- `src/app/api/ingest-image/route.ts` — the ingest route (thin glue over the two pure functions + existing helpers).

**New — extension (plain JS/HTML/CSS, manual verification):**
- `clipper-extension/manifest.json`
- `clipper-extension/background.js` — context menu → collect into storage.
- `clipper-extension/sidepanel.html`
- `clipper-extension/sidepanel.css`
- `clipper-extension/sidepanel.js` — render collection + remove (Task 5), push (Task 6).

**Modified:** none.

---

## Task 1: `parseCanvasUrl` pure function

**Files:**
- Create: `src/lib/reference-clipper/canvas-url.ts`
- Test: `src/lib/reference-clipper/canvas-url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseCanvasUrl(url: string): { clientSlug: string; canvasSlug: string } | null` — used by the route (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/lib/reference-clipper/canvas-url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCanvasUrl } from "./canvas-url";

describe("parseCanvasUrl", () => {
  it("extracts client + canvas slugs from a canvas URL", () => {
    expect(parseCanvasUrl("http://localhost:3000/clients/acme/canvases/reel-1")).toEqual({
      clientSlug: "acme",
      canvasSlug: "reel-1",
    });
  });

  it("ignores trailing path segments and query strings", () => {
    expect(
      parseCanvasUrl("http://localhost:3000/clients/acme/canvases/reel-1/foo?tab=evals"),
    ).toEqual({ clientSlug: "acme", canvasSlug: "reel-1" });
  });

  it("works for a production origin", () => {
    expect(parseCanvasUrl("https://creativeos.app/clients/acme/canvases/reel-1")).toEqual({
      clientSlug: "acme",
      canvasSlug: "reel-1",
    });
  });

  it("returns null for a non-canvas page", () => {
    expect(parseCanvasUrl("http://localhost:3000/clients/acme")).toBeNull();
  });

  it("returns null for a non-URL string", () => {
    expect(parseCanvasUrl("not a url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reference-clipper/canvas-url.test.ts`
Expected: FAIL — `Failed to resolve import "./canvas-url"` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reference-clipper/canvas-url.ts`:

```ts
export type ParsedCanvasUrl = { clientSlug: string; canvasSlug: string };

// Extracts the client + canvas slugs from a CreativeOS canvas page URL:
//   {origin}/clients/{clientSlug}/canvases/{canvasSlug}[/...][?query]
// Returns null for any URL that doesn't match that shape (or isn't a URL).
export function parseCanvasUrl(url: string): ParsedCanvasUrl | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = pathname.match(/^\/clients\/([^/]+)\/canvases\/([^/]+)/);
  if (!m) return null;
  return { clientSlug: m[1], canvasSlug: m[2] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reference-clipper/canvas-url.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reference-clipper/canvas-url.ts src/lib/reference-clipper/canvas-url.test.ts
git commit -m "feat(reference-clipper): parseCanvasUrl — canvas URL → slugs"
```

---

## Task 2: `computeStaggeredPosition` pure function

**Files:**
- Create: `src/lib/reference-clipper/position.ts`
- Test: `src/lib/reference-clipper/position.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `computeStaggeredPosition(existingCount: number): { x: number; y: number }` — used by the route (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/lib/reference-clipper/position.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeStaggeredPosition } from "./position";

describe("computeStaggeredPosition", () => {
  it("places the first node at the base origin", () => {
    expect(computeStaggeredPosition(0)).toEqual({ x: 40, y: 40 });
  });

  it("steps down by a fixed amount per existing node", () => {
    expect(computeStaggeredPosition(3)).toEqual({ x: 40, y: 220 });
  });

  it("increases monotonically in y as the count grows", () => {
    const a = computeStaggeredPosition(1).y;
    const b = computeStaggeredPosition(2).y;
    expect(b).toBeGreaterThan(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reference-clipper/position.test.ts`
Expected: FAIL — `Failed to resolve import "./position"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/reference-clipper/position.ts`:

```ts
export type Position = { x: number; y: number };

// A deliberately simple v1 heuristic: drop incoming reference nodes in a tidy
// left-edge column, stepping down per existing node so a batch push doesn't
// stack on one spot. The user drags them into place; refine later if needed.
const BASE_X = 40;
const BASE_Y = 40;
const STEP_Y = 60;

export function computeStaggeredPosition(existingCount: number): Position {
  return { x: BASE_X, y: BASE_Y + existingCount * STEP_Y };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reference-clipper/position.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reference-clipper/position.ts src/lib/reference-clipper/position.test.ts
git commit -m "feat(reference-clipper): computeStaggeredPosition — column stagger"
```

---

## Task 3: Ingest route

**Files:**
- Create: `src/app/api/ingest-image/route.ts`

**Interfaces:**
- Consumes: `parseCanvasUrl` (Task 1), `computeStaggeredPosition` (Task 2); existing `apiError`, `apiOk`, `validateFileExtension`, `validateFileSize`, `isApiError`, `withTryCatch` from `@/lib/api/route-helpers`; `getClientBySlug`, `getCanvasBySlug`, `uploadNodeFile`, `createServerSupabase`, `FILE_NODE_IMAGE_EXTENSIONS`, `FILE_NODE_IMAGE_SIZE_LIMIT`.
- Produces: `POST /api/ingest-image` — multipart body `{ file, canvasUrl, sourceUrl }` → `201 { nodeId, fileUrl }`. Consumed by the extension (Task 6).

**Note on testing:** per the Global Constraints, this route is verified manually (repo convention — routes are not unit-tested here). The load-bearing logic already has unit tests (Tasks 1–2). Do not scaffold a route test harness.

- [ ] **Step 1: Write the route**

Create `src/app/api/ingest-image/route.ts`:

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import {
  apiError,
  apiOk,
  validateFileExtension,
  validateFileSize,
  isApiError,
  withTryCatch,
} from "@/lib/api/route-helpers";
import {
  FILE_NODE_IMAGE_EXTENSIONS,
  FILE_NODE_IMAGE_SIZE_LIMIT,
} from "@/lib/nodes/file-constants";
import { getClientBySlug } from "@/lib/db/clients";
import { getCanvasBySlug } from "@/lib/db/canvases";
import { uploadNodeFile } from "@/lib/storage";
import { parseCanvasUrl } from "@/lib/reference-clipper/canvas-url";
import { computeStaggeredPosition } from "@/lib/reference-clipper/position";

// POST /api/ingest-image — create an image File node on a canvas from the browser
// extension. Slug-based (the extension only has slugs from the canvas URL), so it
// deliberately does NOT use withClient (that helper resolves a client UUID). Open,
// like the rest of the app (D14).
export async function POST(req: Request) {
  return withTryCatch("Failed to ingest image.", async () => {
    // Read the multipart body ONCE — parseFormFile re-reads req.formData(), so it
    // isn't composable with also reading the URL fields.
    const form = await req.formData();

    const canvasUrl = form.get("canvasUrl");
    if (typeof canvasUrl !== "string") {
      return apiError("A 'canvasUrl' field is required.", 400);
    }
    const parsed = parseCanvasUrl(canvasUrl);
    if (!parsed) return apiError("Not a valid canvas URL.", 400);

    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("A 'file' field is required.", 400);
    }

    const extResult = validateFileExtension(file, FILE_NODE_IMAGE_EXTENSIONS);
    if (isApiError(extResult)) return extResult;
    const { ext } = extResult;

    const sizeError = validateFileSize(
      file.size,
      0,
      FILE_NODE_IMAGE_SIZE_LIMIT,
      "10 MB",
    );
    if (sizeError) return sizeError;

    const client = await getClientBySlug(parsed.clientSlug);
    if (!client) return apiError("Client not found.", 404);
    const canvas = await getCanvasBySlug(client.id, parsed.canvasSlug);
    if (!canvas) return apiError("Canvas not found.", 404);

    const supabase = createServerSupabase();

    // Stagger by current node count so a batch push lands as a readable column.
    const { count } = await supabase
      .from("nodes")
      .select("id", { count: "exact", head: true })
      .eq("canvas_id", canvas.id);
    const position = computeStaggeredPosition(count ?? 0);

    const sourceUrlValue = form.get("sourceUrl");
    const sourceUrl = typeof sourceUrlValue === "string" ? sourceUrlValue : null;
    const nodeId = crypto.randomUUID();

    // Insert the row BEFORE upload so resolveOwnership(nodeId) can build the GCS path.
    const dataBase = {
      fileKind: "image" as const,
      filename: file.name,
      fileExt: ext,
      sourceUrl,
    };
    const { error: insertErr } = await supabase.from("nodes").insert({
      id: nodeId,
      canvas_id: canvas.id,
      type: "file",
      position,
      data: { ...dataBase, fileUrl: "" },
    });
    if (insertErr) throw insertErr;

    const { url } = await uploadNodeFile({
      nodeId,
      filename: file.name,
      body: await file.arrayBuffer(),
      contentType: file.type,
    });

    const { error: updateErr } = await supabase
      .from("nodes")
      .update({ data: { ...dataBase, fileUrl: url } })
      .eq("id", nodeId);
    if (updateErr) throw updateErr;

    return apiOk({ nodeId, fileUrl: url }, 201);
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: no errors in `src/app/api/ingest-image/route.ts` (pre-existing unrelated failures noted in project memory may remain).

- [ ] **Step 3: Manually verify the happy path**

Prereqs: the dev server is running (`npm run dev`) with GCS + Supabase env configured, and you know a real client slug + canvas slug in your dev DB. Have any small PNG at `./test.png`.

Run (git bash / curl.exe), substituting your slugs:

```bash
curl -i -X POST http://localhost:3000/api/ingest-image \
  -F "file=@test.png" \
  -F "canvasUrl=http://localhost:3000/clients/<clientSlug>/canvases/<canvasSlug>" \
  -F "sourceUrl=https://example.com/some-page"
```

Expected: `HTTP/1.1 201` and a JSON body `{"nodeId":"<uuid>","fileUrl":"https://storage.googleapis.com/.../<nodeId>/test.png"}`. Open that `fileUrl` in a browser — the image loads.

- [ ] **Step 4: Manually verify it lands on the canvas**

Open `http://localhost:3000/clients/<clientSlug>/canvases/<canvasSlug>` (or reload it). Expected: a new File node showing the image appears in the left-edge column.

- [ ] **Step 5: Manually verify the error paths**

```bash
# Bad canvas URL → 400 "Not a valid canvas URL."
curl -i -X POST http://localhost:3000/api/ingest-image -F "file=@test.png" -F "canvasUrl=http://localhost:3000/"
# Unknown canvas slug → 404 "Canvas not found."
curl -i -X POST http://localhost:3000/api/ingest-image -F "file=@test.png" -F "canvasUrl=http://localhost:3000/clients/<clientSlug>/canvases/does-not-exist"
```

Expected: the stated status codes and messages.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ingest-image/route.ts
git commit -m "feat(reference-clipper): POST /api/ingest-image — create image File node"
```

---

## Task 4: Extension — manifest + collect (background service worker)

**Files:**
- Create: `clipper-extension/manifest.json`
- Create: `clipper-extension/background.js`

**Interfaces:**
- Produces: a `references` array in `chrome.storage.local`, each item `{ id, srcUrl, pageUrl, pageTitle, capturedAt }` — consumed by the side panel (Tasks 5–6).

**Note on testing:** the extension is verified manually (Chrome-API dependent; no build step, no unit harness) — repo convention for UI surfaces.

- [ ] **Step 1: Write the manifest**

Create `clipper-extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "CreativeOS Reference Clipper",
  "version": "0.1.0",
  "description": "Collect image references while browsing and push them to a CreativeOS canvas.",
  "permissions": ["contextMenus", "storage", "sidePanel", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "CreativeOS Reference Clipper" },
  "side_panel": { "default_path": "sidepanel.html" }
}
```

- [ ] **Step 2: Write the background service worker**

Create `clipper-extension/background.js`:

```js
// background.js — a right-click "Add reference" menu that collects the clicked
// image into chrome.storage.local. The side panel reads that collection.
const MENU_ID = "creativeos-add-reference";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Add reference",
    contexts: ["image"],
  });
  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  const ref = {
    id: crypto.randomUUID(),
    srcUrl: info.srcUrl,
    pageUrl: info.pageUrl ?? tab?.url ?? "",
    pageTitle: tab?.title ?? "",
    capturedAt: Date.now(),
  };
  const { references = [] } = await chrome.storage.local.get("references");
  references.push(ref);
  await chrome.storage.local.set({ references });
});
```

- [ ] **Step 3: Load the extension unpacked**

In Chrome: `chrome://extensions` → enable Developer mode → "Load unpacked" → select the `clipper-extension/` folder. Expected: the extension appears with no errors ("Errors" button absent). Note: after editing `clipper-extension/` files later, click the reload ↻ on the card.

- [ ] **Step 4: Verify collection works**

Right-click any image on any web page → "Add reference." Then on the extension card click "service worker" to open its DevTools console and run:

```js
chrome.storage.local.get("references").then(console.log);
```

Expected: `{ references: [ { id, srcUrl, pageUrl, pageTitle, capturedAt } ] }` with the image's URL. Add a second image → the array has two entries.

- [ ] **Step 5: Commit**

```bash
git add clipper-extension/manifest.json clipper-extension/background.js
git commit -m "feat(reference-clipper): MV3 extension — collect images via context menu"
```

---

## Task 5: Extension — side panel (render + remove)

**Files:**
- Create: `clipper-extension/sidepanel.html`
- Create: `clipper-extension/sidepanel.css`
- Create: `clipper-extension/sidepanel.js`

**Interfaces:**
- Consumes: the `references` array in `chrome.storage.local` (Task 4).
- Produces: a rendered panel with a `#push` button (wired in Task 6) and a `#status` line.

- [ ] **Step 1: Write the panel HTML**

Create `clipper-extension/sidepanel.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="sidepanel.css" />
  </head>
  <body>
    <header>
      <h1>References</h1>
      <button id="push">Push to canvas</button>
    </header>
    <p id="status" class="status"></p>
    <div id="list" class="list"></div>
    <script src="sidepanel.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the panel CSS**

Create `clipper-extension/sidepanel.css` (simple, standalone styling — the panel is a separate surface, not bound to the app's design system):

```css
body { font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 12px; color: #111; }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
h1 { font-size: 14px; margin: 0; }
#push { padding: 6px 10px; border: 1px solid #5829c7; background: #5829c7; color: #fff; border-radius: 8px; cursor: pointer; }
#push:hover { background: #4a1fb0; }
.status { color: #666; min-height: 1em; margin: 4px 0; }
.list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.card { border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.card img { width: 100%; height: 90px; object-fit: cover; background: #f3f3f3; }
.meta { padding: 4px 6px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta a { color: #5829c7; text-decoration: none; }
.remove { border: none; border-top: 1px solid #eee; background: #fafafa; padding: 5px; cursor: pointer; font-size: 11px; }
.remove:hover { background: #f0f0f0; }
.empty { color: #888; grid-column: 1 / -1; }
```

- [ ] **Step 3: Write the panel script (render + remove)**

Create `clipper-extension/sidepanel.js`:

```js
// sidepanel.js — renders the collected references and lets you remove them.
// (Push is added in the next task.)
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url || "unknown";
  }
}

function render(references) {
  listEl.innerHTML = "";
  if (references.length === 0) {
    listEl.innerHTML =
      '<p class="empty">Right-click any image and choose “Add reference”.</p>';
    return;
  }
  for (const ref of references) {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.src = ref.srcUrl;
    img.alt = ref.pageTitle || "reference";
    card.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "meta";
    const link = document.createElement("a");
    link.href = ref.pageUrl;
    link.target = "_blank";
    link.textContent = hostOf(ref.pageUrl);
    meta.appendChild(link);
    card.appendChild(meta);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeRef(ref.id));
    card.appendChild(remove);

    listEl.appendChild(card);
  }
}

async function removeRef(id) {
  const { references = [] } = await chrome.storage.local.get("references");
  await chrome.storage.local.set({
    references: references.filter((r) => r.id !== id),
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.references) {
    render(changes.references.newValue ?? []);
  }
});

async function load() {
  const { references = [] } = await chrome.storage.local.get("references");
  render(references);
}

load();
```

- [ ] **Step 4: Verify the panel renders and removes**

Reload the extension (↻ on `chrome://extensions`). Click the toolbar icon to open the side panel. Expected: previously-collected references show as a thumbnail grid; the empty state shows when none. Right-click a new image → "Add reference" → it appears in the panel live (no manual refresh). Click "Remove" on one → it disappears and stays gone after reopening the panel.

- [ ] **Step 5: Commit**

```bash
git add clipper-extension/sidepanel.html clipper-extension/sidepanel.css clipper-extension/sidepanel.js
git commit -m "feat(reference-clipper): side panel renders + removes collected references"
```

---

## Task 6: Extension — push to canvas

**Files:**
- Modify: `clipper-extension/sidepanel.js` (append the push logic + wire the button)

**Interfaces:**
- Consumes: the active tab URL (`chrome.tabs.query`), the `references` collection, and `POST /api/ingest-image` (Task 3).
- Produces: end-to-end push — File nodes on the active canvas after a reload.

- [ ] **Step 1: Append the push logic to `sidepanel.js`**

Add to the end of `clipper-extension/sidepanel.js`:

```js
// --- Push to canvas ---
const EXT_FROM_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function pushToCanvas() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/\/clients\/[^/]+\/canvases\/[^/]+/.test(tab.url)) {
    setStatus("Open the canvas you want to push to, then Push.");
    return;
  }
  const origin = new URL(tab.url).origin;
  const { references = [] } = await chrome.storage.local.get("references");
  if (references.length === 0) {
    setStatus("Nothing to push.");
    return;
  }

  setStatus(`Pushing ${references.length}…`);
  const pushedIds = [];
  let failed = 0;

  // Sequential: the server staggers by node count, so requests must not race.
  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    try {
      const imgResp = await fetch(ref.srcUrl);
      if (!imgResp.ok) throw new Error(`image fetch ${imgResp.status}`);
      const blob = await imgResp.blob();
      const ext = EXT_FROM_MIME[blob.type];
      if (!ext) throw new Error(`unsupported type ${blob.type}`);

      const form = new FormData();
      form.append("file", blob, `reference-${Date.now()}-${i}.${ext}`);
      form.append("canvasUrl", tab.url);
      form.append("sourceUrl", ref.pageUrl ?? "");

      const resp = await fetch(`${origin}/api/ingest-image`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) throw new Error(`ingest ${resp.status}`);
      pushedIds.push(ref.id);
    } catch (e) {
      failed++;
      console.error("[reference-clipper] push failed", ref.srcUrl, e);
    }
  }

  if (pushedIds.length > 0) {
    const { references: current = [] } = await chrome.storage.local.get(
      "references",
    );
    await chrome.storage.local.set({
      references: current.filter((r) => !pushedIds.includes(r.id)),
    });
    await chrome.tabs.reload(tab.id);
  }
  setStatus(`Pushed ${pushedIds.length}${failed ? `, ${failed} failed` : ""}.`);
}

document.getElementById("push").addEventListener("click", pushToCanvas);
```

- [ ] **Step 2: Verify the end-to-end happy path**

Reload the extension. Collect 2–3 images from a normal site (and one Pinterest pin). Open a CreativeOS canvas in a tab and make it the active tab. Open the side panel and click "Push to canvas." Expected: status shows "Pushing 3…" then "Pushed 3."; the tab reloads; the new File nodes appear in the left column; the pushed items clear from the panel.

- [ ] **Step 3: Verify the non-canvas guard**

Switch to a non-canvas tab (e.g. google.com), open the panel with items collected, click "Push to canvas." Expected: status reads "Open the canvas you want to push to, then Push." and **no** request is made (check the service worker / network — nothing hits `/api/ingest-image`).

- [ ] **Step 4: Verify partial failure**

Collect one normal image plus one from a source that blocks cross-origin fetch (or an unsupported type, e.g. an SVG/gif). Push. Expected: the good one lands and clears; the bad one stays in the panel; status reads "Pushed 1, 1 failed."

- [ ] **Step 5: Commit**

```bash
git add clipper-extension/sidepanel.js
git commit -m "feat(reference-clipper): push collected references to the active canvas"
```

---

## Self-Review

**1. Spec coverage:**
- Collect via right-click → Task 4. ✓
- Side-panel review + prune → Task 5. ✓
- Push reads active tab, validates, uploads, reloads → Task 6. ✓
- Re-host as File node via one open slug-based route → Task 3. ✓
- `parseCanvasUrl` (server-side, tested) → Task 1. ✓
- Position staggering → Task 2 + used in Task 3. ✓
- Sequential push for deterministic staggering → Task 6 loop. ✓
- Non-canvas guard, partial-failure handling → Task 6 steps 3–4. ✓
- No realtime, no app-file changes, endpoint open (D36) → honored across tasks. ✓
- Deferred (Pinterest adapter, realtime, board import, dedup) → correctly absent from tasks.

**2. Placeholder scan:** No "TBD"/"handle errors"/"similar to Task N" — every step has full code or an exact command with expected output. ✓

**3. Type consistency:** `parseCanvasUrl` returns `{ clientSlug, canvasSlug }` (Task 1) and is destructured as `parsed.clientSlug` / `parsed.canvasSlug` (Task 3). ✓ `computeStaggeredPosition(count)` → `{ x, y }` used directly as `position` (Task 3). ✓ Route response `{ nodeId, fileUrl }` matches the extension's `resp.ok` check (it ignores the body). ✓ `uploadNodeFile({ nodeId, filename, body, contentType })` matches the real signature. ✓ Storage item shape `{ id, srcUrl, pageUrl, pageTitle, capturedAt }` is produced in Task 4 and consumed identically in Tasks 5–6. ✓

No issues found.

---

## Notes for the implementer

- **`crypto.randomUUID()`** is available both in the Node route runtime and the extension (service worker + panel are secure contexts) — no import needed.
- **Pinterest** works through the generic path because `i.pinimg.com` is a public CDN; a plain right-click may yield the ~736px variant rather than the original. Original-resolution upgrade + overlay handling is an explicitly deferred later increment — do **not** add it here.
- If the dev server isn't reachable at the tab's origin, the push `fetch` fails and items stay in the panel with a console error — expected.
