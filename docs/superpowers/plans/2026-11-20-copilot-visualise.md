# The copilot at Visualise (piece 5.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At Visualise the script's copilot gets its message box, acts on what it is asked (at once, on a card, or as a button the person presses), and leads the person through the storyboard with a step card worked out from the board.

**Architecture:** The writing copilot is extended, not duplicated (spec §4 A). Its turn and proposals routes accept a script at Visualise; a new compare-and-set write on `updated_at` (the one every Visualise write uses) saves its changes; a pure function decides, per request, apply / card / refuse. A Visualise-only part of the edit prompt describes the board and a Visualise-only output schema adds panel picks and an offered button. In the browser one client workspace owns the thread query, the board query, the draw queue and the asset actions, and renders the panel beside the board, so the chat's buttons do exactly what the board's do. The walk is a pure function of the board, read fresh on every render.

**Tech Stack:** Next.js app router (route handlers, server components), React 19, TanStack Query v5, Base UI shadcn primitives, Zod, Vitest (`environment: "node"`, `renderToStaticMarkup`, `vi.mock`).

**Spec:** `docs/superpowers/specs/2026-11-20-copilot-visualise-design.md` (approved 2026-11-20).

## Global Constraints

- Drawing panels, making an avatar or its views, drawing a location's picture, sending for client review and reopening are only ever started by the person's click. The copilot's output has no way to start any of them.
- Generate is untouched: the edit prompt and its output schema at Generate are byte-for-byte what they are today; every existing Generate test passes unchanged.
- At Visualise: cast an avatar / set the lead / products and locations / one shot or one field of words → at once. Several shots, any `insert_shot` `remove_shot` `split_shot` `move_shot`, any `add_cast` `remove_cast` `update_cast` → a before-and-after card. `confirm_item` and notes `set_field` → refused with a Reopen offer. A pasted whole script → refused with a Reopen offer. A request mixing at-once and card edits → one card.
- In review and Approved stay read-only (no message box, cards without buttons), as D523.
- At Visualise the panel starts open; In review and Approved start folded; a stored fold choice wins.
- Pictures attached in the chat go to the script's own folder through the same upload the board uses; never to brand assets.
- AGENTS.md: shadcn primitives only (Button, InputGroup…, never native controls); Lucide icons 1.5 stroke; TanStack Query three layers, keys from the factories; nothing per item on load (no request or channel per shot, character or chip); no new polling.
- Copy uses "avatar", never "presenter". Plain sentences.
- New ADRs start at **D524**; the log has two D489s, so never write "D489" without "(second)".
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Add files by name; never `git add docs` (the untracked `2026-11-12-copilot-journey-problem-solution.md` must stay untracked).

## Review Focus

1. **A teammate typed into a shot while the copilot worked.** The copilot's save at Visualise must not overwrite it: the write is compare-and-set on `updated_at`, and the edit's own stale-shot check still runs on the fresh read.
2. **The script left Visualise mid-turn** (Share pressed in another tab). The copilot's change is refused with a plain sentence; nothing is written into an In review script.
3. **A card accepted at Visualise that adds a shot.** Untouched shots keep their picks and takes; the new shot shows "not yet" and the walk counts it.
4. **A panel pick naming a take that is not a succeeded take of that shot.** Refused for that pick only; the rest of the turn stands.
5. **A picture attached with no products and no locations on the script.** The composer says there is nothing to attach it to and does not upload.

---

### Task 1: The copilot's write at Visualise

**Files:**
- Modify: `src/lib/scripts/copilot/change.ts`
- Modify: `src/lib/db/script-generate.ts`
- Test: `src/lib/scripts/copilot/__tests__/change.test.ts` (extend; create if absent)

**Interfaces:**
- Produces: `changeWithRetry(io, change, { stage = "generate" }?: { stage?: "generate" | "visualise" }, attempts = 3)`; `ChangeIO.save` becomes `(current: GenerateScript, patch: ScriptPatch) => Promise<GenerateScript | null>`.
- Produces: `changeVisualiseScript<T>(clientId, scriptId, change): Promise<ChangeOutcome<T>>` in `script-generate.ts`, saving with `.eq("stage","visualise").eq("updated_at", current.updatedAt)` and setting `updated_at` (no `doc_version` bump, as every Visualise write).

- [ ] **Step 1: Write the failing tests**
  - `it("refuses a script at Visualise unless the change is for Visualise")`: io.read returns stage "visualise" → default options give `{ error: "This script is final. Reopen it from Visualise to change it.", status: 409 }`.
  - `it("applies a change at Visualise when asked to")`: `{ stage: "visualise" }`, read returns stage "visualise" → `save` called with `(current, patch)`, result returned.
  - `it("refuses a Visualise change once the script has moved to review")`: `{ stage: "visualise" }`, read returns "in_review" → `{ error: "The script has moved on from Visualise, so nothing was changed.", status: 409 }`.
  - `it("retries on the fresh script when the Visualise save misses")`: first save returns null, second read has a new `updatedAt`; change runs twice.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/change.test.ts` — Expected: the three new Visualise tests FAIL.
- [ ] **Step 3: Implement** the option and the `save(current, patch)` shape; `changeGenerateScript` passes `(c, p) => saveGenerateScript(clientId, scriptId, c.docVersion, p)`; add `saveVisualiseScript(clientId, scriptId, expectedUpdatedAt, patch)` and `changeVisualiseScript`.
- [ ] **Step 4: Run** the file and `npx vitest run src/lib/db src/lib/scripts/copilot` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): the script copilot can save at Visualise (compare-and-set on updated_at)`.

### Task 2: What a request does at Visualise

**Files:**
- Create: `src/lib/scripts/copilot/visualise-edits.ts`
- Test: `src/lib/scripts/copilot/__tests__/visualise-edits.test.ts`

**Interfaces:**
- Produces: `export type VisualiseRoute = { kind: "apply" } | { kind: "card" } | { kind: "refuse"; reason: string };`
- Produces: `routeVisualiseOps(ops: EditOp[], touchedShotIds: string[]): VisualiseRoute`.
- Produces: `export const VISUALISE_REFUSALS = { notes: "The reel's notes and open items change only while the script is being written. Reopen the script to change them.", replace: "Replacing the whole script would lose every panel on the board. Reopen the script to paste a new one." } as const;`

- [ ] **Step 1: Write the failing tests** (one `it` each):
  - `link_avatar` alone → apply; `set_lead` alone → apply; `add_location` + `update_product` → apply.
  - one `update_shot` (touched `["s1"]`) → apply; a doc `set_field` `header.title` (touched `[]`) → apply; `set_watch_outs` → apply.
  - `update_shot` ×2 (touched `["s1","s2"]`) → card.
  - each of `insert_shot`, `remove_shot`, `split_shot`, `move_shot`, `add_cast`, `remove_cast`, `update_cast` alone → card.
  - `link_avatar` + `insert_shot` → card (one request, one outcome).
  - `confirm_item` → refuse with `VISUALISE_REFUSALS.notes`; `set_field` with path `notes.brief` → refuse; `confirm_item` + `link_avatar` → refuse (nothing half done).
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/visualise-edits.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement**: refuse first (any notes op, using `parseFieldPath` + `isDocTarget`), then card (any structural op or `touchedShotIds.length > 1`), else apply.
- [ ] **Step 4: Run** the file — Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): at Visualise a request applies at once, comes as a card, or is refused`.

### Task 3: The Visualise turn

**Files:**
- Modify: `src/lib/scripts/copilot/output.ts`, `messages.ts`, `turn.ts`, `schema.ts`
- Create: `src/lib/scripts/copilot/board-text.ts`
- Test: `src/lib/scripts/copilot/__tests__/visualise-turn.test.ts`, `__tests__/board-text.test.ts`; existing `messages`/`turn` tests unchanged

**Interfaces:**
- Consumes: `routeVisualiseOps`, `VISUALISE_REFUSALS` (Task 2).
- Produces in `output.ts`: `visualiseTurnSchema = editTurnSchema.extend({ picks: z.array(z.object({ shotId: z.string(), version: z.number().int() })), offer: z.enum(["none", "draw", "send", "reopen"]) })`. `editTurnSchema` itself is unchanged.
- Produces in `schema.ts`: two new `messageCardSchema` kinds — `{ kind: "offer", action: "draw" | "send" | "reopen" }` and `{ kind: "picture", url: string, name: string, target: string }` (Task 8 uses the second).
- Produces in `board-text.ts`: `export type BoardFacts = { shots: { id: string; label: string; panel: "ready" | "out_of_date" | "not_yet" | "failed" | "drawing" | "waiting"; versions: number; picked: number | null }[]; castWithoutAvatar: string[]; withoutPicture: string[] }` and `boardText(f: BoardFacts): string` (one line per shot: `S3 (id s3): panel ready, 2 versions, version 2 picked`).
- Produces in `turn.ts`: `TurnInput` gains `stage?: "generate" | "visualise"` and `board?: BoardFacts`; `Reply` gains `picks?: { shotId: string; version: number }[]`, set only at Visualise on the last reply and stripped by the route before saving; `prepareTurn` still returns `Promise<Apply>`.
- Produces in `messages.ts`: `editPrompt(base, i)` accepts optional `i.board?: string`; only when present it adds `section("The storyboard at Visualise", …)` and `section("At Visualise", VISUALISE_RULES)`. `VISUALISE_RULES` (exported constant) tells the model: panels are drawn only by the person (use `offer: "draw"`), sending is the person's (`offer: "send"`), reopening is the person's (`offer: "reopen"`), pick versions with `picks`, never set pictures.

- [ ] **Step 1: Write the failing tests**
  - board-text: `it("writes one line per shot with its panel, versions and pick")` with exact expected text for two shots; `it("lists who has no avatar and what has no picture")`.
  - visualise-turn (fake `call` returning fixed output):
    - `it("sends Generate's edit prompt unchanged when there is no board")`: `editPrompt(base, {…no board})` equals the string produced today (compare to a fixture captured from the current function before editing, saved in the test).
    - `it("uses the Visualise schema and the board at Visualise")`: `call` receives `schema === visualiseTurnSchema` and a user prompt containing "The storyboard at Visualise".
    - `it("applies a one-shot change at once")`: ops `[update_shot s1]` → patch with the new shot, no card.
    - `it("puts an added shot on a card")`: ops `[insert_shot]` → `patch: null`, a pending proposal card.
    - `it("refuses notes with a Reopen offer")`: ops `[confirm_item]` → `patch: null`, reply `VISUALISE_REFUSALS.notes`, card `{ kind: "offer", action: "reopen" }`.
    - `it("refuses a pasted whole script at Visualise")`: `detect` says wholeScript → reply `VISUALISE_REFUSALS.replace`, card offer reopen, `import` never called.
    - `it("carries the model's offer as an offer card")`: output `offer: "draw"`, no ops → reply with card `{ kind: "offer", action: "draw" }`.
    - `it("carries picks on the last reply")`: output picks `[{shotId:"s2",version:1}]` → `result.at(-1).picks` equals it.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/visualise-turn.test.ts src/lib/scripts/copilot/__tests__/board-text.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: capture the fixture first; then `prepareTurn` branches on `input.stage === "visualise"` before the import check (detect still runs; a whole script is refused), and calls a new `prepareVisualiseEdit` that mirrors `prepareEdit` but uses `visualiseTurnSchema`, `boardText(input.board)`, and `routeVisualiseOps` after `applyOps` on the current doc. An offer card is attached only when no proposal card is (a proposal outranks an offer).
- [ ] **Step 4: Run** `npx vitest run src/lib/scripts/copilot` — Expected: PASS, every existing test included.
- [ ] **Step 5: Commit** `feat(copilot): the edit turn at Visualise: the board in the prompt, picks, offers, refusals`.

### Task 4: The routes accept a script at Visualise

**Files:**
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts`, `.../proposals/[messageId]/route.ts`
- Create: `src/lib/scripts/visualise/board-facts.ts`
- Test: the two routes' `route.test.ts` (extend), `src/lib/scripts/visualise/__tests__/board-facts.test.ts`

**Interfaces:**
- Consumes: `changeVisualiseScript` (Task 1), `TurnInput.stage/board` and `Reply.picks` (Task 3).
- Produces: `boardFacts(script: Script, board: VisualiseBoard, now: number): BoardFacts` — built from the same `panelInputs` / `panelView` / `castReadyForPanels` the browser uses; versions numbered by creation order of succeeded takes, starting at 1.

- [ ] **Step 1: Write the failing tests**
  - board-facts: `it("numbers a shot's succeeded takes from 1 and names the picked one")`; `it("leaves out a character on screen in no shot")`.
  - turn route: `it("answers a message at Visualise")` (script stage visualise → 200 stream ending in a `state` line; `prepareTurn` called with `stage: "visualise"` and `board`); `it("still refuses a message In review")` (409 "This script is final…" unchanged wording for in_review/approved); `it("sets a pick only for a succeeded take of that shot")` (picks `[{s1,1},{s2,9}]` → `setPanelPick` called once, for s1's first take); `it("saves through the Visualise write at Visualise")` (`changeVisualiseScript` called, `changeGenerateScript` not).
  - proposals route: `it("accepts a card at Visualise through the Visualise write")`.
- [ ] **Step 2: Run** `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/turn" "src/app/api/clients/[id]/scripts/[scriptId]/proposals" src/lib/scripts/visualise/__tests__/board-facts.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: the turn route allows `generate | visualise`; at Visualise it loads `loadVisualiseBoard` in parallel with the history (rule 5), passes `stage` and `boardFacts(...)`, saves with `changeVisualiseScript`, then applies picks (resolve version → take id from the board it loaded; skip any that miss), strips `picks` before `insertScriptMessages`. The proposals route chooses the write by the stored stage (`visualise` → `changeVisualiseScript`, else as today; import cards stay Generate-only).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): the turn and proposals routes work at Visualise`.

### Task 5: The walk and its waiting line

**Files:**
- Create: `src/lib/scripts/copilot/visualise-walk.ts`
- Modify: `src/lib/scripts/copilot/waiting.ts`
- Test: `src/lib/scripts/copilot/__tests__/visualise-walk.test.ts`, extend `__tests__/waiting.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type WalkInput = { doc: ScriptDoc; avatars: ReadonlyMap<string, Avatar>; views: ReadonlyMap<string, PanelView>; plan: GenerateAllPlan };
  export type VisualiseStep =
    | { kind: "cast"; castId: string; name: string; drawable: number }        // no avatar linked
    | { kind: "finish_avatar"; castId: string; name: string; drawable: number } // linked, not ready to draw
    | { kind: "pictures"; missing: { id: string; kind: "location" | "product"; name: string }[]; plan: GenerateAllPlan }
    | { kind: "draw"; plan: GenerateAllPlan }
    | { kind: "drawing"; count: number }
    | { kind: "send" };
  export function visualiseStep(i: WalkInput): VisualiseStep;
  ```
- Produces: `ScriptWaitingInput`'s visualise arm becomes `{ stage: "visualise"; step: VisualiseStep; pendingCard: boolean; busy: boolean }`.

- [ ] **Step 1: Write the failing tests** (walk), in order of precedence:
  - lead without an avatar comes first, even if another character is listed before; `drawable` = `plan.shotIds.length`.
  - a linked avatar not ready → `finish_avatar`.
  - a character on screen in no shot is never asked about.
  - any shot `generating` → `drawing` with its count (outranks pictures and draw, not cast).
  - a location or product used by a shot in `plan.shotIds` with no picture → `pictures`, listing only those (an unused location is not listed).
  - `plan.shotIds.length > 0` and nothing missing → `draw`.
  - every shot `ready` → `send`.
  - waiting: exact lines from spec §3.6 — `"Waiting for you: choose who plays Meenakshi"`, `"Waiting for you: finish Meenakshi's avatar"`, `"Waiting for you: add the missing pictures"`, `"Waiting for you: draw 6 panels"` (`"draw 1 panel"` for one), `null` while drawing, `"Waiting for you: send the storyboard for client review"`, `"Waiting for you: review the change"` when `pendingCard`, `null` when `busy`. Kinds: cast/finish_avatar/pictures/draw/send → `"task"`; pending → `"change"`. In review and Approved lines unchanged (existing tests).
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/visualise-walk.test.ts src/lib/scripts/copilot/__tests__/waiting.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both, in the order the tests pin: cast → finish_avatar → drawing → pictures → draw → send.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(copilot): the Visualise walk, worked out from the board`.

### Task 6: One workspace for the panel and the board

**Files:**
- Create: `src/components/visualise/visualise-board-context.tsx` (provider + `useVisualiseBoardActions()`), `src/components/visualise/visualise-copilot-workspace.tsx`
- Modify: `src/components/visualise/visualise-view.tsx` (take draws, panel model and assets from the context instead of creating them), `src/app/clients/[id]/scripts/[scriptId]/page.tsx`, `src/components/scripts/generate/copilot-chat.tsx` (fold default), `src/hooks/queries/script-generate.ts`
- Test: `src/components/visualise/__tests__/visualise-copilot-workspace.test.tsx`; existing visualise-view tests pass (wrap them in the provider)

**Interfaces:**
- Produces: `VisualiseBoardActions = { panelModelId: string; setPanelModelId(id: string): void; draws: ReturnType<typeof usePanelDraws>; model: ReturnType<typeof useVisualiseModel>; data: BoardData }`. `VisualiseBoardProvider({ clientId, initial, children })` owns `useVisualiseBoard`, the panel model state, `usePanelDraws`, `useVisualiseModel`, and wraps children in `ScriptAssetsProvider`.
- Produces: `VisualiseCopilotWorkspace({ client: {id,name,slug}, initialState: GenerateState, initialBoard: BoardData, initialReview, children? })` — renders the grid: `CopilotChat` (live at Visualise, read-only In review) then the board (`TeamReviewBoard`).
- `useSendTurn` and `useResolveProposal` invalidate `visualiseKeys.board(clientId, scriptId)` on success when the returned state's stage is not `generate`.
- `CopilotChat`: `foldedByDefault = stage !== "generate" && stage !== "visualise"`; `narrow = "stacked"` at Generate and Visualise.

- [ ] **Step 1: Write the failing tests**
  - `it("gives the panel a message box at Visualise")`: workspace with stage visualise → markup contains `<textarea` and not `aria-label="Show copilot"`.
  - `it("keeps the panel read-only and folded In review")`: stage in_review → no `<textarea`, contains `aria-label="Show copilot"`.
  - `it("draws the board from the same provider the panel uses")`: a child calling `useVisualiseBoardActions()` sees `data.script.id === "s1"` (provider throws outside it: `it("asks for the provider")`).
- [ ] **Step 2: Run** `npx vitest run src/components/visualise` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement**: the page, at Visualise and In review, loads `loadGenerateState` in the same `Promise.all` instead of `listScriptMessages` + `listCopilotAvatars`, and renders the workspace; Approved keeps today's read-only panel. `VisualiseView` reads everything it used to create from the context.
- [ ] **Step 4: Run** `npx vitest run src/components src/app/clients` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visualise): one workspace owns the board, the draws and the copilot's thread`.

### Task 7: The step card and the offer card

**Files:**
- Create: `src/components/visualise/copilot-step-card.tsx`, `src/components/visualise/copilot-offer-card.tsx`, `src/components/visualise/copilot-send-card.tsx`
- Modify: `src/components/scripts/generate/copilot-chat.tsx` (a `footer` slot rendered after the messages), `copilot-chat-message.tsx` (renders `offer` cards through an optional `renderOffer` in `ChatActions`)
- Test: `src/components/visualise/__tests__/copilot-step-card.test.tsx`, `__tests__/copilot-send-card.test.tsx`

**Interfaces:**
- Consumes: `visualiseStep` (Task 5), `useVisualiseBoardActions` (Task 6), `useLinkCast`, `ShareDialog` (`moving`), `ReopenDialog`, `generateAllLabel`.
- Produces: `CopilotStepCard({ step, avatars })`; `CopilotSendCard({ missing: string[] })`; `sendMissing(i: WalkInput & { pendingCard: boolean }): string[]` (pure, in `visualise-walk.ts`), lines: `"2 shots have no panel; the client will see them as text only."`, `"1 panel is still being drawn."`, `"Meenakshi has no avatar."`, `"A change is still waiting for you in the chat."`.
- Behaviour: cast step → "Who plays {name}?" with one Button per ready avatar (face + name) calling `useLinkCast`; when `drawable > 0` a secondary Button `"Draw the {n} panels I can draw now"`. finish_avatar → sentence + Button "Show {name} on the board" (scrolls to `cast:{castId}`). pictures → the sentence from spec §3.2, then per item "Attach a picture" (Task 8 preset) and, for a location, "Draw it" (`assets.generatePlate`) / for a product, "Pick on the board" (scrolls to `product:{id}`); then Button `"Draw {n} panels without them"`. draw → Button `generateAllLabel(plan)` calling `draws.drawAll(plan.shotIds)`. drawing → "Drawing {n} panels…" no Button. send → `CopilotSendCard` with `sendMissing` lines and the existing `ShareDialog moving` as its trigger. Offer cards: draw → the same draw Button when the walk's plan has shots, else "Every panel is drawn."; send → `CopilotSendCard`; reopen → `ReopenDialog`. Any offer card is read-only (text only) once the stage is not Visualise.

- [ ] **Step 1: Write the failing tests** (static markup, provider mocked):
  - cast step shows "Who plays Meenakshi?" and one button per ready avatar; with `drawable: 4` also "Draw the 4 panels I can draw now".
  - pictures step shows "The café and the bottle have no picture." and "Draw 6 panels without them".
  - draw step shows `generateAllLabel(plan)` exactly.
  - drawing step shows "Drawing 6 panels…" and no `<button`.
  - send card lists each `sendMissing` line and the Share trigger; with none, shows "Nothing is missing."
  - `sendMissing` unit tests for each line and singular/plural.
- [ ] **Step 2: Run** `npx vitest run src/components/visualise src/lib/scripts/copilot/__tests__/visualise-walk.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**. The step card renders in `CopilotChat`'s footer only at Visualise and only while not busy. The workspace computes the step once per render from `model` and passes `scriptWaiting({ stage: "visualise", step, pendingCard, busy })` as the panel's `waiting`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visualise): the copilot's step card, offers and send card`.

### Task 8: Pictures in the chat

**Files:**
- Create: `src/lib/scripts/copilot/picture-target.ts`, `src/components/visualise/copilot-picture-composer.tsx`
- Modify: `src/components/scripts/generate/copilot-composer.tsx` (optional `attach` slot), turn route (accepts `picture`), `src/lib/scripts/copilot/turn.ts` (a text-less picture turn makes no model call), `src/services/script-generate.service.ts` (`TurnMessage.picture?`)
- Test: `src/lib/scripts/copilot/__tests__/picture-target.test.ts`, extend turn route test, `src/components/visualise/__tests__/copilot-picture-composer.test.tsx`

**Interfaces:**
- Produces: `pictureTarget(doc: ScriptDoc, text: string, preset: string | null): { target: string } | { ask: { id: string; name: string }[] } | { none: true }` where targets are `location:{id}` / `product:{id}`. Order: preset → the only item without a picture → the only item whose name appears in the text (case-insensitive, whole word) → ask (all products and locations) → none when there are none.
- Turn body gains `picture?: { url: string; name: string; target: string }`; the route saves the user message with card `{ kind: "picture", url, name, target }`; with empty text the reply is code-written `"Added it to {item name}."` and no model is called.
- `CopilotPictureComposer` holds the chosen file; on Send it resolves `pictureTarget`; on `ask` it shows one Button per item ("Which is this for?"); then `assets.upload([file], target)` (same upload as the board, script folder) and sends the turn with `picture`.

- [ ] **Step 1: Write the failing tests**: each precedence rule of `pictureTarget`; "none" with no products or locations; route: `it("records a picture with its target and answers without the model")`; composer markup shows the Attach button at Visualise and, given an `ask`, "Which is this for?" with the item names.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/picture-target.test.ts src/components/visualise "src/app/api/clients/[id]/scripts/[scriptId]/turn"` — Expected: FAIL.
- [ ] **Step 3: Implement**. `CopilotChatMessage` renders a `picture` card as a thumbnail with "for {name}".
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visualise): a picture attached in the chat goes onto its product or location`.

### Task 9: The page shows the copilot's work

**Files:**
- Create: `src/lib/scripts/copilot/changed-targets.ts`, `src/components/visualise/script-follow-context.tsx`
- Modify: `visualise-copilot-workspace.tsx` (provider), `board-chips.tsx` and `cast-chip.tsx`/`asset-chip.tsx` callers, `panel-tile.tsx` caller in `visualise-view.tsx` (wrap in `CopilotTarget`), `useSendTurn`/`useResolveProposal` callers (report landed targets)
- Test: `src/lib/scripts/copilot/__tests__/changed-targets.test.ts`, `src/components/visualise/__tests__/script-follow-context.test.tsx`

**Interfaces:**
- Produces: `changedTargets(before: ScriptDoc, after: ScriptDoc): string[]` — ids `cast:{id}` (avatarId, name, description or lead changed), `location:{id}` / `product:{id}` (added or changed), `shot:{id}` (added or changed). Removed items produce nothing.
- Produces: `ScriptFollowProvider` + `useScriptFollow(): { stateOf(target: string): TargetState; land(targets: string[]): void }` reusing `addLanded` / `pruneLanded` / `LANDED_MS` from `use-follow-copilot.ts`; `asking` is the walk step's target (`cast:{castId}` for cast/finish_avatar), `writing` is always false *(spec §3.8 call)*.
- The workspace calls `land(changedTargets(beforeDoc, afterDoc))` after a turn or an accepted card at Visualise, and after a picture upload (`location:`/`product:` target). The first landed target is scrolled into view (`[data-copilot-target]`).

- [ ] **Step 1: Write the failing tests**: `changedTargets` for an avatar link, a new shot, a renamed location, a removed product (nothing); provider: `stateOf("cast:c1").asking` is true while the step is a cast step for c1; after `land(["shot:s2"])`, `stateOf("shot:s2").landed` is a number.
- [ ] **Step 2: Run** `npx vitest run src/lib/scripts/copilot/__tests__/changed-targets.test.ts src/components/visualise` — Expected: FAIL.
- [ ] **Step 3: Implement**. One provider for the screen; each target's state is a Map lookup (rule 2).
- [ ] **Step 4: Run** `npx vitest run src/components src/lib/scripts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(visualise): the board shows what the copilot asks about and changes`.

### Task 10: Records

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, CRLF, append), `docs/qa/2026-11-18-copilot-journey-manual-qa.md` (section 10 before "Known limits"), `docs/superpowers/specs/2026-11-20-copilot-visualise-design.md` (status line), `docs/superpowers/specs/2026-11-19-copilot-journey-RESUME-HERE.md`, this plan (Outcome section)

- [ ] **Step 1:** Append ADRs: **D524** the copilot acts at Visualise as an extension of the writing copilot (Rejected: a separate Visualise agent); **D525** at once / card / refused at Visualise, and the copilot's shot cards relax D489 (second) for its cards only; **D526** the walk is code, read fresh, pictures before drawing, send always offered with what is missing; **D527** pictures attached in a script's chat stay with the script (Refines parent spec §8 item 1).
- [ ] **Step 2:** QA section 10: one check per success-story beat (spec §8) plus each Review Focus line.
- [ ] **Step 3:** Run the full suite `npx vitest run > .superpowers/sdd/full.txt 2>&1; tail -n 30 .superpowers/sdd/full.txt` and `npx tsc --noEmit` — Expected: only the known failures (the `composite-generate` and `image-generate` "refuses a deprecated model" tests; tsc at `image-generate/route.test.ts(56,12)`).
- [ ] **Step 4: Commit** `docs(copilot): 5.1 built: D524–D527, QA section 10, resume-here`.


## Outcome (built 2026-11-20)

Built as D524–D527 in ten tasks, `580fc112..0ae343b9`, inline, test first. No migration. Full suite after the fix pass: 6039 passed, only the two known deprecated-model tests fail (before it, five files had timed out under the full parallel run and passed alone: the known flake). tsc: only the known `image-generate/route.test.ts(56,12)`.

**Final review** (one fresh reviewer): no Critical, five Important; all five Review Focus lines held. One minor was re-graded Important (an old Generate card could change the notes at Visualise). All six fixed in one pass, each with a test that failed first:

- I1 "Draw the N panels I can draw now" always disabled — "offers the shots it can already draw as a working button" RED→GREEN
- I2 landed target re-mounted again after the fade — "keeps a target's version once its highlight has faded" RED→GREEN
- I3 a picture sent with words not told to the model — "tells the copilot about a picture sent with words, and saves the words as typed" RED→GREEN
- I4 two characters given the same avatar — "refuses giving a character an avatar another character already has" RED→GREEN (proven by disabling the check) + "does not offer an avatar another character already has" RED→GREEN
- I5 "Copilot is asking" In review — "asks about a cast slot only at Visualise" RED→GREEN
- (re-graded) an old Generate card's notes change accepted at Visualise — "does not apply an old card's notes change when it is accepted at Visualise" RED→GREEN

**Rulings made while building** (each: what, why, cost if wrong):

- ChangeIO.save takes (current, patch) instead of (version, patch); the existing tests' save mocks were adapted to read current.docVersion (same assertions) — the Visualise save needs updated_at, which only the read script carries — cost if wrong: none outside change.ts' two callers
- the Visualise model call is named "script_visualise_edit" (not "script_edit") — keeps Generate's call name and any per-name handling untouched — cost if wrong: none
- a character's card (update_cast/remove_cast) shows every shot the character is on screen in, not only touched shots — the proposal card shows shots only, and a rename would otherwise show an empty before/after — cost if wrong: a busier card
- the notes refusal is checked before the edits are applied — an unknown confirm id would otherwise answer "couldn't make that change" instead of the reopen refusal — cost if wrong: none
- conversation.ts gained lines for the two new card kinds (tsc exhaustiveness) — cost if wrong: none
- boardFacts lives in src/lib/scripts/visualise/board-facts.ts with a resolvePicks helper (pure, tested) — the route only calls setPanelPick for resolved takes — cost if wrong: none
- the turn route reads the board via getScript + loadVisualiseBoard in parallel with the history (one extra read at Visualise only) — loadVisualiseBoard takes a Script, not a GenerateScript — cost if wrong: one extra query per Visualise turn
- an accepted card at Visualise replies "Applied: …" without the open-items line (added test) — the script is final, so "still open before Final" would mislead — cost if wrong: none
- page.tsx shows no waiting line at Visualise until Task 6 wires the walk (tsc needs the step) — same branch, unmerged — cost if wrong: none once Task 6 lands
- the panel component is its own file (visualise-copilot.tsx), the workspace only lays out — one component per file (docs/component-structure.md) — cost if wrong: none
- the walk's waiting line is wired here (plan put it in Task 7) — the rail would otherwise be blank at Visualise between tasks — cost if wrong: none
- at Visualise suggestionsFor returns the copilot's own chips from its last reply (existing "offers nothing once the script has left Generate" test updated) — the message box is back and its chips are part of it — cost if wrong: a chip the model writes at Visualise shows
- the board-refresh-after-turn logic is an exported pure helper landGenerateState (tested), used by useSendTurn and every useStateWrite — cost if wrong: one extra board read after a Generate→… write past Generate (none at Generate)
- TeamReviewBoard now needs VisualiseBoardProvider; its test wraps it — the only other mount is the page, which provides it — cost if wrong: none
- the stage shown by the Visualise panel is the board query's (fresher after a move to review), not the thread cache's (same stale-cache lesson as D523's review fix) — cost if wrong: none
- every draw button in the chat is the board's GenerateAllDialog (new optional label/size props), so drawing from the chat asks the same credit confirmation as the page — a chat button must not be a quicker way to spend — cost if wrong: one extra click
- the send card's button is the page's ShareDialog trigger, reading "Move to In review" as on the page (not "Send for client review") — same action, same words; the card's eyebrow says "Send for client review" — cost if wrong: wording
- "Draw it" for a location shows no credits — the board's own location button shows none either — cost if wrong: a missing price on one paid button (as on the page)
- an offer card after Visualise (no renderOffer) is a one-line note ("Offered to draw the panels") — read-only, as D523's cards — cost if wrong: none
- pictureTarget checks the item the message names before "the only item without a picture" (plan listed the opposite order) — an explicit name ("this is the bottle") should win over a guess from the board — cost if wrong: none; both are the spec's "the message or the board makes it clear"
- the route checks the picture's url is the item's current picture in the stored doc (rule 14), so a body cannot attach a foreign url; "refuses a picture that is not on the script" passed before the change too (an empty text was already a 400) — it pins the guard, not a RED — cost if wrong: none
- the composer uploads with useUploadScriptImage directly (not ScriptAssets.upload, which swallows errors and returns nothing) so it can read the new picture's url from the written doc — same service, same folder — cost if wrong: none
- the step card's "Attach a picture" opens the composer's picker through a counter-stamped request prop — cost if wrong: a browser that refuses a programmatic picker open after the click would need a second click
- the follow state is tested through a pure targetState(target, asking, landed) plus FollowTarget's no-provider render — a static render cannot call land() then re-render — cost if wrong: the provider's wiring is covered by review, not a test
- a cast button pressed on the step card (the person's click in the chat) also lands its cast slot — it is the chat changing the board — cost if wrong: an extra highlight
- FollowTarget renders plain children outside the Visualise screen, so BoardChips/PanelTile stay unchanged elsewhere — cost if wrong: none

**Deferred minors** (from the final review):

- step card shows the old step for one round trip after a turn (board only invalidated, not written)
- a newly added shot is not scrolled to (show-on-board looks before the refetch); show-on-board ignores reduced motion and duplicates use-follow-copilot's scrollToTarget
- picks dropped silently when the same turn becomes a card or goes stale
- a failed setPanelPick reports "nothing was changed" after the doc was saved
- an old pending import card from Generate gets a live Accept at Visualise that answers 409
- cast buttons list status-ready avatars, not castReadyForPanels (four views); list only as fresh as the last thread read
- sendMissing says "X has no avatar" when X has one that is not ready
- composer clears typed words on the "nothing to attach to" toast and on a failed upload
- PictureTargetChoice buttons not disabled while uploading (double click uploads twice)
- picture body parsed twice; a malformed picture with text is dropped silently
- extra script reads (page loadGenerateState re-reads the row; turn route getGenerateScript + getScript)
- FollowTarget adds wrapper divs around chips and tiles — check layout in the browser
- test gaps — composer "none" path, provider wiring
