# Avatars on the Canvas (Part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a client's avatars on the canvas: an Avatars tab in the gallery, an Avatar node with a read-only focus view, and Avatar → Script as the script's one presenter, shown on the Script.

**Architecture:** The node stores only `{ avatarId }`. The client's avatars come from TanStack Query (D300: `src/hooks/queries/avatars.ts`) — one cached list, with any missing avatar fetched by id — so every node, the gallery tab and the Script read one live list. The presenter is never stored on the Script: it is the newest avatar edge into it, worked out by a pure function. One store rule keeps a single presenter per script. Parsing is untouched.

**Tech Stack:** Next.js 16 · React 19 · `@xyflow/react` · zustand canvas store · shadcn on Base UI · vitest (node env).

**Spec:** `docs/superpowers/specs/2026-10-01-avatars-on-canvas-design.md` · **ADR:** D298 · **Part 2 plan:** `2026-10-01-avatars-in-videos.md`

## Global Constraints

- **No migration.** `nodes.type` is plain text; node data is JSON.
- **No new API route.** The avatar list, avatar-by-id and voice-preview routes already exist.
- **Parsing is untouched**: no change to `/api/nodes/[id]/parse`, `compileScript` or `script-parse.ts`.
- Every control is a shadcn primitive from `src/components/ui/*` (Base UI: `render`, not `asChild`).
- Yuvabe design system: tokens only, `font-display` headings, `.text-eyebrow` labels, Lucide at `strokeWidth={1.5}`, dashed primary "add" chips (`border border-dashed border-primary/40 hover:bg-primary/5`).
- React Flow: follow https://reactflow.dev/learn patterns; register the node type in the stable `nodeTypes` object in `canvas.tsx`.
- vitest is node-env: components and hooks are checked by `npx tsc --noEmit` + `npx eslint`.
- Copy: the replacement toast is "The new avatar is now this script's presenter, replacing the previous one." (the store has no names — the spec is amended in Task 6); empty tab "No avatars yet. Create one in Brand settings → Avatars"; node states "Archived — still works here", "This avatar is no longer available".

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/lib/canvas-nodes.ts` | modify | `AvatarNodeData`, `AppNode` union, `VALID_CONNECTIONS.avatar` |
| `src/lib/canvas-store.ts` | modify | `defaultData("avatar")`; one presenter per script in `onConnect` and `connectNodes` |
| `src/lib/avatars/canvas.ts` | **create** | Drag MIME + payload parser, `presenterEdge`, `avatarVoiceLine` |
| `src/hooks/queries/avatars.ts` | done (D300) | `useLibraryAvatars`, `useAvatar` (by id, seeded from the list, 404 → gone), `useVoicePreview` |
| `src/components/canvas/canvas.tsx` | modify | `avatar: AvatarNode` in `nodeTypes` |
| `src/components/nodes/avatar-node.tsx` | **create** | The card |
| `src/components/nodes/avatar-focus-view.tsx` | **create** | The read-only focus view |
| `src/components/canvas/gallery-drawer/gallery-avatars-tab.tsx` | **create** | The tab |
| `src/components/canvas/gallery-drawer/types.ts`, `gallery-tabs.tsx`, `gallery-drawer.tsx` | modify | The fifth tab; connect mode |
| `src/hooks/use-gallery-avatar-drop.ts` | **create** | Pane and Script drop targets for the avatar payload; `addAvatarNode` |
| `src/hooks/use-gallery-pane-drop.ts` | modify | Also accept the avatar payload |
| `src/components/nodes/script-presenter.tsx` | **create** | The card row and the focus-view block |
| `src/components/nodes/script-node.tsx`, `script-focus-view.tsx` | modify | Use it; the Script takes avatar drops |

---

### Task 1: The rules — node type, connection, payload, presenter

**Files:** modify `src/lib/canvas-nodes.ts`, `src/lib/canvas-store.ts`; create `src/lib/avatars/canvas.ts`; tests `src/lib/avatars/__tests__/canvas.test.ts`, `src/lib/canvas-nodes.test.ts`, `src/lib/canvas-store.test.ts`.

**Interfaces — produces:**
- `type AvatarNodeData = { avatarId: string }`; `AppNode` gains `Node<AvatarNodeData, "avatar">`
- `VALID_CONNECTIONS.avatar = ["script"]`
- `AVATAR_DRAG_MIME = "application/x-creativeos-gallery-avatar"`
- `parseAvatarDragPayload(raw: string): { avatarId: string } | null`
- `presenterEdge(scriptId, nodes, edges): Edge | null` — the newest (last) edge into the script whose source is an avatar node
- `presenterAvatarId(scriptId, nodes, edges): string | null`
- `avatarVoiceLine(voice: AvatarVoice | null): string` — `{name}` · "Engine's own voice" · "No voice"
- Store: connecting an avatar to a script removes that script's other avatar edges (into `removedEdgeIds`) and toasts the replacement.

- [ ] **Step 1: Failing tests.**

```ts
// src/lib/avatars/__tests__/canvas.test.ts
describe("parseAvatarDragPayload", () => {
  it("reads an avatar id", () => expect(parseAvatarDragPayload('{"avatarId":"a1"}')).toEqual({ avatarId: "a1" }));
  it("ignores anything else", () => {
    expect(parseAvatarDragPayload("not json")).toBeNull();
    expect(parseAvatarDragPayload('{"images":[]}')).toBeNull();
    expect(parseAvatarDragPayload('{"avatarId":""}')).toBeNull();
  });
});
describe("presenterEdge", () => {
  const nodes = [
    { id: "s", type: "script" }, { id: "v1", type: "avatar" }, { id: "v2", type: "avatar" }, { id: "f", type: "file" },
  ] as AppNode[];
  it("is the newest avatar edge into the script", () => {
    const edges = [{ id: "e1", source: "v1", target: "s" }, { id: "e2", source: "f", target: "s" }, { id: "e3", source: "v2", target: "s" }] as Edge[];
    expect(presenterEdge("s", nodes, edges)?.id).toBe("e3");
  });
  it("is null with no avatar connected", () => expect(presenterEdge("s", nodes, [])).toBeNull());
});
describe("avatarVoiceLine", () => {
  it("names the voice", () => {
    expect(avatarVoiceLine(null)).toBe("No voice");
    expect(avatarVoiceLine({ mode: "native" })).toBe("Engine's own voice");
  });
});
```

```ts
// canvas-nodes.test.ts
it("an avatar connects to a script and nothing else", () => {
  expect(canConnect("avatar", "script")).toBe(true);
  expect(canConnect("avatar", "video-gen")).toBe(false);
  expect(canConnect("script", "avatar")).toBe(false);
});
```

```ts
// canvas-store.test.ts
it("a script has one presenter: a second avatar replaces the first", () => {
  const store = createCanvasStore([
    { id: "s", type: "script", position: { x: 0, y: 0 }, data: {} },
    { id: "v1", type: "avatar", position: { x: 0, y: 0 }, data: { avatarId: "a1" } },
    { id: "v2", type: "avatar", position: { x: 0, y: 0 }, data: { avatarId: "a2" } },
  ] as AppNode[], [{ id: "e1", source: "v1", target: "s" } as Edge]);
  store.getState().onConnect({ source: "v2", target: "s", sourceHandle: null, targetHandle: null });
  expect(store.getState().edges.map((e) => e.source)).toEqual(["v2"]);
  expect(store.getState().removedEdgeIds).toContain("e1");
});
```

- [ ] **Step 2: Run and watch them fail** — `npx vitest run src/lib/avatars src/lib/canvas-nodes.test.ts src/lib/canvas-store.test.ts`.
- [ ] **Step 3: Implement.** One helper, `replacedPresenterEdges(nodes, edges, source, target): Edge[]` (pure, in `src/lib/avatars/canvas.ts`), returns the script's other avatar edges when `source` is an avatar and `target` a script. Both `onConnect` and `connectNodes` drop those edges into `removedEdgeIds` and, when any were dropped, show the one toast. Callers never toast, so a replacement is announced once whichever path made it.
- [ ] **Step 4: Run the tests** — pass.
- [ ] **Step 5: Commit** — `feat(canvas): the Avatar node type and one presenter per script (D298)`.

---

### Task 2: The client's avatars on the canvas — done with D300

Built as the first TanStack Query resource instead of a hand-made context (operator request, D300): `src/hooks/queries/avatars.ts` provides `useLibraryAvatars(clientId)`, `useAvatar(clientId, avatarId): { status: "loading" | "ready" | "gone"; avatar }` and `useVoicePreview`. The Studio's preview hook moved onto it in the same change. Consumers below use these hooks only.

---

### Task 3: The Avatar node and its focus view

**Files:** create `avatar-node.tsx`, `avatar-focus-view.tsx`; modify `canvas.tsx` (`nodeTypes.avatar`).

- [ ] **Card** (`w-44`, like the Script card): `NodeCardHeader` (icon `UserRound`, title = avatar name, no title editing), the front image (3:4, `rounded-md`), the voice line, an **Open in Studio** link button; output `Handle` on the right only. States per spec §3.2: a skeleton while loading, "Archived — still works here" badge, "This avatar is no longer available" for gone. Double-click or the card's open button opens the focus view; `useFocusViewRegistration(id, open)`; `NodeContextMenu` with delete/duplicate as other nodes.
- [ ] **Focus view** — `Sheet` `side="bottom"` (as the Script's): back button, name (`font-display text-3xl`), status badge, **Edit in Studio** (`Button` rendering a `Link` with `target="_blank"`). Two columns: left the latest preview (`avatarsService.getVoicePreview`, the 9:16 video, its line, an Out of date badge via `isVoicePreviewStale`, or "No preview yet" + link); right the front and sheet (each with `FullScreenImageZoom`), the voice (`avatarVoiceLine`, the ElevenLabs sample play via `useVoicePreview` + `avatarVoiceToPickerVoice`, or `AvatarVoiceSample` for the reference), the story, Works with badges (`avatarWorksWith`).
- [ ] `npx tsc --noEmit && npx eslint src/components/nodes/avatar-*` · commit `feat(canvas): the Avatar node and its read-only focus view (D298)`.

---

### Task 4: The gallery's Avatars tab, dragging and connect mode

**Files:** create `gallery-avatars-tab.tsx`, `src/hooks/use-gallery-avatar-drop.ts`; modify `types.ts` (`GalleryTab` + `"avatars"`), `gallery-tabs.tsx`, `gallery-drawer.tsx`, `use-gallery-pane-drop.ts`, `script-node.tsx`.

**Interfaces — produces:** `useAddAvatarNode(): (avatarId, opts: { position; presenterOf?: string }) => void` — adds the node (`addNode("avatar")` + `updateNodeData`), and with `presenterOf` connects it to that script (the store replaces any presenter) and lets the store announce a replacement.

- [ ] **Tab:** a `grid-cols-2` grid of tiles — the front (3:4), name, voice line, an add `Button` (`Plus`, "Add to canvas"); `draggable` with `e.dataTransfer.setData(AVATAR_DRAG_MIME, JSON.stringify({ avatarId }))`. Empty state per spec with a `Button` rendering a `Link` to `/clients/{slug}/avatars` in a new tab; footer link **Manage avatars**. The toolbar (search/view) is hidden on this tab, as on Signals.
- [ ] **Connect mode:** when the drawer was opened with `connectToNodeId` and the tab is Avatars, a tile click adds and connects to that node, then closes the drawer. `OpenDrawerOptions` gains `tab?: GalleryTab`, so the Script's buttons open the drawer straight on Avatars.
- [ ] **Pane drop:** `useGalleryPaneDrop` also accepts `AVATAR_DRAG_MIME` → `addAvatarNode(id, { position })`.
- [ ] **Script drop:** the Script card's wrapper takes `onDragOver`/`onDrop` for the avatar MIME (stopping propagation), placing the node 260 px left of the script and connecting it.
- [ ] `npx tsc --noEmit && npx eslint ...` · commit `feat(canvas): the gallery's Avatars tab — drag onto the canvas or a script (D298)`.

---

### Task 5: The presenter on the Script

**Files:** create `script-presenter.tsx` (exports `ScriptPresenterRow` and `ScriptPresenterBlock`); modify `script-node.tsx`, `script-focus-view.tsx`.

- [ ] Both read `presenterAvatarId(id, nodes, edges)` from the store and the avatar from `useCanvasAvatar`; a gone avatar counts as none.
- [ ] **Row** (card, under "Open ↗"): with a presenter — a 20 px round face, the name, a muted "Presenter"; clicking opens the Avatar node's focus view (`setFocusedNodeId(avatarNodeId)`). Without one, only when the script is parsed — a dashed primary **+ Presenter** chip opening the drawer `{ tab: "avatars", connectToNodeId: id }`.
- [ ] **Block** (focus view header, under the title): with one — face, name, voice line, "On-camera shots from this script use {name}'s face and voice when they're made into stills and videos.", **Change** (drawer as above) and **Remove** (`disconnectNodes(avatarNodeId, scriptId)`). Without — the **+ Add a presenter** chip and "Optional. The avatar whose face and voice this script's stills and videos use."
- [ ] `npx tsc --noEmit && npx eslint ...` · commit `feat(canvas): the Script shows its presenter (D298)`.

---

### Task 6: Record it

- [ ] An "As built" note here; spec amended where the build differs. Commit `docs(canvas): avatars on the canvas, part 1, as built (D298)`.

## Verify in the running app

1. Open a canvas → Gallery (**g**) → **Avatars**: the client's saved avatars; no drafts. With none, the empty state links to the library.
2. Drag a tile onto empty canvas: an Avatar node with face, name, voice. Double-click: the focus view — preview clip (or "No preview yet"), front and sheet zoom, voice, story, Works with, **Edit in Studio**.
3. Drag a tile onto a parsed Script: it lands beside it, connected; the Script card shows the face and name.
4. Drag a second avatar onto the same Script: it replaces the first, with the toast naming both.
5. On another parsed Script with no presenter: **+ Presenter** opens the gallery on Avatars; clicking a tile connects it and closes the drawer.
6. In the Script focus view: the Presenter block; **Remove** disconnects (the node stays); **Change** opens the gallery.
7. Archive the avatar in the Studio: the node says "Archived — still works here" and the Script still shows it.
8. Parse a script with a presenter connected: the output is what it would be without one.
