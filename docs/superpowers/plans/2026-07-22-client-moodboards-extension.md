# Client Moodboards (Slice B — capture extension) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small Chrome (MV3) extension that adds any image you right-click — anywhere, e.g. Pinterest — to a chosen CreativeOS **client moodboard**, plus the one open API endpoint its picker needs.

**Architecture:** The extension is collect-anywhere → sticky-target → one POST. A side panel lets you pick a **client → existing board** (remembered in `chrome.storage.local`); a background service worker adds a right-click "Add image to moodboard" menu that POSTs `{imageUrl, sourceUrl}` to the **already-built** `POST /api/moodboards/[id]/items`. The only new server code is an open `GET /api/moodboards` index that returns clients + their boards to populate the picker.

**Tech Stack:** Chrome Manifest V3 (no build step, loaded unpacked), vanilla JS; Next.js App Router route + Supabase (server client); Vitest for the route.

**Scope:** Slice B builds on Slice A (already merged into this branch: the `moodboards`/`moodboard_items` tables, the item + board routes, the in-app Moodboards tab). **Design of record:** `docs/superpowers/specs/2026-07-22-client-moodboards-design.md` §5.5. **v1 scope decision (this plan):** the picker **selects existing boards only** — inline board-creation from the extension is deferred (create boards in the app). Thumbnails / embeddings remain deferred (Slice A §7).

## Global Constraints

- **API routes** use `apiError` / `apiOk` — never `NextResponse.json(...)` directly. (`docs/api-routes.md`)
- **DB modules** are `import "server-only"`, go through `createServerSupabase()`, snake_case columns, `throw` on `error`. (matches `src/lib/db/clients.ts`, `src/lib/db/moodboards.ts`)
- **Open endpoint (D14):** `GET /api/moodboards` has no auth — the extension is unauthenticated, like the other `/api/moodboards/*` routes. (Security note: readable/writable by anyone with the URL; a shared-secret header is deferred hardening.)
- **Active clients only:** the index lists clients with `archived_at IS NULL` (matches `listClients`).
- **No new npm dependencies** — the extension is plain MV3 files, loaded unpacked; nothing is added to `package.json`.
- **Tests:** `npm test` runs `vitest run`. The route is unit-tested by mocking the db module. The extension is verified manually in Chrome (repo convention for extension code).
- **App base URL:** the extension targets a configured origin (`APP_BASE_URL` in `config.js`), default `http://localhost:3000`; it must also appear in the manifest `host_permissions`.

---

## File Structure

**New files:**
- `src/app/api/moodboards/route.ts` — `GET` index: clients + their boards (open).
- `src/app/api/moodboards/route.test.ts`
- `moodboard-extension/manifest.json` — MV3 manifest.
- `moodboard-extension/config.js` — `APP_BASE_URL` constant.
- `moodboard-extension/background.js` — context menu + POST orchestration (service worker).
- `moodboard-extension/sidepanel.html` — picker shell.
- `moodboard-extension/sidepanel.js` — picker logic (fetch index, pick board, remember target).
- `moodboard-extension/sidepanel.css` — minimal styling.
- `moodboard-extension/README.md` — how to load + configure.

**Modified files:**
- `src/lib/db/moodboards.ts` — add `listClientsWithMoodboards()`.

---

## Task 1: Picker index endpoint — `GET /api/moodboards`

**Files:**
- Modify: `src/lib/db/moodboards.ts`
- Create: `src/app/api/moodboards/route.ts`
- Test: `src/app/api/moodboards/route.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`); `apiOk` (`@/lib/api/route-helpers`).
- Produces:
  - `type ClientWithBoards = { slug: string; name: string; boards: { id: string; name: string }[] }`
  - `listClientsWithMoodboards(): Promise<ClientWithBoards[]>`
  - `GET /api/moodboards` → `{ clients: ClientWithBoards[] }`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/moodboards/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  listClientsWithMoodboards: vi.fn(),
}));

import { listClientsWithMoodboards } from "@/lib/db/moodboards";

describe("GET /api/moodboards", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns clients with their boards", async () => {
    vi.mocked(listClientsWithMoodboards).mockResolvedValue([
      { slug: "acme", name: "Acme", boards: [{ id: "b1", name: "Face cream" }] },
      { slug: "beta", name: "Beta", boards: [] },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(2);
    expect(body.clients[0].boards[0].name).toBe("Face cream");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "api/moodboards/route.test"`
Expected: FAIL — `./route` cannot be imported (not created yet).

- [ ] **Step 3: Add the db query**

In `src/lib/db/moodboards.ts`, append:

```ts
export type ClientWithBoards = {
  slug: string;
  name: string;
  boards: { id: string; name: string }[];
};

// For the capture extension's picker: active clients + their boards, one round-trip.
export async function listClientsWithMoodboards(): Promise<ClientWithBoards[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("slug, name, moodboards(id, name)")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as { slug: string; name: string; moodboards: { id: string; name: string }[] | null }[]
  ).map((c) => ({ slug: c.slug, name: c.name, boards: c.moodboards ?? [] }));
}
```

- [ ] **Step 4: Write the route**

Create `src/app/api/moodboards/route.ts`:

```ts
import { apiOk } from "@/lib/api/route-helpers";
import { listClientsWithMoodboards } from "@/lib/db/moodboards";

export async function GET() {
  const clients = await listClientsWithMoodboards();
  return apiOk({ clients });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "api/moodboards/route.test"`
Expected: PASS (1 test).

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit` (expect no new errors).

```bash
git add src/lib/db/moodboards.ts "src/app/api/moodboards/route.ts" "src/app/api/moodboards/route.test.ts"
git commit -m "feat(moodboards): open GET /api/moodboards index for the extension picker"
```

---

## Task 2: The capture extension (`moodboard-extension/`)

**Files:**
- Create: `moodboard-extension/manifest.json`, `config.js`, `background.js`, `sidepanel.html`, `sidepanel.js`, `sidepanel.css`, `README.md`

**Interfaces:**
- Consumes: `GET /api/moodboards` (Task 1) for the picker; `POST /api/moodboards/[id]/items` (Slice A) to add.
- Produces: an unpacked MV3 extension. Target board is stored under `chrome.storage.local` key `target` = `{ boardId, boardName, clientName }`.

- [ ] **Step 1: Manifest**

Create `moodboard-extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "CreativeOS Moodboard Clipper",
  "version": "0.1.0",
  "description": "Right-click any image to add it to a CreativeOS client moodboard.",
  "permissions": ["contextMenus", "storage", "sidePanel"],
  "host_permissions": ["http://localhost:3000/*"],
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "CreativeOS Moodboard" }
}
```

- [ ] **Step 2: Config**

Create `moodboard-extension/config.js`:

```js
// The origin where CreativeOS runs. Change for production and add it to
// manifest.json "host_permissions" as well.
const APP_BASE_URL = "http://localhost:3000";
```

- [ ] **Step 3: Background service worker**

Create `moodboard-extension/background.js`:

```js
importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-moodboard",
    title: "Add image to moodboard",
    contexts: ["image"],
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "add-to-moodboard" || !info.srcUrl) return;

  const { target } = await chrome.storage.local.get("target");
  if (!target || !target.boardId) {
    if (tab && tab.windowId != null) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    flashBadge("!", "#b91c1c");
    return;
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards/${target.boardId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: info.srcUrl, sourceUrl: info.pageUrl }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    flashBadge("✓", "#16a34a");
  } catch (e) {
    flashBadge("x", "#b91c1c");
    console.error("[moodboard] add failed:", e);
  }
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}
```

- [ ] **Step 4: Side panel shell**

Create `moodboard-extension/sidepanel.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="sidepanel.css" />
  </head>
  <body>
    <h1>Moodboard target</h1>
    <p id="current" class="current"></p>
    <label class="field">Client
      <select id="client"></select>
    </label>
    <div id="boards" class="boards"></div>
    <button id="refresh" class="refresh">Refresh</button>
    <p id="status" class="status"></p>
    <script src="config.js"></script>
    <script src="sidepanel.js"></script>
  </body>
</html>
```

- [ ] **Step 5: Side panel logic**

Create `moodboard-extension/sidepanel.js`:

```js
const clientSel = document.getElementById("client");
const boardsEl = document.getElementById("boards");
const currentEl = document.getElementById("current");
const statusEl = document.getElementById("status");
let clients = [];

function text(el, value) {
  el.textContent = value;
}

async function showCurrent() {
  const { target } = await chrome.storage.local.get("target");
  text(
    currentEl,
    target && target.boardId
      ? `Sending to: ${target.clientName} / ${target.boardName}`
      : "No board selected — pick one below.",
  );
}

function renderBoards() {
  const c = clients[clientSel.value];
  boardsEl.replaceChildren();
  if (!c) return;
  if (!c.boards.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No boards for this client yet — create one in the app.";
    boardsEl.appendChild(p);
    return;
  }
  for (const b of c.boards) {
    const btn = document.createElement("button");
    btn.className = "board";
    btn.textContent = b.name;
    btn.addEventListener("click", () => {
      chrome.storage.local.set(
        { target: { boardId: b.id, boardName: b.name, clientName: c.name } },
        showCurrent,
      );
    });
    boardsEl.appendChild(btn);
  }
}

async function load() {
  text(statusEl, "Loading…");
  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    clients = (await res.json()).clients || [];
    clientSel.replaceChildren();
    clients.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = c.name;
      clientSel.appendChild(opt);
    });
    renderBoards();
    text(statusEl, "");
  } catch (e) {
    text(statusEl, `Couldn't load. Is CreativeOS running at ${APP_BASE_URL}? (${e.message})`);
  }
  showCurrent();
}

clientSel.addEventListener("change", renderBoards);
document.getElementById("refresh").addEventListener("click", load);
load();
```

- [ ] **Step 6: Side panel styles**

Create `moodboard-extension/sidepanel.css`:

```css
* { box-sizing: border-box; }
body { font: 13px/1.4 system-ui, sans-serif; margin: 0; padding: 12px; color: #0b0f19; }
h1 { font-size: 14px; margin: 0 0 8px; }
.current { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 8px; color: #5829c7; font-weight: 600; }
.field { display: block; margin: 12px 0 8px; font-weight: 600; }
select { display: block; width: 100%; margin-top: 4px; padding: 6px; border: 1px solid #e5e7eb; border-radius: 8px; }
.boards { display: flex; flex-direction: column; gap: 6px; }
.board { text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; cursor: pointer; }
.board:hover { border-color: #5829c7; background: #faf9ff; }
.empty { color: #6b7280; }
.refresh { margin-top: 12px; padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; cursor: pointer; }
.status { color: #6b7280; margin-top: 10px; }
```

- [ ] **Step 7: README**

Create `moodboard-extension/README.md`:

```md
# CreativeOS Moodboard Clipper (MV3)

Adds any right-clicked image to a CreativeOS **client moodboard**.

## Configure
- Set `APP_BASE_URL` in `config.js` to where CreativeOS runs (default `http://localhost:3000`).
- If you change it, add the same origin to `manifest.json` → `host_permissions` (e.g. `"https://your-app.example.com/*"`).

## Load
1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `moodboard-extension/` folder.
3. Click the extension's toolbar icon to open the **side panel**.

## Use
1. In the side panel, choose a **client** then click a **board** — "Sending to: Client / Board" confirms the sticky target.
2. On any page, **right-click an image → "Add image to moodboard."** A green ✓ badge = added; red = not (check the app is running and a board is selected).
3. Open that board in the app's Gallery → **Moodboards** tab to see it; drag onto a canvas to use it.

Boards are created in the app, not here (v1).
```

- [ ] **Step 8: Manual verification in Chrome**

1. Ensure the app is running (`npm run dev`) and migration `0012` is applied, and at least one client has a moodboard.
2. Load the unpacked extension (README). Open the side panel → the client dropdown populates from `GET /api/moodboards`.
3. Pick a client + board → "Sending to: …" shows; reopen the panel → it persists.
4. Go to Pinterest (or any page), right-click an image → **Add image to moodboard** → green ✓ badge.
5. In the app, open that board (Gallery → Moodboards) → the image is listed. Drag it to the canvas → a File node re-hosts it to GCS.
6. Negative: with no target selected, right-click-add flashes a red badge and opens the panel; with the app stopped, the panel shows the "Is CreativeOS running…" status.

- [ ] **Step 9: Commit**

```bash
git add moodboard-extension/
git commit -m "feat(moodboards): MV3 capture extension — right-click image -> client board"
```

---

## Self-Review

**Spec coverage (§5.5):** picker from `GET /api/moodboards` ✅ (Task 1); right-click "Add to moodboard" → POST to the existing item route ✅ (Task 2, Step 3); sticky target in `chrome.storage.local` ✅; URL-only (no bytes) ✅ (the POST sends URLs, re-host still happens on drag-to-canvas in the app). **Scope change:** inline board-creation dropped for v1 (pick existing only) — reflected in README + background (no create path).

**Placeholder scan:** every step has complete file contents or exact commands; no TBD/TODO. The one intentional configurable is `APP_BASE_URL` (documented in config.js + README), not a placeholder.

**Type consistency:** `ClientWithBoards` (Task 1 db) matches the route's `{ clients }` body and the panel's `clients[i].boards[j].{id,name}` usage (Task 2). `chrome.storage.local` `target` shape `{ boardId, boardName, clientName }` is written in `sidepanel.js` and read identically in `background.js`. The POST body `{ imageUrl, sourceUrl }` matches the Slice-A item route's expected fields.

**Security note carried:** open endpoints (D14) — acceptable for internal use; shared-secret hardening deferred. Board names are rendered via `textContent` (not `innerHTML`) in the panel, so a board name can't inject markup.
