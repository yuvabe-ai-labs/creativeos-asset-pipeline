# Delete a Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every card in a client's Scripts library can delete its script for good. Delete is refused,
with a reason, when a canvas was started from the script, when it has been shared with the client,
or while a panel is being drawn.

**Architecture:**
- One Postgres function (`delete_client_script`, migration 0057) does everything in one
  transaction: it locks the script row, runs the three checks in order, then hard-deletes. Existing
  `ON DELETE CASCADE`s take the chat, takes, picks, generations and review rows with it.
- The library page loads each script's standing block once for the whole screen, so the card can
  show the reason on click without asking the server. The server re-checks on every delete.
- Panel image files in storage are never touched.

**Tech Stack:** Next.js route handlers, Supabase (service-role client, `rpc`), TanStack Query,
shadcn/Base UI `AlertDialog`, vitest (`renderToStaticMarkup` for components).

**Spec:** `docs/superpowers/specs/2026-10-19-delete-script-design.md`

## Global Constraints

- Blocks are checked in this order, and the first that applies wins:
  1. `has_canvas`
  2. `shared`
  3. `drawing`
- `has_canvas` = a row in `canvases` with `source_script_id` = the script.
- `shared` = a `script_reviews` row for the script, whether or not a version was ever shared.
- `drawing` = a `script_panel_takes` row with `status = 'running'` and `created_at > now() - interval '5 minutes'`. That is the panel route's `maxDuration = 300`; an older running take is dead.
- Exact copy, defined once in `src/lib/scripts/constants.ts` and used by the route and the card:
  - `has_canvas`: "A canvas was started from this script, so it can't be deleted."
  - `shared`: "This script has been shared with the client, so it can't be deleted."
  - `drawing`: "A panel is still being drawn. Try again when it finishes."
  - Confirm title: "Delete this script?"
  - Confirm description: "The brief, the copilot conversation and the storyboard go with it. This can't be undone."
  - Blocked dialog title: "This script can't be deleted"
- **Never delete storage objects.** No `removeObject` anywhere in this change.
- **Hard delete.** `archived_at` stays in place for rows D360 already hid. An already-archived script counts as not found.
- Every query filters on `client_id` as well as the script id (`src/lib/db/scripts.ts:8-9`).
- **Controls:** shadcn primitives only (`Button`, `AlertDialog*`). Lucide `Trash2` with `strokeWidth={1.5}`.
- **ADR:** D384. D380–D383 are reserved by the unmerged `storyboard-to-canvas` branch.
- **Migration number:** 0057. No branch uses it.

## Review Focus

1. **A canvas is started, or a share made, while a delete runs.** The function locks the script row
   `FOR UPDATE`. A concurrent `canvases` or `script_reviews` insert takes `FOR KEY SHARE` on the same
   row for its foreign-key check, so the two queue behind each other. The result is never "script
   gone, canvas unlinked". Pinned by the SQL in Task 1 (lock before checks), and by a note in the ADR.
2. **A stale page: the card thought the script was deletable, but it isn't now.** The server's 409
   carries the reason's copy, and the card shows it as an error toast. Pinned in Task 2's route test
   and Task 3's `deleteDialogCopy` test.
3. **A crashed draw left a `running` take forever.** After 5 minutes it no longer blocks. Pinned in
   Task 1's SQL (`interval '5 minutes'`) and checked in the manual SQL step.
4. **A malformed or foreign script id.** `deleteScript` returns `not_found` without calling the
   database for a non-UUID. The function matches on `client_id`, so another client's script is
   `not_found` (404). Pinned in Task 1's and Task 2's tests.
5. **A failed read of the blocks on page load.** The page must still render. Every card then falls
   back to "deletable" in the UI, and the server still refuses correctly. Pinned in Task 1's
   `listScriptDeleteBlocks` test (it returns `{}` and logs on error, like `listFeedbackCounts`).

---

### Task 1: The delete function, the block reader and the copy

**Files:**
- Create: `supabase/migrations/0057_delete_client_script.sql`
- Modify: `src/lib/scripts/constants.ts` (append)
- Modify: `src/lib/db/scripts.ts` (append two functions)
- Modify: `src/lib/db/script-generate.ts:134-150` (remove `archiveUnwrittenScript`) and `src/lib/db/script-generate.test.ts:8,81-102` (remove its tests and import)
- Test: `src/lib/db/scripts.delete.test.ts` (new)

**Interfaces:**
- Produces (constants.ts):
  - `export const SCRIPT_DELETE_BLOCKS = ["has_canvas", "shared", "drawing"] as const;`
  - `export type ScriptDeleteBlock = (typeof SCRIPT_DELETE_BLOCKS)[number];`
  - `export const SCRIPT_DELETE_BLOCKED: Record<ScriptDeleteBlock, string>`, using the Global Constraints copy.
- Produces (db/scripts.ts):
  - `export type ScriptDeleteResult = "deleted" | "not_found" | ScriptDeleteBlock;`
  - `export async function deleteScript(clientId: string, scriptId: string): Promise<ScriptDeleteResult>`
  - `export async function listScriptDeleteBlocks(clientId: string): Promise<Record<string, Exclude<ScriptDeleteBlock, "drawing">>>`. It returns per-script blocks for the library: `has_canvas` takes precedence over `shared`. `drawing` is not loaded; it is short-lived, and the server reports it.

- [ ] **Step 1: Write the migration** `0057_delete_client_script.sql`.
  - Header comment cites D384 and the spec, in the style of `0056`'s header.
  - Signature: `create or replace function delete_client_script(p_client_id uuid, p_script_id uuid) returns text language plpgsql`.
  - Body, in order. Each status is returned as the text shown:
    1. `select id ... from client_scripts where id = p_script_id and client_id = p_client_id and archived_at is null for update`. If no row is found, return `'not_found'`.
    2. If a row exists in `canvases where source_script_id = p_script_id`, return `'has_canvas'`.
    3. If a row exists in `script_reviews where script_id = p_script_id`, return `'shared'`.
    4. If a row exists in `script_panel_takes where script_id = p_script_id and status = 'running' and created_at > now() - interval '5 minutes'`, return `'drawing'`.
    5. `delete from client_scripts where id = p_script_id`, then return `'deleted'`.
  - Comment above the lock: it serialises with the foreign-key `FOR KEY SHARE` taken by a concurrent canvas, review or take insert (Review Focus 1).
  - Comment that storage files are kept on purpose (spec §3 "What is kept").

- [ ] **Step 2: Write the failing tests** in `src/lib/db/scripts.delete.test.ts`. Mock `@/lib/supabase/server` as `createServerSupabase: () => ({ rpc: mockRpc, from: mockFrom })` and `server-only`. Tests:
  - `deleteScript` calls `rpc("delete_client_script", { p_client_id: "c1", p_script_id: SCRIPT_ID })` and returns each of `"deleted" | "not_found" | "has_canvas" | "shared" | "drawing"` as the RPC returns it (`it.each`).
  - `deleteScript("c1", "not-a-uuid")` resolves `"not_found"`, and `mockRpc` is not called.
  - `deleteScript` throws when the RPC returns an `error`, and when it returns an unknown string such as `"weird"`. The message contains `Unexpected delete result`.
  - `listScriptDeleteBlocks("c1")`, with two `from` reads:
    - `canvases` (`select("source_script_id")`, `eq("client_id","c1")`, `not("source_script_id","is",null)`) resolving `[{ source_script_id: "a" }]`.
    - `script_reviews` (`select("script_id")`, `eq("client_id","c1")`) resolving `[{ script_id: "a" }, { script_id: "b" }]`.
    - It returns `{ a: "has_canvas", b: "shared" }`.
  - `listScriptDeleteBlocks` returns `{}` and does not throw when either read errors (Review Focus 5).

- [ ] **Step 3: Run it to confirm it fails.** Run `npx vitest run src/lib/db/scripts.delete.test.ts`. Expected: FAIL (`deleteScript` is not exported).

- [ ] **Step 4: Implement** the constants and the two functions.
  - Guard non-UUIDs with `isUuid` (already imported in `scripts.ts`).
  - `listScriptDeleteBlocks` runs its two reads with `Promise.all` (performance rule 5), and logs with `console.error("[scripts] could not read the library's delete blocks", e)`.
  - Remove `archiveUnwrittenScript` and its tests. Its only caller is the route, which Task 2 rewrites.

- [ ] **Step 5: Run the tests.** Run `npx vitest run src/lib/db/scripts.delete.test.ts src/lib/db/script-generate.test.ts`. Expected: PASS. `npx tsc --noEmit` fails only at `route.ts` (it still imports `archiveUnwrittenScript`); Task 2 fixes that.

- [ ] **Step 6: Commit.** Do not commit the route break on its own. Fold Task 1 into Task 2's commit, or run Task 2 immediately and commit both together:
  `feat(scripts): a script can be deleted for good, unless a canvas, the client or a running draw depends on it (D384)`

### Task 2: The DELETE route

**Files:**
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/route.ts:4,26-38`
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/route.delete.test.ts` (rewrite the mocks and cases)
- Modify: `src/services/script-generate.service.ts:25` and `src/hooks/queries/script-generate.ts:87` (doc comments only: delete now covers every script)

**Interfaces:**
- Consumes: `deleteScript` and `SCRIPT_DELETE_BLOCKED` from Task 1.
- Produces: `DELETE /api/clients/:id/scripts/:scriptId`:
  - `200 { ok: true }` on deleted
  - `404 "Script not found."`
  - `409 SCRIPT_DELETE_BLOCKED[block]` for each block
  - The browser's `readJson` already throws with the error string, so the card can toast it.

- [ ] **Step 1: Rewrite the tests.** Mock `@/lib/db/scripts` with `{ getScript, deleteScript }` and drop the `script-generate` mock. Cases:
  - `deleted` returns 200, with `deleteScript` called with `("c1", SCRIPT_ID)`.
  - `it.each(["has_canvas","shared","drawing"])` returns 409, with `error` equal to `SCRIPT_DELETE_BLOCKED[block]`.
  - `not_found` returns 404.

- [ ] **Step 2: Run them to confirm they fail.** Run `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/route.delete.test.ts"`. Expected: FAIL.

- [ ] **Step 3: Rewrite `DELETE`** to call `deleteScript` once and map the result. Keep `withClient` and `withTryCatch("Could not delete the script.", …)`. The comment above it cites D384 and replaces the D360 text.

- [ ] **Step 4: Verify.** The route test passes, `npx tsc --noEmit` is clean, and the `scripts.delete` and `script-generate` tests still pass.

- [ ] **Step 5: Commit** Tasks 1 and 2 together with the message from Task 1, Step 6.

### Task 3: Every card offers delete, and explains a block

**Files:**
- Create: `src/components/scripts/delete-script-copy.ts`
- Modify: `src/components/scripts/delete-script-button.tsx`
- Modify: `src/components/scripts/script-card.tsx`
- Modify: `src/components/scripts/scripts-library.tsx:18-25,80-82`
- Modify: `src/app/clients/[id]/scripts/(library)/page.tsx:22-24,37`
- Test: `src/components/scripts/__tests__/delete-script-copy.test.ts`, `src/components/scripts/__tests__/script-card.test.tsx`

**Interfaces:**
- Consumes: `listScriptDeleteBlocks` and `ScriptDeleteBlock` / `SCRIPT_DELETE_BLOCKED` from Task 1.
- Produces:
  - `export function deleteDialogCopy(block: ScriptDeleteBlock | null): { canDelete: boolean; title: string; description: string }`
  - `DeleteScriptButton` gains the prop `block?: ScriptDeleteBlock | null`
  - `ScriptCard` gains the props `clientId: string` and `deleteBlock?: ScriptDeleteBlock | null`
  - `ScriptsLibrary` gains the prop `deleteBlocks?: Record<string, ScriptDeleteBlock>`

- [ ] **Step 1: Write the failing tests.**
  - `deleteDialogCopy(null)` returns `{ canDelete: true, title: "Delete this script?", description: "The brief, the copilot conversation and the storyboard go with it. This can't be undone." }`.
  - `deleteDialogCopy(b)`, for each block, returns `{ canDelete: false, title: "This script can't be deleted", description: SCRIPT_DELETE_BLOCKED[b] }`.
  - `script-card.test.tsx`:
    - Mock `../delete-script-button` with a stub that renders `<span data-delete-block={String(block ?? "none")} />`.
    - `renderToStaticMarkup(<ScriptCard clientId="c1" script={…} href="/x" deleteBlock="shared" />)` contains `href="/x"`, contains `data-delete-block="shared"`, and the stub is **not** inside the `<a>`, so a button never nests in a link.
    - Build the `script` from an existing fixture: `reel01Doc()` from `@/lib/scripts/copilot/__tests__/route-mocks`, or the fixture `script-view.test.tsx` uses.

- [ ] **Step 2: Run them to confirm they fail.** Run `npx vitest run src/components/scripts/__tests__/delete-script-copy.test.ts src/components/scripts/__tests__/script-card.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `DeleteScriptButton` takes its title and description from `deleteDialogCopy(block ?? null)`. The trigger is unchanged, and stays clickable when blocked (spec §6).
    - When `canDelete` is false, the footer has only `AlertDialogCancel` labelled "Got it".
    - Otherwise it keeps Cancel and the destructive Delete. `onError` already toasts the server's message, which covers a stale page (Review Focus 2).
    - Update the component's doc comment to D384.
  - `ScriptCard` copies `ScriptUnwrittenCard`'s structure:
    - The outer element becomes a `relative` `div` with the current card classes. Swap `focus-visible:ring-*` for `has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring`.
    - The title becomes the `Link`, with `after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none`.
    - `DeleteScriptButton` sits in the footer row next to `ClientFeedbackCount`, with `className="relative z-10 -my-1 shrink-0"`.
  - `ScriptsLibrary` passes `clientId` and `deleteBlock={deleteBlocks?.[s.id] ?? null}` to each `ScriptCard`. Unwritten cards never have a block, so they need no change beyond the shared copy.
  - `page.tsx` adds `listScriptDeleteBlocks(client.id)` as a fourth entry in the existing `Promise.all`, and passes `deleteBlocks`.

- [ ] **Step 4: Verify.**
  - Both new tests pass.
  - `npx vitest run src/components/scripts` passes.
  - `npx tsc --noEmit` is clean.
  - `npx eslint` on the changed files is clean.

- [ ] **Step 5: Commit**: `feat(scripts): every card in the library offers delete, and says why when it can't (D384)`

### Task 4: ADR, full verification, migration hand-off

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`. Append D384 after D379, and add one line to D360: `**Superseded by →** D384.`

- [ ] **Step 1: Append D384** in the log's format: Decision / Why / Rejected / Supersedes / Originated.
  - **Decision:** hard delete from any library card. It is blocked when there is a canvas, a client link or a draw under 5 minutes old, in that order. Storage files are kept. Messages are shown on click.
  - **Why:** the user, 19 Oct: "delete script … should delete related assets like storyboards … nothing else"; "if a script has a canvas don't allow delete"; "block that one too" (client link); "for good".
  - **Rejected:**
    - Looking inside canvases for dragged copies: the cost grows with nodes, and the user picked the single check.
    - Deleting panel files: canvases reference them directly.
    - Letting a mid-draw delete proceed: it would refund a draw the provider was already paid for.
    - Archive only: the user chose "for good".
  - **Originated →** `2026-10-19-delete-script-design.md`.

- [ ] **Step 2: Full verification.**
  - `npx vitest run` passes. If the Kling test times out, re-run it once (known flake).
  - `npx tsc --noEmit` is clean.
  - `npx eslint` on every changed file is clean.

- [ ] **Step 3: Commit**: `docs(adr): D384 a script is deleted for good unless a canvas, the client or a running draw depends on it`

- [ ] **Step 4: Hand off the migration.** `0057` is **not** applied by the executor (it's a shared staging database). Report it as owed, together with the click-through:
  1. Delete a never-shared draft.
  2. Click delete on an approved script with a canvas, and check the canvas message.
  3. Click delete on an in-review shared script, and check the shared message.
  4. Check that a canvas showing that script's panels still shows them after a delete.
