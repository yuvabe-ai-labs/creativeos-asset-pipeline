# Editor UX, Dub & Lip Sync, Premiere Alternates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rough Cut Editor feel like a desktop editor (playback through cuts, resizable/collapsible layout, zoom, smooth drag, snapping, right-click, clip inspector, waveform and thumbnails), dub and lip sync clips from it through a Dubbing node on the canvas, and export the alternatives and pause markers to Premiere.

**Architecture:** Pure logic first (`advanceClock`, `timeline-view.ts` zoom/snap/reorder maths, `remapSource`, Premiere alternates/markers), each unit-tested; then React components that consume it. Part B adds one route (`dub-source`) that changes the canvas graph and rewrites the saved edit under the canvas lock, and a session exception on the dub/lip-sync routes.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before route changes), TypeScript, Zustand, TanStack Query v5, Base UI shadcn primitives, Vitest, Trigger.dev v4 (existing dub/lip-sync tasks, unchanged).

**Spec:** `docs/superpowers/specs/2026-10-23-editor-ux-dub-design.md` (D402–D409). **UX reference:** https://claude.ai/artifact/Axi8g4L6YMZbwEjyB9kVSE

## Global Constraints

- Branch `feat/rough-cut-editor`; commit per task; **no AI attribution in commits** (user's global rule).
- shadcn primitives only for controls; Lucide icons at `strokeWidth={1.5}`; motion easing `cubic-bezier(0.22,1,0.36,1)`.
- Routes: `withCanvas`/`withNode`, `apiOk`/`apiError`, `withTryCatch`.
- Performance: nothing per item on mount except the deliberate, throttled media reads in A5 (one source at a time for frames, two at a time for loudness, cached for the visit); a no-op returns the same doc; drags are one undo step (`begin`/`commit`).
- Plain UI copy; one time format (`formatTime`, `MM:SS.ss`).
- Test per folder: `npx vitest run src/lib/editor`, `src/hooks`, `src/app/api/canvases`, `src/app/api/nodes`.

---

## Part A — editing UX

### Task A1: Playback through cuts (D402)
**Files:** create `src/lib/editor/clock.ts`, test `src/lib/editor/__tests__/clock.test.ts`; modify `src/hooks/use-reel-playback.ts`.
**Produces:** `advanceClock(a: { offset: number; length: number; local: number; fileTime: number | null; ended: boolean; total: number; fps: number }): { time: number; crossed: boolean; done: boolean }`.
- [ ] Test: within a piece → `offset + max(local, fileTime - in)`; `ended` or `fileTime ≥ length − ½ frame` → `crossed: true`, time = offset + length; at the reel's end → `done: true`; `fileTime: null` (media not ready) → hold.
- [ ] Implement; in the hook, the rAF loop is the only driver; `requestVideoFrameCallback` writes `{ src, mediaTime }` into a ref and re-registers itself on every callback and on `play`/`loadeddata`; the loop reads it when `src` matches. Remove the watchdog and token.
- [ ] Verify: tests pass; manual: Reel 2 plays through all cuts. Commit.

### Task A2: Timeline view maths
**Files:** create `src/lib/editor/timeline-view.ts`, test `timeline-view.test.ts`; modify `timeline-scale.ts` (keep `laneBox`).
**Produces:** `MIN_ZOOM=10`, `MAX_ZOOM=220`, `clampZoom(z)`, `fitZoom(viewPx, totalSeconds)`, `zoomAround(oldZoom, newZoom, time, scrollLeft) → scrollLeft` (keeps the time under the same screen x), `followScroll(time, zoom, scrollLeft, viewPx) → scrollLeft | null` (pages when the playhead leaves), `snapTarget(candidateSeconds, targets: number[], zoom, px=8) → number | null`, `reorderIndex(pointerSeconds, pieces) → number` (insertion index by piece midpoints), `rulerStep(zoom) → { minor, major }`.
- [ ] Tests for each (edges: empty reel, zoom clamps, snap within/outside 8 px, insertion at start/end). Implement. Commit.

### Task A3: Layout — divider, collapsible panels, View menu (D403)
**Files:** create `src/components/editor/editor-layout.ts` (pure: `clampTimelineHeight(h, viewport)`, storage keys), `editor-divider.tsx`, `editor-panel-rail.tsx`, `editor-view-menu.tsx`, `src/hooks/use-editor-layout.ts` (state + localStorage in try/catch); modify `editor-shell.tsx` (grid with CSS vars `--left`/`--right`, timeline height), `editor-sources-panel.tsx` and `editor-props-panel.tsx` (collapse chevrons), `use-editor-shortcuts.ts` (Ctrl/⌘+1/2).
- [ ] Unit test `clampTimelineHeight`. Implement; the page is `h-dvh overflow-hidden`; the timeline section has a fixed height from state and an inner scroll area. Commit.

### Task A4: Timeline — zoom, fit, follow, ruler scrub, unified time
**Files:** modify `editor-timeline.tsx` (zoom state, toolbar: Snap toggle, zoom Slider, −/+, Fit; Ctrl/⌘+wheel; `followScroll` on time change while playing; empty-lane click seeks), `editor-timeline-ruler.tsx` (steps from `rulerStep`, drag scrub), `use-editor-shortcuts.ts` (Ctrl/⌘ +/−, Shift+Z, Home/End), `editor-captions-text.tsx` (use `formatTime`).
- [ ] Implement with `timeline-view.ts`; zoom state lives in a small context (`EditorViewProvider`) so lanes read one value. Commit.

### Task A5: Pointer drag with edge auto-scroll; snapping trims (D404)
**Files:** create `src/hooks/use-edge-autoscroll.ts`, `editor-drop-marker.tsx`; modify `editor-timeline-piece.tsx` (pointer reorder replaces HTML DnD; ghost; trims call `snapTarget` with playhead + piece edges when Snap is on; tooltip), `editor-timeline.tsx` (drop marker, apply `movePiece` on release), `editor-caption-block.tsx` (edge auto-scroll).
- [ ] Each drag `begin`/`commit` (one undo step). Manual check: drag a clip past the right edge; the view scrolls and the marker follows. Commit.

### Task A6: Lanes — filmstrip, waveform, quiet stretches, badges
**Files:** create `src/hooks/use-source-frames.ts` (one hidden `<video>` at a time per source; 8 frames into canvases kept in a module cache), `editor-filmstrip.tsx`, `editor-waveform.tsx` (draws `useQuietWindows` RMS; shades quiet stretches from `quietSections`, click to seek, right-click menu), modify `editor-timeline-lanes.tsx`, `editor-timeline-piece.tsx` (filmstrip + DUB/LIP badges), `editor-source-row.tsx` (thumbnail canvas), `use-quiet` limiter (two at a time).
- [ ] Reuse `src/lib/editor/silence.ts` for quiet stretches. Commit.

### Task A7: Clip inspector (D405)
**Files:** create `editor-clip-inspector.tsx` (tabs), `editor-clip-tab.tsx` (from `editor-piece-props.tsx`: trims, picture, sound, quiet chips), `editor-clip-captions-tab.tsx` (`EditorCaptionLine` filtered to the piece + "Redo captions for this clip" via `useAutoCaptionsContext().start([pieceId])`), placeholder `editor-dub-tab.tsx` (Part B fills it); modify `editor-props-panel.tsx` (piece → inspector).
- [ ] Commit.

### Task A8: Right-click menus
**Files:** add `src/components/ui/context-menu.tsx` if absent (Base UI ContextMenu, same API shape as `dropdown-menu.tsx`); create `editor-clip-menu.tsx`, `editor-caption-menu.tsx`, `editor-quiet-menu.tsx`, `editor-ruler-menu.tsx`; wire into piece, caption block, waveform, ruler. Actions call existing store ops (`splitPieceInDoc`, `deletePiece`, `setPicture`, `setSound`, duplicate via `addSourceAgain`-style insert after the piece) and Part B's `startDub`.
- [ ] Add `duplicatePiece(doc, pieceId, newId)` to `pieces.ts` with a test. Commit.

---

## Part B — dub and lip sync

### Task B1: A Dubbing source without a dub plays its input (D407)
**Files:** modify `src/lib/editor/sources.ts` (`takeUrls` for a dubbing node with no output → the upstream Video Gen's take found through `edges` + `nodes`, version id `input:<id>`), `load-state.ts` (pass the needed lookups); test in `sources.test.ts`.
- [ ] Commit.

### Task B2: `remapSource` and the dub-source route (D406)
**Files:** create `src/lib/editor/remap-source.ts` (`remapSource(doc, fromNodeId, to: EditSource) → EditDoc`: pieces' `sourceNodeId`, the `sources` entry), test; create `src/lib/db/canvas-graph.ts` (`insertNode`, `insertEdges`, `deleteEdge` — single-row writes, service role), `src/app/api/canvases/[cid]/editor/dub-source/route.ts` + test.
- Route: `{ nodeId, sessionId, sourceNodeId }` → lock holder must equal `sessionId` (409 otherwise); the source must be a `video-gen` feeding this Editor (404); create the Dubbing node at `{ x: vg.x + 340, y: vg.y }` with `data: {}`; edges VG→Dub and Dub→Editor; delete VG→Editor; `saveEditorEdit(remapSource(...))`; return `loadEditorState(canvasId)`.
- [ ] Commit.

### Task B3: The editor may dub what feeds it (D408)
**Files:** modify `src/lib/editor/lock-guard.ts` (`editorLockResponse(nodeId, editorSessionId?)`: when locked, allow if `getCanvasLockHolder(canvasId of node) === editorSessionId`), `src/app/api/nodes/[id]/dub/route.ts` and `lip-sync/route.ts` (read optional `editorSessionId`), tests.
- [ ] Commit.

### Task B4: The Dub & lip sync tab and lane
**Files:** create `src/hooks/use-editor-dub.ts` (start: flush → dub-source if Video Gen → `nodeGeneration` dub start with `editorSessionId`; poll the Dubbing node's latest generation every 3 s while live; on finish re-read editor state, adopt sources, switch that source's pieces to dubbed / lip-synced, toast with "Use original"), `editor-dub-tab.tsx` (steps, language + style selects from `src/lib/dubbing/types`, costs from `dubbing/cost.ts`, canvas note), modify Dub lane (busy stripe), store: `replaceAll(doc, sources)` that clears history.
- [ ] Commit.

---

## Part C — Premiere (D409)

### Task C1: Alternates switched off, clip markers, pause markers
**Files:** modify `sequence-plan.ts` (`PlanClip.altPicture`, `altDub`, `markers`; sequence `markers` from transcripts — `planSequence` takes an optional `pauses` map from sound URL to pauses), `premiere-xml.ts` (alt picture track above captions, `<enabled>FALSE</enabled>`; disabled dub on A3/A4; `<marker>` elements), `package.ts` README, `export-run`/exports route (load transcripts for the plan's sound files and compute pauses > 0.6 s); tests in `sequence-plan.test.ts`, `premiere-xml.test.ts`.
- [ ] Commit.

### Task C2: Verify end to end
- [ ] All test folders pass; `tsc` clean; lint clean on changed files.
- [ ] Manual (user): the spec's manual list.
