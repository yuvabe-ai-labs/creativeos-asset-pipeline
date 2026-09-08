# Handle Performance Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revised 2026-09-08** for the handle-driven model (D252/D253). Tasks 1–3 are **already built and committed** on `worktree-handle-performance`; Tasks 4–11 are the remaining work. The original single-handle plan is recoverable from history at commit `1484013b`.

**Goal:** A fourth Market tab, **Performance**, containing one sub-tab per tracked Instagram handle, each fed by a daily Apify snapshot pipeline we own (D235, D237, D252, D253).

**Architecture:** `tracked_handles` is the enrolment list. A Trigger.dev scheduled task calls `apify/instagram-scraper` (`resultsType: "details"`, sync endpoint) daily for every tracked handle, normalizes the payload through a pure module, and writes `account_snapshots` (time series + raw payload) and `tracked_posts` (latest metrics, upserted by shortcode, GCS-re-hosted thumbnails). `withClient` routes serve the handle list, one handle's payload, and an on-demand refresh with a per-handle 1-hour guard.

**Tech Stack:** Next.js (this repo's version — read `node_modules/next/dist/docs/` before route work), Supabase (service-role via `createServerSupabase`), Trigger.dev v4 (`schedules.task` from `@trigger.dev/sdk`), Vitest, shadcn/Base UI primitives, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-03-handle-performance-design.md` (decisions D235–D238, D252–D253 in `2026-05-30-creativeos-staging-roadmap.md` §7).

**Design reference:** published artifact **"Market Performance Tab"** — https://claude.ai/code/artifact/33673014-d44a-4945-b9e2-fe507d79a26a. Follow it for hierarchy, not pixel-for-pixel.

## Global Constraints

- Work continues in the existing worktree `.claude/worktrees/handle-performance`. **`npm install` has been run there — never junction/symlink `node_modules`** (Turbopack rejects the symlink).
- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI — `render` prop, not `asChild`). Never a raw `<button>`/`<input>`/`<select>`. Field + affordance combinations use `input-group.tsx`.
- API routes use `apiError(message, status)` / `apiOk(data)` / `withClient(req, params, handler)` / `withTryCatch(fallbackMessage, handler)` from `src/lib/api/route-helpers.ts` — never `NextResponse.json` directly.
- Design system: purple `#5829c7` scarce, drive colors through the shadcn CSS variables in `globals.css`, `shadow-card` for resting cards, Lucide icons at 1.5 stroke, easing `cubic-bezier(0.22,1,0.36,1)`.
- One component per file, named exports, split at ~200 lines, no prop drilling (`docs/component-structure.md`).
- Import, don't redefine: `uploadMarketThumbnail` from `@/lib/storage`, `THUMBNAIL_SIZE_LIMIT` from `@/lib/market/constants`, `authFetch` from `@/lib/supabase/session-ready`, `getBrandDetails` from `@/lib/db/brand-kit` (prefill only).
- Trigger task files: `@/lib` imports must be **dynamic** (`await import(...)`) because those modules carry `import "server-only"`. Import the SDK from `@trigger.dev/sdk` — **not** `@trigger.dev/sdk/v3`, which the installed SDK's own authoring skill calls a deprecated alias.
- `APIFY_TOKEN` env var: never commit it; it goes in `.env.local` (dev) and the Trigger.dev project env (deployed). **Not currently set in this worktree** — live verification steps are blocked until it is.
- Vitest timeouts on first cold run can be flakes (see kling-test-flake memory) — re-run before investigating.
- Commit after every green test cycle. End commit messages with the Claude Code trailer.

---

## Already built (Tasks 1–3)

- [x] **Task 1 — Migration `0038_handle_performance.sql`.** Creates `tracked_handles`, `account_snapshots`, `tracked_posts`; three indexes; default-deny RLS on all three. Renumbered from the original 0035 (staging took 0035–0037 for review annotations). **Not yet applied to any database.**
- [x] **Task 2 — `src/lib/market/performance.ts` + tests.** `parseInstagramHandle`, `normalizeProfileItem`, `computeStats`, `postMultiplier`. 14 tests green against the real spike fixture. Unchanged by D252/D253 — it was always handle-agnostic.
- [x] **Task 3 — `src/lib/market/apify.ts` + tests.** `fetchProfileDetails(handle, { token, fetchImpl })`. 3 tests green. Already takes an explicit handle, so unchanged.

---

### Task 4: Pure module addition — identity extraction

The identity strip (spec §5) needs `businessCategoryName` / `externalUrl` / `profilePicUrlHD`, which live only in `account_snapshots.raw` (D237). Extraction is pure, so it belongs beside the other derivations and gets tested the same way.

**Files:**
- Modify: `src/lib/market/performance.ts`
- Modify: `src/lib/market/performance.test.ts`

**Interfaces:**
- Produces: `type HandleIdentity = { category: string | null; externalUrl: string | null; avatarUrl: string | null }` and `extractIdentity(raw: unknown): HandleIdentity | null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("extractIdentity", () => {
  it("pulls category, external url and avatar out of a raw payload", () => {
    expect(extractIdentity(FIXTURE)).toEqual({
      category: "Health/beauty",
      externalUrl: "https://prakritisattva.etsy.com",
      avatarUrl: "https://cdn.example/avatar.jpg",
    });
  });
  it("returns nulls for a payload missing those fields", () => {
    expect(extractIdentity({ username: "x", followersCount: 1 })).toEqual({
      category: null, externalUrl: null, avatarUrl: null,
    });
  });
  it("returns null for a non-object raw", () => {
    expect(extractIdentity(null)).toBeNull();
    expect(extractIdentity("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/market/performance.test.ts`
- [ ] **Step 3: Implement** — narrow `raw` through a `typeof raw === "object" && raw !== null` guard, then read the three optional string fields, defaulting each to `null`. No casting to `ApifyProfileItem`: `raw` is provider data of unknown vintage and must be treated as untrusted shape.
- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit** — `feat(market): extract identity fields from snapshot raw (D237)`

> **Note on `externalUrl`.** The live payload (spec §1.2) also returns `externalUrls` — an *array* of titled links; this account has two ("Etsy", "Website"). V1 renders the single `externalUrl`, which is the first of them. Keep `HandleIdentity` returning one link so the strip stays simple, but do not reshape `raw` on the way in: the array is retained, so showing all of them later is a read-path change with no re-scrape.

---

### Task 5: DB module — handle CRUD + handle-scoped reads

**Files:**
- Modify: `src/lib/db/performance.ts`

**Interfaces:** replaces the client-scoped readers with handle-scoped ones and drops the Brand Kit sweep query.

- Produces:
  - `type TrackedHandleRow = { id: string; client_id: string; platform: string; handle: string; added_at: string }`
  - `listTrackedHandles(clientId: string): Promise<TrackedHandleRow[]>` — ordered `added_at` asc
  - `addTrackedHandle(clientId: string, handle: string): Promise<TrackedHandleRow>` — upsert on the unique key so a re-add is idempotent, not a 500
  - `removeTrackedHandle(clientId: string, handle: string): Promise<void>`
  - `isHandleTracked(clientId: string, handle: string): Promise<boolean>`
  - `listAllTrackedHandles(): Promise<{ clientId: string; handle: string }[]>` — the cron's work list, **replaces** `listClientsWithInstagramHandle`
  - `getLatestSnapshot(clientId, handle)` / `listFollowerSeries(clientId, handle)` / `listTrackedPosts(clientId, handle)` — all gain a `handle` argument and an `.eq("handle", handle)`
  - `insertAccountSnapshot` / `upsertTrackedPost` / `updateTrackedPostThumbnail` — unchanged
- `getLatestSnapshot` must now also select `raw` (the identity strip reads it); keep it out of `listFollowerSeries`, which would otherwise drag every payload over the wire.

- [ ] **Step 1: Implement the changes**
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`. Expect errors in the existing routes/orchestrator; they are fixed in Tasks 6–9, so run the typecheck again at the end of Task 10 rather than chasing them now.
- [ ] **Step 3: Commit** — `feat(db): tracked_handles CRUD and handle-scoped reads (D252)`

---

### Task 6: Orchestrator — snapshot one explicit handle

**Files:**
- Modify: `src/lib/market/snapshot.ts`
- Modify: `src/lib/market/snapshot.test.ts`

**Interfaces:**
- Produces: `snapshotHandle(clientId: string, handle: string, opts?: { fetchImpl?: typeof fetch }): Promise<SnapshotResult>` where `SnapshotResult = { ok: true; handle: string; postCount: number } | { ok: false; reason: "no-data" }`.

The `"no-handle"` reason disappears: the caller now supplies the handle, and whether it is tracked is the route's business, not the orchestrator's. `getBrandDetails` is no longer imported here at all.

- [ ] **Step 1: Update the tests** — drop the `no-handle` case and the `getBrandDetails` mock; every remaining case passes an explicit `"prakritisattva"`. Keep all four behavioural tests: no-data, happy path, thumbnail-failure-still-saves, skip-rehost-when-present.
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** — delete the brand-kit lookup and the parse; take `handle` as a parameter. Everything else (snapshot insert, post upsert loop, best-effort thumbnail re-host inside `try/catch`) is unchanged.
- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit** — `feat(market): snapshotHandle takes an explicit handle (D252)`

---

### Task 7: Handles routes — list, add, remove

**Files:**
- Create: `src/app/api/clients/[id]/performance/handles/route.ts` (GET, POST)
- Create: `src/app/api/clients/[id]/performance/handles/route.test.ts`
- Create: `src/app/api/clients/[id]/performance/handles/[handle]/route.ts` (DELETE)

**Interfaces:**
- `GET` → `apiOk({ handles: TrackedHandleRow[], suggestion: string | null })`. `suggestion` is `parseInstagramHandle(brandDetails.instagram)` **only when that handle is not already tracked** — otherwise `null`, so the dialog never offers something already in the list.
- `POST {handle}` → 201 with the row; `apiError("That doesn't look like an Instagram handle.", 400)` when the parser returns null; idempotent on re-add.
- `DELETE` → `apiOk({ ok: true })`. Unenrols only; snapshot history is retained by design (D253).

- [ ] **Step 1: Write the failing tests** — reuse the mock preamble from `src/app/api/clients/[id]/market/route.test.ts` (dal / impersonation / impersonation-audit / clients). Cover: list returns handles + suggestion; suggestion suppressed when already tracked; POST canonicalizes `@Foo` → `foo`; POST rejects garbage with 400; DELETE returns ok.
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement both route files**
- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit** — `feat(api): tracked handle list/add/remove (D252)`

---

### Task 8: Performance + refresh routes go handle-scoped

**Files:**
- Modify: `src/app/api/clients/[id]/performance/route.ts` + its test
- Modify: `src/app/api/clients/[id]/performance/refresh/route.ts` + its test

**Interfaces:**
- `GET /performance?handle=x` → `apiError("A handle is required.", 400)` when absent; `apiError("That handle isn't tracked for this client.", 404)` when not in `tracked_handles`; otherwise `apiOk({ handle, identity, latest, series, posts, stats })` where `identity = extractIdentity(latest?.raw)`.
- `POST /performance/refresh {handle}` → same 400/404 guards, then the **per-handle** hour guard against that handle's latest snapshot, then `snapshotHandle`. 429 on too-soon, 409 on `no-data`.

The hour guard moving from per-client to per-handle matters: with several handles tracked, a per-client guard would let one refresh block every other handle for an hour.

- [ ] **Step 1: Update both tests** — add the missing-handle and untracked-handle cases; existing cases gain `?handle=prakritisattva` / a JSON body.
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run to verify pass**
- [ ] **Step 5: Commit** — `feat(api): handle-scoped performance payload and refresh (D253)`

---

### Task 9: Trigger sweep over tracked_handles

**Files:**
- Modify: `trigger/snapshot-handles.ts`

- [ ] **Step 1: Implement** — swap the dynamic import of `listClientsWithInstagramHandle` for `listAllTrackedHandles`, and call `snapshotHandle(row.clientId, row.handle)`. The per-row `try/catch` and its `logger.error` stay exactly as they are: one bad handle must not starve the rest, and that is now more load-bearing than before, since a competitor handle can go private or vanish without anyone on the team noticing.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit`
- [ ] **Step 3: Commit** — `feat(trigger): sweep tracked_handles daily (D253)`

---

### Task 10: UI — sub-tab strip, add dialog, identity strip, chart

**Files:**
- Create: `src/hooks/use-tracked-handles.ts`
- Modify: `src/hooks/use-performance.ts` (takes a handle; skips fetching when null)
- Create: `src/components/market/performance-view.tsx` — owns the sub-tab strip + dialog
- Create: `src/components/market/handle-performance.tsx` — one handle's content
- Create: `src/components/market/handle-identity-strip.tsx`
- Create: `src/components/market/add-handle-dialog.tsx`
- Modify: `src/components/market/performance-chart.tsx` (gridlines, value labels, hover readout)
- Modify: `src/components/market/market-view.tsx` (tab union + fourth tab)
- Already written, carry over unchanged: `src/components/market/performance-post-tile.tsx`

- [ ] **Step 1: `use-tracked-handles.ts`** — `{ handles, suggestion, loading, add(handle), remove(handle) }` over the Task 7 routes, all through `authFetch`. `add` returns an error string or null so the dialog can render a field-level message.
- [ ] **Step 2: `use-performance.ts`** — signature becomes `usePerformance(clientId: string, handle: string | null)`; when `handle` is null it holds `data: null, loading: false` and fetches nothing. `refresh` posts `{ handle }`. Keep `authFetch` for the POST (not bare `fetch`) — Refresh can be clicked long after page load, which is exactly the stale-token race `authFetch` exists to close.
- [ ] **Step 3: `add-handle-dialog.tsx`** — shadcn `Dialog` + `Input`; prefilled from `suggestion`; inline error on a 400; closes and selects the new handle on success.
- [ ] **Step 4: `handle-identity-strip.tsx`** — avatar (fall back to initials on a purple gradient when `avatarUrl` is absent or fails to load), `@handle`, `category · externalUrl`. Includes the handle's remove affordance.
- [ ] **Step 5: `handle-performance.tsx`** — identity strip → four stat cards → chart card → posts grid → "Last updated · ↻ Refresh". This is the body of the old single-handle `performance-view.tsx`; lift it wholesale and add the identity strip on top.
- [ ] **Step 6: `performance-view.tsx`** — the handle sub-tab strip (`Tabs` from `src/components/ui/tabs`), a dashed-border primary `+ Add handle` chip, and the no-handles empty state (just the chip plus one line of copy — **no Brand Kit link**; the Post node's Brand panel has no route, and D252 removed the dependency anyway). Selected handle lives in local state, defaulting to the first.
- [ ] **Step 7: `performance-chart.tsx`** — add horizontal gridlines with value labels and a hover crosshair + readout, per the mockup. Keep it dependency-free; guard the hover behind `matchMedia("(pointer: fine)")` so touch does not get a stuck tooltip.
- [ ] **Step 8: Wire into `market-view.tsx`** — widen `MarketTab` to `MarketBucket | "signals" | "performance"`, add the `TabsTrigger` and `TabsContent`. `clientSlug` is already in the props type and stays unused by this feature.
- [ ] **Step 9: Verify in the browser** — `npm run dev`. Blocked on `APIFY_TOKEN` for anything past the empty state. Verify: (1) fourth tab renders; (2) no handles → the dashed add chip alone; (3) add `@prakritisattva` → sub-tab appears, "first snapshot pending"; (4) Refresh → after ~10s stats, identity strip and tiles fill; (5) Refresh again → the per-handle 429 message; (6) add a second handle → two sub-tabs, independent data; (7) remove a handle → sub-tab goes, and re-adding it brings the history back.
- [ ] **Step 10: Lint + typecheck + full test run** — `npm run lint && npx tsc --noEmit && npx vitest run`
- [ ] **Step 11: Commit** — `feat(market): Performance tab with per-handle sub-tabs (D253)`

---

### Task 11: Docs + finish

- [ ] **Step 1: Mark the spec implemented** — change the `**Status:**` line.
- [ ] **Step 2: Apply the migration** — `npx supabase db push` (needs the user's decision; 0038 is unapplied).
- [ ] **Step 3: Full verification once more**, and confirm the output before claiming done — evidence before assertions.
- [ ] **Step 4: Commit, then use superpowers:finishing-a-development-branch.**

---

## Self-review notes

- **Spec coverage:** §2.1 → Task 1 (built); §2.2/2.3 → Task 1 (built); §2.4 → Tasks 5/7; §3 → Tasks 6/9; §4 → Tasks 4/5/7/8; §5 → Task 10; §7 testing → Tasks 4, 6, 7, 8.
- **What D252/D253 did *not* touch:** the migration's two metric tables, the whole pure module, and the Apify client. `platform`/`handle` were first-class columns and `fetchProfileDetails` already took a handle, so the multi-handle model cost nothing at those layers — the change is concentrated in the DB accessors, the route surface, and the UI.
- **Known checks for the executor:** `getLatestSnapshot` must start selecting `raw` or the identity strip renders empty; the refresh hour-guard must key on handle, not client; `addTrackedHandle` must upsert rather than insert, or a double-submit 500s.
- **Verified against live data, 2026-09-08** (spec §1.1): every field these tasks read is present in the real payload, all three provider `type` values map cleanly, and one `details` scrape bills as a single dataset item (~$0.081/month per handle). Re-run `scripts/spike-instagram.mjs` before any task that starts reading a provider field the tab does not already render.
- **Deliberately deferred:** cross-handle comparison, `is_primary`, cascade-on-unenrol, TikTok, plus everything inventoried in spec §1.2 as captured-but-unused (hashtags, carousel `childPosts`, `paidPartnership`, true-Reel detection via `productType`, multiple `externalUrls`). All are retained in `raw`, so each is a read-path change later, never a re-scrape.
- **Known limitation, accepted for V1:** the keys are `(client_id, platform, handle)`, but `id`/`fbid` are the account's stable identity. A tracked account that renames itself starts a fresh, disconnected series rather than continuing its own. Recorded in spec §1.2; the fix, if it ever bites, is storing `id` on `tracked_handles` and reconciling by it.
