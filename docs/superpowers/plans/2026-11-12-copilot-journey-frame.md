# Copilot Journey, Piece 1: Frame and Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every client screen gets the stage tabs and a foldable left guide panel, market research gains an approval, and new scripts are locked until market research is approved.

**Architecture:** A new server layout at `src/app/clients/[id]/layout.tsx` loads the client once and wraps every client page in a client-side frame (tabs on top, guide panel on the left, the existing page untouched on the right). Stage state, the route-to-frame mapping and the guide's copy are pure functions in `src/lib/journey/`, so they are unit tested without React. The guide panel in this piece is deterministic (no model, no chat): it is the frame the stage agents plug into in later pieces.

**Tech Stack:** Next.js 16.2.6 App Router (read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md` before Task 6: `params` is a Promise in layouts), React 19, Supabase, TanStack Query v5, Vitest (node environment), shadcn Base UI primitives, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-12-copilot-journey-design.md` (sections 3, 4.1, 4.3, 5.2, 5.3, 6, 7 piece 1).

## Global Constraints

- Work only in this worktree (`.claude/worktrees/copilot-journey`, branch `feat/copilot-journey`). Run `npm install` here first; never junction `node_modules`.
- Controls are shadcn primitives from `src/components/ui/*` (`Button`, `Tooltip`, …), composed with the `render` prop. No raw `<button>` or `<input>`. Navigation uses `next/link`.
- Colours only through the CSS variables in `src/app/globals.css`. Purple (`primary`) is for the active tab line, the current-stage icon and the primary button only. Fonts: `font-display` for headings, default sans otherwise. Use `.text-eyebrow` for small tracked labels. Lucide icons, `strokeWidth={1.5}`.
- Motion: `duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]`, with `motion-reduce:transition-none`.
- API routes use `apiOk` / `apiError` / `withClient` / `withTryCatch` from `src/lib/api/route-helpers.ts`. Browser calls go service → query hook → component.
- Nothing per item: the frame makes zero client-side requests on mount. Stage state comes from the server layout.
- User-facing words: "Brand KB", "Market research", "Scripts", "Avatars", "Brand assets". The copilot never approves: every gate card ends with "I can't approve it for you."
- Existing clients are treated as approved for market research (spec section 6). `kb_status` is never changed by this work.
- Do not apply the migration to any database. Cyril applies migrations.
- One component per file, named export, split near 200 lines (`docs/component-structure.md`).

## Review Focus

1. **A client that existed before this ships, with a brand KB that is not ready.** It must still be able to write scripts exactly as today (Task 2 test `existing client with unfinished KB keeps scripts open`).
2. **A client outside the caller's org, or a slug that does not exist.** The layout must render the page alone, with no tabs and no client name (Task 6 step 4 manual check; Task 3 keeps the mapping pure so the layout owns this branch).
3. **Blocked `localStorage` (private window).** Folding the panel must still work for the visit; `useCopilotCollapsed` already falls back to memory, so the panel must use it and nothing else (Task 6).
4. **Approving market research twice, or before the brand KB is ready.** Second approve returns 200 and changes nothing; approve with KB not ready returns 409 (Task 5 tests).
5. **A long pasted script sent while scripts are locked.** It must go through; a short "write me a script" message must be refused with the gate message (Task 8 tests).

---

### Task 1: Market research status on the client

**Files:**
- Create: `supabase/migrations/0063_client_market_status.sql`
- Modify: `src/lib/db/types.ts` (`ClientRow`)
- Modify: `src/lib/db/clients.ts`

**Interfaces:**
- Produces: `ClientRow["market_status"]: "pending" | "approved"`; `setMarketStatus(clientId: string, status: ClientRow["market_status"]): Promise<void>`; `getClientBySlug` wrapped in React `cache()` (same signature).

- [ ] **Step 1: Write the migration**

```sql
-- Copilot journey, piece 1. Spec: docs/superpowers/specs/2026-11-12-copilot-journey-design.md §5.2, §6
--
-- market_status: whether a person has approved this client's market research. Scripts open on
-- 'approved'. Every client that exists now is approved (the column is added with that default),
-- and every client created after this starts 'pending'.

alter table clients add column if not exists market_status text not null default 'approved'
  check (market_status in ('pending', 'approved'));
alter table clients alter column market_status set default 'pending';
```

- [ ] **Step 2: Add `market_status: "pending" | "approved";` to `ClientRow`** directly under `kb_status`.

- [ ] **Step 3: Add `setMarketStatus` to `src/lib/db/clients.ts`**, written like `setKBStatus` beside it.

- [ ] **Step 4: Wrap `getClientBySlug` in `cache` from `react`** (`export const getClientBySlug = cache(async (slug: string): Promise<ClientRow | null> => { … })`), so the layout and the page share one query per request.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors (fix any test fixture that builds a `ClientRow` by adding `market_status: "approved"`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0063_client_market_status.sql src/lib/db
git commit -m "feat(journey): clients carry a market research status; existing clients start approved"
```

---

### Task 2: Stage state

**Files:**
- Create: `src/lib/journey/stages.ts`
- Test: `src/lib/journey/__tests__/stages.test.ts`

**Interfaces:**
- Consumes: `ClientRow` (Task 1).
- Produces:

```ts
export type StageState = "approved" | "in_progress" | "locked" | "open";
export type JourneyState = { kb: StageState; market: StageState; scripts: StageState };
export type JourneyClient = Pick<ClientRow, "kb_status" | "market_status">;
export function journeyState(client: JourneyClient): JourneyState;
export function scriptsLocked(client: JourneyClient): boolean; // market_status !== "approved"
export function canApproveMarket(client: JourneyClient): boolean; // kb ready and market pending
```

Rules: `kb` is `approved` when `kb_status === "ready"`, otherwise `in_progress`. `market` is `approved` when `market_status === "approved"`; otherwise `in_progress` when the KB is ready, `locked` when it is not. `scripts` is `open` when `market_status === "approved"`, otherwise `locked`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { canApproveMarket, journeyState, scriptsLocked } from "../stages";

describe("journeyState", () => {
  it("new client: KB in progress, the rest locked", () => {
    expect(journeyState({ kb_status: "pending", market_status: "pending" }))
      .toEqual({ kb: "in_progress", market: "locked", scripts: "locked" });
  });
  it("KB in review still locks market research", () => {
    expect(journeyState({ kb_status: "in_review", market_status: "pending" }).market).toBe("locked");
  });
  it("KB ready opens market research and keeps scripts locked", () => {
    expect(journeyState({ kb_status: "ready", market_status: "pending" }))
      .toEqual({ kb: "approved", market: "in_progress", scripts: "locked" });
  });
  it("both approved opens scripts", () => {
    expect(journeyState({ kb_status: "ready", market_status: "approved" }))
      .toEqual({ kb: "approved", market: "approved", scripts: "open" });
  });
  it("existing client with unfinished KB keeps scripts open", () => {
    const c = { kb_status: "in_review", market_status: "approved" } as const;
    expect(journeyState(c)).toEqual({ kb: "in_progress", market: "approved", scripts: "open" });
    expect(scriptsLocked(c)).toBe(false);
  });
});

describe("canApproveMarket", () => {
  it("only with a ready KB and pending research", () => {
    expect(canApproveMarket({ kb_status: "ready", market_status: "pending" })).toBe(true);
    expect(canApproveMarket({ kb_status: "in_review", market_status: "pending" })).toBe(false);
    expect(canApproveMarket({ kb_status: "ready", market_status: "approved" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npm test -- src/lib/journey/__tests__/stages.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the three functions** per the rules above.
- [ ] **Step 4: Run the test again.** Expected: PASS (6 tests).
- [ ] **Step 5: Commit** `feat(journey): stage state from a client's KB and market research status`.

---

### Task 3: Which frame a route gets

**Files:**
- Create: `src/lib/journey/frame.ts`
- Test: `src/lib/journey/__tests__/frame.test.ts`

**Interfaces:**
- Produces:

```ts
export type TabId = "kb" | "market" | "scripts" | "avatars" | "brand-assets";
export type PanelSection = "kb" | "market" | "scripts";
export type Frame = { tabs: boolean; tab: TabId | null; panel: PanelSection | null };
export const JOURNEY_TABS: { id: TabId; label: string; href: (slug: string) => string; stage: boolean }[];
export function frameFor(pathname: string, slug: string): Frame;
```

`JOURNEY_TABS`, in order: `kb` "Brand KB" `/clients/{slug}/kb` stage; `market` "Market research" `/clients/{slug}/market` stage; `scripts` "Scripts" `/clients/{slug}/scripts` stage; `avatars` "Avatars" `/clients/{slug}/avatars` not a stage; `brand-assets` "Brand assets" `/clients/{slug}/brand-assets` not a stage.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { frameFor } from "../frame";

const f = (path: string) => frameFor(path, "chupps");

describe("frameFor", () => {
  it("client home: tabs, none active, no panel", () => {
    expect(f("/clients/chupps")).toEqual({ tabs: true, tab: null, panel: null });
  });
  it("stage pages get their tab and the panel", () => {
    expect(f("/clients/chupps/kb")).toEqual({ tabs: true, tab: "kb", panel: "kb" });
    expect(f("/clients/chupps/market")).toEqual({ tabs: true, tab: "market", panel: "market" });
    expect(f("/clients/chupps/scripts")).toEqual({ tabs: true, tab: "scripts", panel: "scripts" });
  });
  it("a script keeps its own copilot, so no panel", () => {
    expect(f("/clients/chupps/scripts/abc")).toEqual({ tabs: true, tab: "scripts", panel: null });
  });
  it("avatars and brand assets are tabs without a panel", () => {
    expect(f("/clients/chupps/avatars/new")).toEqual({ tabs: true, tab: "avatars", panel: null });
    expect(f("/clients/chupps/brand-assets")).toEqual({ tabs: true, tab: "brand-assets", panel: null });
  });
  it("the canvas editor gets no frame", () => {
    expect(f("/clients/chupps/canvases/c1")).toEqual({ tabs: false, tab: null, panel: null });
    expect(f("/clients/chupps/canvases/c1/edit")).toEqual({ tabs: false, tab: null, panel: null });
  });
  it("ignores a trailing slash and a query string", () => {
    expect(f("/clients/chupps/kb/?x=1").tab).toBe("kb");
  });
});
```

- [ ] **Step 2: Run** `npm test -- src/lib/journey/__tests__/frame.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `JOURNEY_TABS` and `frameFor`** (match on the first path segment after `/clients/{slug}/`).
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(journey): which tabs and panel each client route gets`.

---

### Task 4: What the guide panel says

**Files:**
- Create: `src/lib/journey/guide.ts`
- Test: `src/lib/journey/__tests__/guide.test.ts`

**Interfaces:**
- Consumes: `JourneyState` (Task 2), `PanelSection` (Task 3), `ClientRow["kb_status"]`.
- Produces:

```ts
export type Guide = {
  done: string[];                                  // status lines, ticked
  waiting: string | null;                          // the one thing the person does next
  gate: { title: string; body: string } | null;    // the next approval
  next: { label: string; href: string } | null;    // where to go when this stage has nothing left
};
export function guideFor(input: { section: PanelSection; state: JourneyState; kbStatus: ClientRow["kb_status"]; slug: string }): Guide;
```

`done` is always built from the state: `"Brand KB approved"` when `state.kb === "approved"`, then `"Market research approved"` when `state.market === "approved"`. Exact copy for the rest:

| section | condition | waiting | gate title / body | next |
|---|---|---|---|---|
| kb | `kbStatus === "pending"` | `Add the brand's website or documents to build the brand KB` | `Next stop: brand KB approval` / `Review each part of the brand KB and mark it ready. Market research opens after that. I can't approve it for you.` | none |
| kb | `kbStatus === "in_review"` | `Review the brand KB and mark it ready` | same gate | none |
| kb | KB approved | none | none | `Go to market research` → `/clients/{slug}/market` when market is not approved, else `Go to scripts` → `/clients/{slug}/scripts` |
| market | `locked` | `Approve the brand KB first` | `Market research is locked` / `It opens once the brand KB is approved.` | `Go to brand KB` → `/clients/{slug}/kb` |
| market | `in_progress` | `Collect references, then approve market research` | `Next stop: market research approval` / `Approve the research when it reflects the market. Scripts open after that. I can't approve it for you.` | none |
| market | `approved` | none | none | `Go to scripts` → `/clients/{slug}/scripts` |
| scripts | `locked` | `Approve market research to write a new script` | `Scripts are locked` / `New scripts open once market research is approved. You can still paste a script you already have.` | `Go to market research` → `/clients/{slug}/market` |
| scripts | `open` | `Start a new script` | none | none |

- [ ] **Step 1: Write the failing tests**, one `it` per table row, each asserting the full `Guide` object with the copy above verbatim. Add: `it("lists only what is true", …)` asserting `done` is `["Market research approved"]` for `{ kb: "in_progress", market: "approved", scripts: "open" }`.
- [ ] **Step 2: Run** `npm test -- src/lib/journey/__tests__/guide.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `guideFor`.**
- [ ] **Step 4: Run again.** Expected: PASS (9 tests).
- [ ] **Step 5: Commit** `feat(journey): the guide panel's status, waiting line and gate for each stage`.

---

### Task 5: Approving market research

**Files:**
- Create: `src/app/api/clients/[id]/market/approve/route.ts`
- Test: `src/app/api/clients/[id]/market/approve/route.test.ts` (mock style: copy `src/app/api/clients/[id]/scripts/route.test.ts`)
- Create: `src/services/market-approval.service.ts`
- Create: `src/hooks/queries/market-approval.ts`

**Interfaces:**
- Consumes: `setMarketStatus` (Task 1), `canApproveMarket` (Task 2).
- Produces: `POST /api/clients/:id/market/approve` → `{ ok: true }`; `approveMarket(clientId: string): Promise<void>`; `useApproveMarket(clientId: string)` (a `useMutation` that calls `router.refresh()` on success, as `useRenameClient` does in `src/hooks/queries/clients.ts`).

Route behaviour, inside `withClient` + `withTryCatch("Could not approve market research.", …)`:
- `client.market_status === "approved"` → `apiOk({ ok: true })`, no write.
- `client.kb_status !== "ready"` → `apiError("Approve the brand KB before market research.", 409)`.
- otherwise `setMarketStatus(clientId, "approved")`, `revalidatePath` for `/clients/{slug}`, `/clients/{slug}/market` and `/clients/{slug}/scripts`, then `apiOk({ ok: true })`.

- [ ] **Step 1: Write the failing route tests**

```ts
it("approves when the brand KB is ready", …)        // 200, setMarketStatus called with (id, "approved")
it("refuses while the brand KB is not ready", …)    // 409, body.error "Approve the brand KB before market research.", no write
it("is a no-op when already approved", …)           // 200, setMarketStatus not called
it("404s for a client outside the caller's org", …) // 404, no write
```

- [ ] **Step 2: Run** `npm test -- "src/app/api/clients/[id]/market/approve"`. Expected: FAIL.
- [ ] **Step 3: Implement the route.**
- [ ] **Step 4: Run again.** Expected: PASS (4 tests).
- [ ] **Step 5: Add the service** (`readJson` from `src/services/read-json.ts`, one `fetch` POST) **and the hook.**
- [ ] **Step 6: Commit** `feat(journey): a person approves market research`.

---

### Task 6: The frame around every client screen

**Files:**
- Create: `src/app/clients/[id]/layout.tsx`
- Create: `src/components/journey/client-frame.tsx` (client component; picks the frame from `usePathname()`)
- Create: `src/components/journey/stage-tabs.tsx`
- Create: `src/components/journey/journey-panel.tsx`
- Create: `src/components/journey/journey-rail.tsx`
- Modify: `src/app/clients/[id]/kb/page.tsx` (full-height class)

**Interfaces:**
- Consumes: `getClientBySlug`, `resolveOrgId`, `journeyState`, `frameFor`, `JOURNEY_TABS`, `guideFor`, `useCopilotCollapsed` (`src/hooks/use-copilot-collapsed.ts`, called with the key `` `journey.${clientId}` ``).
- Produces: `ClientFrame({ client: { id, slug, name, kbStatus }, state: JourneyState, children })`; `StageTabs({ slug, name, state, active: TabId | null })`; `JourneyPanel({ clientId, guide: Guide })`; `JourneyRail({ waiting: string | null, onExpand })`.

- [ ] **Step 1: Write the layout.** Server component, `params: Promise<{ id: string }>`. Load the client and `resolveOrgId()` in parallel. When the client is missing or `client.org_id` differs, return `children` alone. Otherwise render `<ClientFrame>` with `journeyState(client)`.

- [ ] **Step 2: Write `StageTabs`.** A `<nav aria-label="Client sections">` in a bar with `border-b border-border bg-background`, `px-6`, height `h-12`. Left: the client name as a `Link` to `/clients/{slug}` (`font-medium`). Then one `Link` per `JOURNEY_TABS` entry: icon + label on one line, `border-b-2` that is `border-primary` when active and transparent otherwise. Stage tabs show an icon by state: `Check` in `text-emerald-700` for `approved`, `CircleDot` in `text-primary` for `in_progress` and `open`, `Lock` in `text-muted-foreground` for `locked` (label also `text-muted-foreground`). Non-stage tabs have no icon. Each stage link carries `aria-label` of the form `Brand KB, approved`. Locked tabs stay links: the page explains the lock.

- [ ] **Step 3: Write `JourneyPanel` and `JourneyRail`.** Copy the shell of `src/components/scripts/generate/copilot-chat.tsx` (section classes, header with `Sparkles` + "Copilot" + the `PanelLeftClose` fold button in a `Tooltip`, the width transition) and of `copilot-rail.tsx`. Differences: open width `lg:w-80`, folded `lg:w-12`; `lg:sticky lg:top-20 lg:h-[calc(100vh-10rem)]`; below `lg` the panel is `hidden`. Body, top to bottom: each `guide.done` line with a `Check` icon in `text-emerald-700`; the `guide.waiting` line with an amber dot (`bg-amber-600`) prefixed "Waiting for you: "; the gate as a bordered card (`rounded-xl border border-border p-4`) with the title in `font-medium` and the body in `text-sm text-muted-foreground`; `guide.next` as a `Button variant="outline"` rendering a `Link`. No message input in this piece. `JourneyRail` shows the expand button, then the amber dot and the waiting text vertically (`[writing-mode:vertical-rl]`) when `waiting` is set.

- [ ] **Step 4: Write `ClientFrame`.** `const frame = frameFor(usePathname(), client.slug)`. When `!frame.tabs` return `children`. Otherwise: `StageTabs`, then `<div className="flex flex-1 items-start">`, with the panel (when `frame.panel`) in a `pl-6 pt-6` wrapper and `<div className="min-w-0 flex-1">{children}</div>`.

- [ ] **Step 5: Fix the KB page height.** In `src/app/clients/[id]/kb/page.tsx` change `h-[calc(100vh-4rem)]` to `h-[calc(100vh-7rem)]` (header 4rem + tabs 3rem). Run `grep -rn "100vh" src/app/clients src/components/kb src/components/market src/components/scripts/scripts-library.tsx` and adjust any other full-height page under the frame the same way; leave `copilot-chat.tsx` alone.

- [ ] **Step 6: Verify in the browser** (`npm run dev`, then use the `run` skill). Check, on a client with a ready KB: tabs show on home, KB, market, scripts, a script, avatars and brand assets; no tabs on a canvas; the panel shows on KB, market and scripts only; folding survives a reload; the KB review page does not scroll the whole window; at a 900px-wide window the panel is gone and pages look as before; `/clients/does-not-exist/kb` shows no tabs.

- [ ] **Step 7: Run** `npx tsc --noEmit` and `npm run lint`. Expected: no new errors.

- [ ] **Step 8: Commit** `feat(journey): stage tabs and a foldable guide panel around every client screen`.

---

### Task 7: Market research page: lock and approve

**Files:**
- Create: `src/components/market/approve-market-button.tsx`
- Modify: `src/components/market/market-view.tsx` (header only)
- Modify: `src/app/clients/[id]/market/page.tsx`

**Interfaces:**
- Consumes: `useApproveMarket` (Task 5), `journeyState`, `canApproveMarket` (Task 2), `EmptyState` (`src/components/shared/empty-state.tsx`).
- Produces: `ApproveMarketButton({ clientId, approved }: { clientId: string; approved: boolean })`; `MarketView` gains the prop `approval: { approved: boolean; canApprove: boolean }`.

- [ ] **Step 1: Lock the page.** In `page.tsx`, when `journeyState(client).market === "locked"`, render under the breadcrumb an `EmptyState` with title `Market research is locked`, body `It opens once the brand KB is approved.` and an outline `Button` linking to `/clients/{slug}/kb` labelled `Go to brand KB`, and do not render `MarketView`.

- [ ] **Step 2: Write `ApproveMarketButton`.** Approved: a non-interactive line with a `Check` icon, `Market research approved`. Not approved: a primary `Button` labelled `Approve market research`, with a `Loader2` spinner while pending and `toast.error(e.message)` on failure.

- [ ] **Step 3: Put it in the header of `MarketView`**, right-aligned beside the `<h1>` (make the header `flex items-end justify-between gap-4`), rendered only when `approval.approved || approval.canApprove`. Rename the `<h1>` text from `Market` to `Market research`; change nothing else in the view.

- [ ] **Step 4: Pass `approval` from the page** using `client.market_status === "approved"` and `canApproveMarket(client)`.

- [ ] **Step 5: Verify in the browser.** With a test client set to `market_status = 'pending'` and a ready KB: the button shows; clicking it turns the tab to approved and the Scripts tab to open without a manual reload. With the KB not ready: the locked card shows.

- [ ] **Step 6: Commit** `feat(journey): market research locks until the brand KB is approved, and is approved by a person`.

---

### Task 8: Scripts gate

**Files:**
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts`
- Test: the turn route's existing test file beside it (add cases; create `route.test.ts` in the house style if there is none)
- Modify: `src/components/scripts/new-script-button.tsx` (optional `label` prop, default `New script`)
- Modify: `src/components/scripts/scripts-library.tsx`, `src/app/clients/[id]/scripts/(library)/page.tsx`

**Interfaces:**
- Consumes: `scriptsLocked` (Task 2), `mightBeScript` (`src/lib/scripts/copilot/import.ts`).
- Produces: the turn route refuses with `apiError("New scripts open once market research is approved. You can paste a script you already have.", 409)` when `scriptsLocked(client)` and the script has no written doc yet and `!mightBeScript(text)`. `ScriptsLibrary` gains `locked: boolean`.

A script that already has a doc is never blocked, so nothing written before the gate is stranded.

- [ ] **Step 1: Write the failing tests**

```ts
it("refuses a chat message on an unwritten script while market research is pending", …) // 409 with the message above; no model call
it("lets a pasted script through while market research is pending", …)                  // a text for which mightBeScript is true proceeds
it("lets an already written script be edited while market research is pending", …)      // proceeds
it("changes nothing once market research is approved", …)                               // proceeds
```

- [ ] **Step 2: Run** `npm test -- "src/app/api/clients/[id]/scripts/[scriptId]/turn"`. Expected: the first test FAILS.
- [ ] **Step 3: Add the check** in the route, after the script and the message text are loaded and before any model call. The client is already in hand from `withClient`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Library.** The page passes `locked={scriptsLocked(client)}`. When locked, both `NewScriptButton` uses get `label="Paste a script"`, and a line above the list reads `New scripts open once market research is approved. You can still paste a script you already have.` in `text-sm text-muted-foreground`.
- [ ] **Step 6: Verify in the browser** on the pending test client: the button reads "Paste a script"; typing "write me a reel" in the new script's copilot shows the gate message as an error toast; pasting a full script imports it.
- [ ] **Step 7: Commit** `feat(journey): new scripts wait for market research approval; a pasted script does not`.

---

### Task 9: Decision log, spec note, full check

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, append)
- Modify: `docs/superpowers/specs/2026-11-12-copilot-journey-design.md` (§7)

- [ ] **Step 1: Find the next free ADR number** (`grep -o "\bD[0-9]\{3\}\b" docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md | sort -u | tail -1`; it was D493 on 2026-11-12, so D506 and D507 unless taken).
- [ ] **Step 2: Append two ADRs** in the log's format (Decision / Why / Rejected / Refines / Originated → spec):
  - **Client frame.** Decision: one server layout wraps every client screen in stage tabs and a foldable left guide panel; the canvas editor is outside it; the panel is deterministic until the stage agents land. Why: one place to show where a client is; pages stay untouched. Rejected: a tab bar repeated in each page; a per-page panel.
  - **Stage gates.** Decision: `clients.market_status`; market research opens on a ready brand KB; new scripts open on approved research; existing clients start approved; a pasted script skips the gate; a person approves. Why and rejected: from the spec, sections 3 and 6. Refines: Market Signals V1 (adds an approval; "no AI" is unchanged in this piece).
- [ ] **Step 3: Amend the spec's build order** so piece 1 reads "shared frame, stage tabs, the foldable guide panel (no chat yet) and the approval gates", and piece 2 gains "saved threads, the four message kinds and attachments in the chat".
- [ ] **Step 4: Full check.** Run `npm test`, `npx tsc --noEmit`, `npm run lint`. Expected: all pass, apart from the known cold-cache timeout flakes (re-run before investigating).
- [ ] **Step 5: Commit** `docs(journey): ADRs for the client frame and stage gates`.
