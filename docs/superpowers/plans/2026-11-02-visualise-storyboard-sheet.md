# Visualise storyboard sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Visualise board (team) and the shared/approved board (client) into one column: a summary card, then a full-width storyboard sheet whose tiles carry their shot; cast, locations and products become chips with popups on the team board; the client sees only the idea, the cast and the storyboard.

**Architecture:** Pure UI restructure on existing data. A new one-column frame replaces the two-pane `ScriptBoardFrame`. The team tile (`PanelTile`) and client tile (`ReviewPanelTile`) share a new caption component; shot anchors move from shot rows to tiles. The cast avatar maker hook is lifted from `CastSlot` into a per-member chip so work in progress survives closing its popup. No routes, queries or migrations change.

**Tech Stack:** Next.js (see AGENTS.md: read `node_modules/next/dist/docs/` before Next-specific code), React 19, Tailwind v4, shadcn on Base UI (`render` prop), TanStack Query v5, Vitest + `react-dom/server` static markup tests.

**Spec:** `docs/superpowers/specs/2026-11-02-visualise-storyboard-sheet-design.md` (read it first; §-refs below point into it). Mockup: Design canvas artboard "2 · Visualise, storyboard sheet (Nov brainstorm)".

**Worktree:** `.claude/worktrees/visualise-sheet`, branch `feat/visualise-sheet` off `origin/staging`. Run `npm install` there once before Task 1 (a real install, never a junctioned `node_modules`).

## Global Constraints

- shadcn primitives from `src/components/ui/*` only; never a raw `<button>`, `<input>`, `<select>`, `<textarea>` (AGENTS.md "Controls").
- Lucide icons, `strokeWidth={1.5}`; colors only through the CSS variables; purple only on primary actions; add actions are dashed primary chips (`border border-dashed border-primary/40 text-primary hover:bg-primary/5`).
- Motion: easing `cubic-bezier(0.22,1,0.36,1)`, 200ms; no springs.
- Performance rule 1: no network call or channel per chip or tile on mount. Chips and tiles read the board query and the store only.
- User-facing copy says "avatar", never "presenter".
- One component per file, named export, split near 200 lines (docs/component-structure.md).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A shot with no panel yet** (and one waiting for an avatar): the tile shows Generate (disabled with the "waiting for…" hint when it can't draw), and the empty frame still opens a shot-only panel view → Task 5 and Task 6 tests.
2. **A comment link on a shot or panel**: scrolls to the tile, because the tile now owns `id="shot-<id>"`, and no other element on the board repeats that id → Task 4 and Task 8 tests.
3. **Closing an avatar popup mid-make**: the chip keeps showing "Making the views…" → Task 7 test (maker state lives in the chip, not the dialog).
4. **A script-only share** (no avatars, no panels): the client sees the shots as tiles without frames, never a wall of empty 9:16 boxes → Task 9 test.
5. **No hover (touch screens)**: Redraw on the frame is visible without hover → Task 5 asserts the class that keeps it visible under `@media (hover: none)`.

---

### Task 1: Pure helpers — cast chip status and "used in" shots

**Files:**
- Modify: `src/lib/scripts/visualise/maker.ts` (beside `castSlotLine`, line ~93)
- Modify: `src/lib/scripts/utils.ts`
- Test: `src/lib/scripts/visualise/__tests__/maker.test.ts`, `src/lib/scripts/__tests__/utils.test.ts` (create if missing)

**Interfaces:**
- Produces: `castChipStatus(avatar: Avatar | null, step: SlotStep | null): { label: string; tone: "ready" | "working" | "attention" | "muted" }`. `SlotStep` is exported from `src/hooks/use-cast-avatar-maker.ts`; to keep `lib` free of hooks, re-declare nothing — accept `step: string | null` and branch on the known values.
- Produces: `shotsUsing(doc: ScriptDoc, ref: { productId: string } | { locationId: string }): string` → e.g. `"S3, S4, S5"`, `""` when none.

- [ ] **Step 1: Write the failing tests**

```ts
describe("castChipStatus", () => {
  it("is working while the maker runs, whatever the avatar", () => {
    expect(castChipStatus(null, "face")).toEqual({ label: "Making the face…", tone: "working" });
    expect(castChipStatus(readyAvatar(MEENAKSHI_AVATAR, "m"), "views")).toEqual({ label: "Making the views…", tone: "working" });
  });
  it("names every not-yet state (spec §2.1)", () => {
    expect(castChipStatus(null, null)).toEqual({ label: "No avatar yet", tone: "muted" });
    expect(castChipStatus(readyAvatar(MEENAKSHI_AVATAR, "m", { archivedAt: "2026-10-01T00:00:00.000Z" }), null).label).toBe("Archived");
    expect(castChipStatus(readyAvatar(MEENAKSHI_AVATAR, "m", { status: "draft" }), null).label).toBe("Needs its four views");
    expect(castChipStatus(readyAvatar(MEENAKSHI_AVATAR, "m", { sheetStale: true }), null).label).toBe("Out of date");
    // An uploaded photo with no consent yet (see needsLikenessConsent in lib/avatars/utils.ts).
    expect(castChipStatus(uploadedNoConsent(), null).label).toBe("Waiting for consent");
  });
  it("is ready only when panels can use it", () => {
    expect(castChipStatus(readyAvatar(MEENAKSHI_AVATAR, "m"), null)).toEqual({ label: "Ready", tone: "ready" });
  });
});

describe("shotsUsing", () => {
  it("lists the shots in reel order", () => {
    // doc with s1 location L1, s2 none, s3 location L1 + product P1
    expect(shotsUsing(doc, { locationId: "L1" })).toBe("S1, S3");
    expect(shotsUsing(doc, { productId: "P1" })).toBe("S3");
    expect(shotsUsing(doc, { productId: "nope" })).toBe("");
  });
});
```

Order of checks in `castChipStatus`: step (face → "Making the face…", views → "Making the views…", save/link → "Saving…", upload → "Uploading…", consent → "Confirming…"), then no avatar, archived, consent needed, not ready / no four views, sheet stale, ready. Build `uploadedNoConsent()` from `readyAvatar` with an upload-sourced `front` and `likenessConsentAt: null`.

- [ ] **Step 2: Run to see them fail** — `npx vitest run src/lib/scripts/visualise/__tests__/maker.test.ts src/lib/scripts/__tests__/utils.test.ts` → FAIL, not defined.
- [ ] **Step 3: Implement both functions** using `needsLikenessConsent` and `hasFourViews` from `src/lib/avatars/utils.ts`.
- [ ] **Step 4: Run again** → PASS.
- [ ] **Step 5: Commit** `feat(visualise): cast chip status and shots-using helpers (D465)`

---

### Task 2: Summary card — a side area and a client cut

**Files:**
- Modify: `src/components/scripts/script-context-card.tsx`
- Test: `src/components/scripts/__tests__/script-context-card.test.tsx` (create)

**Interfaces:**
- Produces: `ScriptContextCard({ doc, stage, after, side, audience }: { …existing; side?: ReactNode; audience?: "team" | "client" })`.
  - `side`: rendered as a second area inside the card. From `lg` it sits to the right of the brief (brief `flex-[3_1_26rem]`, side `flex-[2_1_20rem]`, a left border `lg:border-l lg:pl-6`); below `lg` it stacks under the brief with a top border.
  - `audience="client"`: leaves out Setting and camera and Watch-outs (spec §2.4); keeps reel label, title, facts line, purpose, disclaimers. Default `"team"` = today.

- [ ] **Step 1: Failing tests** (`renderToStaticMarkup` with `reel01Doc()`):
  - `it("keeps every section for the team")` → contains "Setting and camera" and "Watch-outs".
  - `it("shows the client only the idea and the claims")` with `audience="client"` → contains "Purpose" and "Disclaimers" (give the doc a disclaimer), not "Setting and camera", not "Watch-outs".
  - `it("draws the side area inside the card")` with `side={<span>chips</span>}` → the `<span>chips</span>` appears before `</section>`.
- [ ] **Step 2: Run** `npx vitest run src/components/scripts/__tests__/script-context-card.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Generate and the read-only script page pass neither prop, so they render as today.
- [ ] **Step 4: Run** the new test and `src/components/scripts/__tests__/script-view.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(scripts): context card takes a side area and a client cut (D465)`

---

### Task 3: One-column board frame

**Files:**
- Create: `src/components/scripts/script-sheet-frame.tsx`
- Test: `src/components/scripts/__tests__/script-sheet-frame.test.tsx`

**Interfaces:**
- Produces: `ScriptSheetFrame({ children, column }: { children: ReactNode; column?: ReactNode })` — a grid `items-start gap-6`; with `column`, `xl:grid-cols-[minmax(0,1fr)_20rem]`. `children` go in one `<div className="flex min-w-0 flex-col gap-6">`. (The old `ScriptBoardFrame` stays until Task 9 removes it.)

- [ ] **Step 1: Failing test** — renders children, renders the column after them, and only adds the `xl:grid-cols-[minmax(0,1fr)_20rem]` class when `column` is given.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(scripts): one-column board frame (D465)`

---

### Task 4: Shared tile caption, sheet columns, shot anchor on the tile

**Files:**
- Create: `src/components/visualise/panel-tile-caption.tsx`
- Modify: `src/components/visualise/storyboard-grid.tsx` (grid classes and copy)
- Test: `src/components/visualise/__tests__/panel-tile-caption.test.tsx`

**Interfaces:**
- Produces: `PanelTileCaption({ label, beat, time, visual, vo }: { label: string; beat: string; time: string; visual: string; vo: string })` — line 1: `label` (font-medium, foreground) + `beat` (`.text-eyebrow`, omitted when empty) on the left, `time` (tabular-nums, muted) on the right; then `visual` with `line-clamp-3 text-sm`; then `vo` in `text-muted-foreground line-clamp-2` wrapped in curly quotes “…”, omitted when empty.
- Produces: `StoryboardGrid` grid becomes `grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` (both boards are full width now). Its signature is unchanged.
- Rule for Tasks 5 and 9: the tile's root `<figure>` carries `id={shotAnchor(shotId)}` (from `src/lib/scripts/anchors.ts`) and `scroll-mt-6`.

- [ ] **Step 1: Failing tests** — `it("writes the shot under the frame in storyboard order")`: label, beat, time, visual and “vo” all present, in that order; `it("leaves out an empty spoken line and an empty beat")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(visualise): shared tile caption; storyboard flows across the full width (D465)`

---

### Task 5: The team tile

**Files:**
- Modify: `src/components/visualise/panel-tile.tsx`, `src/components/visualise/panel-frame.tsx`
- Test: `src/components/visualise/__tests__/panel-tile.test.tsx` (create)

**Interfaces:**
- Consumes: `PanelTileCaption` (Task 4); `ScriptShotAssets` (`src/components/scripts/script-shot-assets.tsx`, unchanged; needs `ScriptAssetsProvider` above it, which `VisualiseView` already has).
- Produces: `PanelTile` props become `{ shot: Shot; doc: Pick<ScriptDoc, "products" | "locations">; label: string; time: string; view: PanelView; aspect: string; credits: number | null; onDraw: () => void; onRedraw: (body: DrawBody) => void; onOpen: () => void; shotMarker?: ReactNode; panelMarker?: ReactNode }` (`description` and `marker` are gone; the description is `shot.visual`).
- Produces: `PanelFrame` empty state (no pick, not generating) becomes a ghost `Button` covering the box with `aria-label={`Open ${label}`}` calling `onOpen`, keeping today's dashed/solid border rule, with "Not drawn yet" centred in `text-xs text-muted-foreground`.

Tile, top to bottom (spec §2.2):
1. Frame wrapper `group relative`: `PanelFrame`; Out of date / Failed badge top-left as today; **Redraw top-right** when `view.pick && status !== "generating"`: `RedrawPopover` with `trigger` = `RefreshCw` icon + "Redraw", `className` adding `absolute right-2 top-2 z-10 h-7 rounded-full bg-background/95 shadow-card` and the visibility classes `opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 data-[popup-open]:opacity-100 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]`; disabled and suggestions as today.
2. `PanelTileCaption` with the shot's `beat`, `visual`, `vo`.
3. `ScriptShotAssets shot doc`.
4. **Generate only when `!view.pick`**: today's Button (Generate / Generate again / Drawing…, `AvatarCreditCost`) inside today's `Hint` with `waitingMessage`.
5. `shotMarker` and `panelMarker` in a row under it (`flex items-center gap-2`), when given.
Drop `PanelHoverLine` from the tile (the shot is written under it now).

- [ ] **Step 1: Failing tests** (static markup inside `ScriptAssetsProvider`-free render; `ScriptShotAssets` then renders its read-only line — that's fine for these assertions; use `makeTake`/view fixtures from `src/lib/scripts/visualise/__tests__/fixtures.ts`):
  - `it("puts the shot under a drawn panel and Redraw on the frame, with no button below")` → contains the visual, `“` + vo, `aria-label` of the Redraw trigger, not ">Generate<".
  - `it("keeps Redraw visible where there is no hover")` → the trigger's class contains `[@media(hover:hover)]:opacity-0` and `opacity-100`.
  - `it("offers Generate on a shot with no panel, and the empty frame still opens")` → contains "Generate", `aria-label="Open S8"`, "Not drawn yet".
  - `it("anchors the tile to its shot")` → contains `id="shot-s01"`.
- [ ] **Step 2: Run** `npx vitest run src/components/visualise/__tests__/panel-tile.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Keep the file under ~150 lines; move the `Hint` helper to `src/components/visualise/panel-hint.tsx` if it grows.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(visualise): a panel tile carries its shot, its pickers, and Redraw on the frame (D465)`

---

### Task 6: Panel view — the whole shot, and a shot-only view before the first draw

**Files:**
- Modify: `src/components/visualise/panel-dialog.tsx`
- Create: `src/components/visualise/panel-shot-details.tsx`
- Modify: `src/lib/scripts/visualise/state.ts` (add `panelViewMode`)
- Test: `src/components/visualise/__tests__/panel-shot-details.test.tsx` (static markup — the repo has no DOM test library, and dialog content is portalled) and `src/lib/scripts/visualise/__tests__/state.test.ts`

**Interfaces:**
- Produces: `PanelShotDetails({ shot, castNames }: { shot: Shot; castNames: string[] })` — the action, the spoken line, "On-screen text" (omitted when empty) and "On screen: Meenakshi, Raghu" (or "Nobody (B-roll)").
- Produces: `panelViewMode(view: Pick<PanelView, "pick" | "status">): "shot-only" | "full"` — `"shot-only"` when `!view.pick && view.status !== "generating"`.
- Produces: `PanelDialog` gains `shot: Shot`, `castNames: string[]`, `onGenerate: () => void`. In `"shot-only"` mode it renders the empty frame, `PanelShotDetails`, and a Generate button (with cost and the waiting hint); **no `PanelTakes`, no `PanelPromptBox`, no Redraw** (spec §2.2). Otherwise as today, with `PanelShotDetails` added above `PanelTakes`.

- [ ] **Step 1: Failing tests** — `PanelShotDetails` lists the on-screen text and the names, says "Nobody (B-roll)" for an empty `onScreen`, and leaves out "On-screen text" when empty; `panelViewMode` is `"shot-only"` for no pick (idle, waiting, failed), `"full"` with a pick, and `"full"` while generating.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(visualise): the panel view shows the whole shot and opens before the first draw (D465)`

---

### Task 7: Chips and popups for cast, locations and products

**Files:**
- Modify: `src/components/visualise/cast-slot.tsx` (takes the maker from its parent; `bare` drops the Card chrome for use in a dialog)
- Create: `src/components/visualise/cast-chip.tsx`, `src/components/visualise/asset-chip.tsx`, `src/components/visualise/board-chips.tsx`
- Test: `src/components/visualise/__tests__/board-chips.test.tsx`

**Interfaces:**
- Consumes: `castChipStatus`, `shotsUsing` (Task 1); `useCastAvatarMaker`, `SlotStep` (`src/hooks/use-cast-avatar-maker.ts`, unchanged); `ScriptLocationCard`, `ScriptProductCard` (unchanged; they render `<li>`, so wrap each in `<ul>` inside the dialog); `useScriptAssets` for the add chips.
- Produces: `CastSlot({ clientId, scriptId, member, avatar, takenIds, maker, modelId, onModelId, bare })` — `maker: ReturnType<typeof useCastAvatarMaker>`, `modelId: string`, `onModelId: (id: string) => void`, `bare?: boolean`. The hook call and the `modelId` state move out to `CastChip`; everything else in the card is unchanged.
- Produces: `CastChip({ clientId, scriptId, member, avatar, faceUrl, takenIds, marker }: { …; faceUrl: string | null; marker?: ReactNode })` — owns `useState(VISUALISE_AVATAR_MODEL_ID)`, `useCastAvatarMaker(...)` and `open`. Renders an outline `Button` (`id={castAnchor(member.id)}`, `scroll-mt-6`): a 36px round face (`faceUrl`, else a dashed circle), the name, a "Lead" `Badge` when `member.isLead`, and the `castChipStatus` label (`tone` → `working` = `text-primary` with a spinning `Loader2`, `attention` = `text-destructive-text`, else muted). `marker` sits after the button. A `Dialog` (`sm:max-w-3xl`, title = name) holds `<CastSlot … bare />`, kept mounted only while open — the maker lives in the chip, so closing never loses work.
- Produces: `AssetChip({ kind, name, thumbUrl, usedIn, needsPicture, children }: { kind: "product" | "location"; name: string; thumbUrl: string | null; usedIn: string; needsPicture?: boolean; children: ReactNode })` — outline Button with a 36px rounded thumb (or a `Package` / `MapPin` placeholder), the name, and "Needs a picture" in muted text when `needsPicture`; its Dialog (`sm:max-w-lg`, title = name) shows `children` (the existing card) and `In ${usedIn}` when `usedIn` is non-empty.
- Produces: `BoardChips({ clientId, scriptId, doc, avatars, faces, castMarker }: { clientId: string; scriptId: string; doc: ScriptDoc; avatars: ReadonlyMap<string, Avatar>; faces: Record<string, string | null>; castMarker?: (castId: string) => ReactNode })` — three labelled rows (`.text-eyebrow` "Cast · 3", "Locations · 2", "Products · 1") of wrapping chips; dashed "Add" chips after locations and products using today's `add_location` / `add_product` ops and the `MAX_LOCATIONS` / `MAX_PRODUCTS` limits; no add on the cast row. `takenIds` per member is computed as `cast-slots.tsx` does today.

- [ ] **Step 1: Failing tests** (static markup inside `QueryClientProvider` and `ScriptAssetsProvider`, `linkedDoc()` with one product and one location):
  - `it("shows a chip per person with a status, the face, and the lead tag")` → "Meenakshi", "Lead", "Ready", `id="cast-…"`.
  - `it("says a person has no avatar yet")` → for an unlinked member, "No avatar yet".
  - `it("lists locations and products with add chips, and no add on the cast")` → "Add a location", "Add a product", exactly two "Add" chips.
  - `it("draws no dialog until a chip is opened")` → no `role="dialog"`.
- [ ] **Step 2: Run** `npx vitest run src/components/visualise/__tests__/board-chips.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `CastSlot` changes, then `CastChip`, `AssetChip`, `BoardChips`.
- [ ] **Step 4: Run** → PASS. Then `npx tsc --noEmit` → only errors from `cast-slots.tsx` (still calling the old `CastSlot`), which Task 8 deletes.
- [ ] **Step 5: Commit** `feat(visualise): cast, locations and products as chips with popups (D465)`

---

### Task 8: The team board in one column

**Files:**
- Modify: `src/components/visualise/visualise-view.tsx`
- Delete: `src/components/visualise/cast-slots.tsx`, `src/components/visualise/panel-shot-status.tsx` (confirm no other importer with a grep first)
- Modify: `src/lib/script-review/anchors.ts` (comment only: "a panel in its shot's tile")
- Test: `src/components/script-review/__tests__/team-review-board.test.tsx` (update)

**Interfaces:**
- Consumes: Tasks 2–7. `VisualiseReview` keeps its shape (`actions`, `contextMarker`, `shotMarker`, `castMarker`, `panelMarker`, `column`).
- Produces: `VisualiseView` renders, inside `ScriptAssetsProvider`: `VisualiseReadiness` (unchanged) → `ScriptSheetFrame column={review?.column}` containing `ScriptContextCard doc stage after={review?.contextMarker} side={<BoardChips … faces={model.avatarFaces} castMarker={review?.castMarker} />}` → `StoryboardGrid` (settings and Generate all as today) of `PanelTile`s (`shot`, `doc={script.doc}`, `shotMarker`, `panelMarker`). `PanelDialog` gets `shot`, `castNames` (names of `shot.onScreen` in `script.doc.cast`) and `onGenerate={() => void draws.draw(openShot)}`; the dialog now opens for any shot, drawn or not.

- [ ] **Step 1: Update the tests first.** In `team-review-board.test.tsx`: rename "keeps spec 3's two panes before anything is shared" to "keeps one column before anything is shared", and add `it("puts each shot's tile under its shot anchor exactly once")` → `html.match(/id="shot-s01"/g)` has length 1, and `aria-label="Shots"` (the old list) is absent.
- [ ] **Step 2: Run** `npx vitest run src/components/script-review/__tests__/team-review-board.test.tsx` → FAIL.
- [ ] **Step 3: Implement**; delete the two files.
- [ ] **Step 4: Run** the test, then `npx tsc --noEmit` → clean except anything in `frozen-board.tsx`'s area that Task 9 owns (there should be none).
- [ ] **Step 5: Commit** `feat(visualise): the board is one column — summary, then the storyboard sheet (D465)`

---

### Task 9: The client's board

**Files:**
- Modify: `src/components/script-review/frozen-board.tsx`, `review-storyboard.tsx`, `review-panel-tile.tsx`, `review-cast.tsx`
- Delete: `src/components/scripts/script-board-frame.tsx` and `src/components/scripts/__tests__/script-board-frame.test.tsx`; `src/components/visualise/panel-hover-line.tsx` and its test — each only after a grep shows no importer left.
- Test: `src/components/script-review/__tests__/frozen-board.test.tsx`, `review-visuals.test.tsx` (update)

**Interfaces:**
- Consumes: `ScriptSheetFrame` (Task 3), `ScriptContextCard audience="client"` (Task 2), `PanelTileCaption` + anchor rule (Task 4).
- Produces: `FrozenBoard` renders `ScriptSheetFrame column` with: `ScriptContextCard doc stage audience="client" after={<PartMarker part={{ kind: "context" }} className="self-end" />}` → `ReviewCast` → `ReviewStoryboard doc panels={scopeIncludes(scope,"panels") ? visuals.panels : null}`. **No `ScriptView`, no `ScriptAssetsSection`, no product or location anywhere** (spec §2.4).
- Produces: `ReviewCast` lays its cards in a row: `grid gap-4 md:grid-cols-2 xl:grid-cols-3`; `ReviewCastCard` unchanged.
- Produces: `ReviewStoryboard({ doc, panels }: { doc: ScriptDoc; panels: Record<string, PanelSnapshot> | null })` — always rendered (the shots now live here); `panels === null` → tiles without frames.
- Produces: `ReviewPanelTile({ shot, label, time, url, aspect, showFrame, onOpen })` — `figure id={shotAnchor(shot.id)}`; frame only when `showFrame` (as today: image button, or "No panel"); `PanelTileCaption`; a row with `PartMarker part={{kind:"shot",shotId}}` and, when `url`, `PartMarker part={{kind:"panel",shotId}} label={`${label} panel`}`.

- [ ] **Step 1: Update tests first** in `frozen-board.test.tsx`:
  - script-only share: still has `id="script-context"`, `aria-label="Comment on S1"`, `aria-label="Comment on Context"`, `aria-label="Cast"`; now **has** `aria-label="Storyboard"` with the shot's visual text and **no** `aspect-ratio` frame; has no "Setting and camera", no "Watch-outs", no "Products", no "Locations", no "Location:".
  - avatars share: "Meenakshi: four views" as today.
  - full share: a frame image `https://cdn/p.png` and `aria-label="Comment on S1 panel"`; `id="shot-s01"` exactly once.
  - Keep the `<aside>the column</aside>` assertion.
- [ ] **Step 2: Run** `npx vitest run src/components/script-review` → FAIL.
- [ ] **Step 3: Implement**, then delete the files listed above.
- [ ] **Step 4: Run** `npx vitest run src/components/script-review src/components/scripts src/components/visualise` → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** `feat(script-review): the client's board — the idea, the cast and the storyboard only (D465)`

---

### Task 10: ADR, full check, and a click-through

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (append **D465**, in the log's format: Decision / Why / Rejected / Refines / Originated → spec)

- [ ] **Step 1: Write D465.** Decision: the Visualise board is one column — a summary card with cast/location/product chips and popups over a full-width storyboard sheet whose tiles carry their shot, pickers and an on-frame Redraw; the client's board takes the same layout showing only the idea (title, facts, purpose, disclaimers), the cast and the storyboard. Why: avatars filled the screen; the shot list and storyboard repeated each other; the client should see only what it signs off on. Rejected: a right-hand column with jump links (the "compact" artboard); two-up tiles; landscape cards; location comments and client review of locations/products. Refines: D358, D359, D446. Originated → `2026-11-02-visualise-storyboard-sheet-design.md`.
- [ ] **Step 2: Full check** — `npx tsc --noEmit`, `npx vitest run`, `npm run lint`. Expected: clean, apart from failures already known on staging (re-run the kling/upstream-images timeouts once before investigating).
- [ ] **Step 3: Click-through** (`npm run dev` in the worktree, a Visualise-stage script with three cast members, products and locations): storyboard starts on the first screen at 1440×900; set a shot's location; hover a panel → Redraw → popover; open an empty frame → shot-only view; open an avatar chip, start Make, close → chip shows "Making…"; open a location chip → Redraw plate; on In review, a comment heading scrolls to the tile; open the share link → no locations, products, setting or watch-outs. Note what you could not check.
- [ ] **Step 4: Commit** `docs(adr): D465 — Visualise as a storyboard sheet`
