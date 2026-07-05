# Reference Clipper — Chrome side-panel → canvas File nodes

**Date:** 2026-07-05
**Status:** Draft design — pending user review.
**Type:** Design spec (new feature; introduces **D36**; first *external* write path into the canvas).
**Builds on:** **D13** (media in GCS, DB rows hold only URLs), **D14** (auth deferred — the ingest
endpoint is open, like the rest of the app), **D33** (single-writer lock — untouched here; see §7),
and the existing **paste-image flow** (`canvas.tsx` `handlePasteImage` — the reused
"create File node → upload image" pattern).

---

## 1. Problem & goal

Reference gathering happens in the browser — mostly on Pinterest — but the only way into a
CreativeOS canvas today is: manually download the image, then paste it onto the canvas. That breaks
flow and only does one image at a time.

**Goal:** a small Chrome extension with a **side panel** that *collects* image references while you
browse any site, lets you review/prune the pile, and — on demand — *pushes* the whole pile as
**File nodes** onto the CreativeOS canvas open in your active tab.

## 2. User flow

1. **Collect** — right-click any image on any page → **"Add reference."** It's captured into the
   side panel's collection (stored locally in the extension). Nothing is sent to CreativeOS yet.
2. **Review** — the side panel shows a thumbnail grid of everything collected (each with its source
   page and a remove button). Prune freely; the pile survives tab switches and browser restarts.
3. **Push** — switch to your CreativeOS canvas tab and click **"Push to canvas."** The extension
   reads the *active tab's URL*, confirms it's a canvas page, and uploads each collected reference as
   a File node. When it finishes, it **reloads that tab** so the new nodes appear. Pushed items clear
   from the pile.
4. **Arrange** — you drag connections from the new File nodes to wherever you want. (No auto-wiring.)

## 3. Why reload, not realtime

Push always targets the active tab, and that tab *is* the canvas. The canvas page is a
`force-dynamic` server component that re-fetches all nodes on mount (`page.tsx` → `listNodes` →
`nodeRowToFlow`). So after a successful push the extension calls `chrome.tabs.reload(tabId)` and the
new File nodes render in ~1s — no subscription, no migration, no lock reasoning.

Realtime (a Supabase `nodes` subscription + a `use-canvas-node-sync` hook) is the right tool only
when you *can't* reload the target surface. Here we own the tab and the user is in front of it at
push time, so reload fully covers the need. Realtime is deferred as a **purely additive** later
upgrade (see §9) if the reload flash ever becomes annoying.

**Accepted caveat:** a reload is disruptive if the user pushes *mid-edit* — an un-flushed change
(within the ~600ms autosave debounce) could be lost, and transient UI (an open focus view, a
half-drawn edge) resets. The collect-elsewhere→switch→push workflow means the user isn't mid-edit at
push time, so the risk is low and accepted for v1.

## 4. Non-goals (each a clean later increment)

- **Realtime live-appear** — deferred (§3, §9).
- **Auto-connect / auto-place** the pushed nodes into the graph — the user wires them manually.
- **A reference shelf inside the app** — unrelated to the generation tray (D35); references live only
  in the extension until pushed, then become ordinary File nodes.
- **Board / bulk scraping** (e.g. import a whole Pinterest board) — heavier and grayer on Pinterest's
  terms; out of scope.
- **A Pinterest capture adapter** (overlay handling + original-resolution upgrade) — v1 uses the
  right-clicked image URL as-is; the adapter is a later capture-side increment (§8).
- **Delete-cleanup of a File node's GCS object** — extension File nodes behave *exactly* like every
  other File node, including that node deletion currently orphans the GCS object (a pre-existing,
  app-wide behavior; not this feature's job to change).
- **Auth on the endpoint** — matches D14; a shared-secret is noted as easy later hardening (§7).
- **Dedup** — pushing the same image twice makes two nodes in v1.

## 5. Architecture

Two deliverables: a Chrome extension (all new, isolated in `extension/`) and **one** new API route.
Nothing else in CreativeOS changes.

### 5.1 Chrome extension (Manifest V3)

```
extension/
  manifest.json      MV3; permissions: contextMenus, storage, sidePanel, tabs
                     host_permissions: <all_urls>  (fetch arbitrary image bytes + POST to the app)
  background.js      service worker: context menu + push orchestration
  sidepanel.html     the panel shell
  sidepanel.js       renders the collection, handles Push
  sidepanel.css      house styling (kept simple; not bound to the app's design system)
```

- **Collect (background worker):** registers a `contexts: ["image"]` menu item "Add reference." On
  click, captures `{ srcUrl: info.srcUrl, pageUrl: info.pageUrl, pageTitle: tab.title, capturedAt }`
  and appends it to a `references` array in `chrome.storage.local`.
- **Side panel (`sidepanel.js`):** reads `references` from `chrome.storage.local` and re-renders on
  `chrome.storage.onChanged`. Each item: a thumbnail (`<img src={srcUrl}>` — rendered straight from
  the source, costs nothing), the source hostname (links to `pageUrl`), and a remove button. A
  **"Push to canvas"** button and a status/error line.
- **Push (on button click):**
  1. `chrome.tabs.query({ active: true, currentWindow: true })` → the target tab + its URL.
  2. A quick regex gate (`/\/clients\/[^/]+\/canvases\/[^/]+/`) confirms it looks like a canvas
     page; if not → show *"Open the canvas you want to push to, then Push."* and stop. (Authoritative
     validation is server-side — the extension does not own the parse; see §5.3.)
  3. For each reference **sequentially** (so the server's node count advances between requests and
     positions stagger deterministically): `fetch(srcUrl)` in the panel → `Blob` → POST
     `multipart/form-data` to `{origin}/api/ingest-image`, forwarding the **full tab URL** as
     `canvasUrl` (the server parses out the slugs — §5.2). Collect per-item success/failure.
  4. Remove successfully-pushed items from `chrome.storage.local`; leave failures with an error mark.
  5. If anything succeeded, `chrome.tabs.reload(targetTabId)` **once**, at the end.

  Extension requests carry no `Origin`/CORS constraints because a background worker with
  `host_permissions` is exempt from CORS — so the cross-origin POST to the app just works, and the
  route needs no CORS headers.

### 5.2 New server route — the only app-side change

`POST /api/ingest-image` (top-level, **slug-based** — deliberately *not* nested under
`/api/clients/[id]/…`, because that convention's `withClient` resolves a client **UUID**, and the
extension only has slugs from the canvas URL).

- **Body** (`multipart/form-data`): `file` (image blob), `canvasUrl` (the full canvas page URL —
  the server parses out the slugs), `sourceUrl` (provenance).
- **Handler** (`apiOk`/`apiError`; wrap the async work in `withTryCatch`):
  1. `parseCanvasUrl(canvasUrl)` → `{ clientSlug, canvasSlug }`; 400 if it doesn't match (§5.3).
  2. `getClientBySlug(clientSlug)` → `getCanvasBySlug(client.id, canvasSlug)`; 404 if either missing.
  3. Validate the file: `validateFileExtension(file, FILE_NODE_IMAGE_EXTENSIONS)` →
     `validateFileSize(file.size, 0, FILE_NODE_IMAGE_SIZE_LIMIT, "10 MB")`. (Read `req.formData()`
     once and pull `file`/`canvasUrl`/`sourceUrl` from it — `parseFormFile` re-reads the body, so it
     isn't composable with also reading the URL fields; inline the `file instanceof File` check.)
  4. Mint `nodeId = crypto.randomUUID()`; compute a **staggered position** (§5.4).
  5. Insert the File node row: `type: "file"`, `position`,
     `data: { fileKind: "image", filename, fileExt, sourceUrl, fileUrl: "" }`. (Row must exist before
     upload so `resolveOwnership(nodeId)` can build the GCS path — same ordering the paste flow uses.)
  6. `uploadNodeFile({ nodeId, filename, body, contentType })` → `{ url }` in GCS.
  7. Update the row's `data.fileUrl = url`.
  8. `apiOk({ nodeId, fileUrl }, 201)`.

### 5.3 `parseCanvasUrl` (pure, unit-tested — **server-side**)

```
parseCanvasUrl(url: string):
  { clientSlug, canvasSlug } | null
```

Matches `{origin}/clients/{clientSlug}/canvases/{canvasSlug}` (ignoring trailing segments/query),
returns `null` otherwise. Lives in **`src/lib/reference-clipper/canvas-url.ts`** (not the extension)
so it's the single, unit-tested source of truth and is exercised by the repo's vitest (node env,
`src/**/*.test.ts`) — an unpacked extension can't import from `src/`, so putting it there and having
the extension forward the raw URL keeps one tested implementation instead of a drifting copy. The
extension only does a cheap regex gate for the UX hint (§5.1) and `new URL(tabUrl).origin` to know
where to POST. Unit-tested against valid URLs, non-canvas URLs, trailing paths, and query strings.

### 5.4 Position staggering

New nodes must not stack. The route places each incoming node at a deterministic offset from a known
origin based on the canvas's current node count (e.g. a left-column "drop zone", `y` stepped per
node), so a batch push lands as a readable column the user can drag into place. Extracted as a small
pure function and unit-tested.

## 6. Data & lifecycle

| Stage | Where it lives | Cost |
| :---- | :---- | :---- |
| Collected (pre-push) | extension `chrome.storage.local` only | none on the server |
| Pushed | a normal File node: `nodes` row + one GCS object | one image in GCS |
| Deleted | node row removed via the normal canvas delete path | GCS object orphaned — *same as every File node today*; out of scope |

## 7. The single-writer lock (D33) — no change needed

The lock is untouched. The reload path doesn't fight it, and even a direct external insert is
delete-safe: `saveCanvasNodes` deletes **only** explicitly-removed ids
(`nodes.ts` — *"so a stale session can never delete a node another session added"*), so an
editing tab's autosave never clobbers a pushed node. On reload the tab re-acquires the lock normally
(per-tab `sessionId` re-minted on mount).

## 8. Pinterest note

Pinterest images come from the public `i.pinimg.com` CDN, so the right-click → `srcUrl` → fetch path
works for most pins without any Pinterest-specific code. Two known limits, both **deferred** to a
later capture-adapter increment: (a) a plain right-click often yields the ~736px display variant, not
the original (`/originals/` rewrite); (b) Pinterest's overlay can make a right-click miss the
underlying `<img>`. v1 ships the generic path and we see where it falls short.

## 9. Later: realtime upgrade (additive, not now)

If the reload flash becomes annoying, replace the `chrome.tabs.reload` with a live insert:
enable Supabase realtime on `nodes` (one publication line), add `use-canvas-node-sync(canvasId)`
(mirrors `use-video-gen-status`; subscribe to `nodes` INSERT filtered `canvas_id=eq.{canvasId}`, map
`payload.new` via `nodeRowToFlow`, add to the store idempotently), and a small `addRemoteNode` store
method. The bare INSERT payload is sufficient because File nodes render from `data.fileUrl` (no
version embed needed). None of the v1 code changes — the reload is simply swapped out.

## 10. Testing

Repo convention: node-env vitest over pure `src/lib/**` and extension logic; UI verified by running
the app.

- **Unit (pure):** `parseCanvasUrl` (valid / non-canvas / trailing path / query); the
  position-stagger function.
- **Route:** create-node + upload + `fileUrl` set (happy path); 404 on bad slugs; rejects
  non-image / oversize via the shared validators.
- **Extension (manual):** collect from Pinterest + a normal site; review + prune; push to the active
  canvas tab → tab reloads → File nodes present; push from a non-canvas tab → hint, no request;
  push with one bad image in the batch → good ones land, bad one stays with an error.

## 11. Implementation surface

**New:**
- `extension/` — `manifest.json`, `background.js`, `sidepanel.{html,js,css}` (no build step; loaded
  unpacked). The extension forwards the raw canvas URL; it holds no tested logic of its own.
- `src/lib/reference-clipper/canvas-url.ts` + `.test.ts` — `parseCanvasUrl` (server-side, tested).
- `src/lib/reference-clipper/position.ts` + `.test.ts` — `computeStaggeredPosition` (tested).
- `src/app/api/ingest-image/route.ts` — the ingest route.

**Changed:** nothing in the existing app (the File node type, paste flow, lock, autosave, and
deletion are all reused as-is).

## 12. Decision — D36 (to append to roadmap §7 on approval)

**Decision:** External reference ingest via a Chrome side-panel extension. Push targets the **active
tab's canvas** (read at push time — no saved connection), re-hosts each image as an ordinary **File
node** through a single open, slug-based `POST /api/ingest-image` route, and surfaces the result by
**reloading the tab** rather than via realtime.
**Why:** Active-tab targeting needs zero configuration and is unambiguous; reload reuses the existing
server-component load and keeps the app footprint to one route; re-hosting as a plain File node
reuses the whole paste-image lifecycle.
**Rejected:** (a) a saved/remembered canvas connection — needs stored state + a target-confirm step;
(b) URL-only "reference" nodes — link rot, esp. Pinterest CDN churn; (c) realtime for v1 — an entire
subsystem for a need reload already covers; (d) a reference shelf in the app — unrelated to D35.
