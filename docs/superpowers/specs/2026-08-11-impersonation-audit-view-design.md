# Impersonation Audit View — Design

**Status:** approved, not yet implemented.
**ADR:** D141 (`2026-05-30-creativeos-staging-roadmap.md` §7). Builds on D81, D101, D139.
**Closes:** `2026-08-04-impersonation-stage4-design.md` §7's first out-of-scope item —
"Reading `impersonation_audit_log` from any UI … a natural Stage 5 candidate."

## 1. Context

`impersonation_audit_log` has been written since Stage 4 and read by nothing. There is no
query, no route, and no UI — the trail exists but has no surface, which makes it worthless
for the question it was built to answer: *what did a support operator actually do inside this
customer's org?*

A raw dump would not fix that, for a reason the audit surfaced: **`saveCanvasAction` is
wrapped in `withAction`** (`src/lib/actions/nodes.ts`), so **every autosave while elevated
writes a `write_action` row**. A short editing session emits dozens of identical entries. The
one generation an operator cares about is buried among them. Volume, not absence, is the
reason the log reads as useless.

Generations are a second gap. They *are* logged — the generate route goes through `withNode`,
which gates and logs — but as `{ method: "POST", path: "/api/nodes/<uuid>/generate" }`. True,
and unreadable.

## 2. The key enabling fact

`generations.user_id` is set from `caller.userId` (`src/app/api/nodes/[id]/generate/route.ts`),
which is the **real operator**, not the impersonated org's user — while `effectiveOrgId` files
the row under the customer's org. So a generation made during impersonation is already fully
attributable, carrying type, model, status and credits.

This means the design needs **no migration, no new columns, and no change to the write path.**
Generations are correlated at read time from data that already exists, and the result is
richer than anything the gate could reasonably have logged.

## 3. Read path

Three bounded queries on the existing `/admin/orgs/[id]` server page:

1. **Session anchors** — `session_started` rows for the org, newest first, `limit`/`offset` by
   page. These define the page's time window.
2. **All audit rows** for the org within that window.
3. **Generations** for the org within that window.

Operator display names come from the `profiles` table (`user_id` → `display_name`), the same
join `listOrgMembers` already uses.

New in `src/lib/db/impersonation-audit.ts`:
`listImpersonationSessionPage(orgId, { page, pageSize })`, returning `{ rows, total }` to match
`listGenerationsForOrgPage`'s established shape.
New in `src/lib/db/generations.ts`: a window lookup returning `node_id`, `type`, `model_used`,
`status`, `credits_consumed`, `user_id`, `created_at`.

## 4. Grouping — a pure module

`src/lib/auth/impersonation-audit-view.ts`, unit-testable under the repo's
`environment: "node"` vitest setup, following the same split used for the banner.

```ts
type SessionEntry =
  | { kind: "elevated"; at: string }
  | { kind: "generation"; at: string; genType: string; model: string | null;
      status: string; credits: number | null }
  | { kind: "action"; at: string; label: string };

type ImpersonationSession = {
  id: string;              // the session_started row's id
  operatorId: string;
  operatorName: string;
  startedAt: string;
  endedAt: string | null;  // null → still active
  elevated: boolean;
  entries: SessionEntry[]; // chronological, plumbing removed
  quietCount: number;      // collapsed autosaves and handshakes
};
```

`groupIntoSessions(events, generations)` opens a session at `session_started` and closes it at
`session_ended`. A session with no end renders as **still active** rather than being dropped.
Events arriving before the page's first `session_started` are discarded rather than
synthesising a fake session.

### 4.1 Correlating generations — by node id, not by time

A `write_action` row for a generate endpoint carries the **node uuid in its path**, and
`generations.node_id` is that same uuid. So the two are matched **exactly**, within the
session's window and on matching operator id — no fuzzy timestamp window, nothing to tune.

When a match exists, the `write_action` row is dropped and the generation entry replaces it:
strictly richer, and no double-listing.

**When no match exists, the row is kept** as `"Attempted a generation"`. A generation that
failed before its row was inserted is exactly the kind of event an audit trail must not lose,
and a path-blacklist would have silently swallowed it.

### 4.2 Which actions matter — three buckets

Grounded in the actual surface: 18 `withAction`-gated server actions and ~48 gated API routes.

**Bucket 1 — quiet (counted into `quietCount`, never listed).** High-frequency plumbing that
carries no intent:

- `saveCanvasAction`, `saveCanvasNodesAction` — autosave, the original flood
- `*/sign` routes (`file/sign`, `logo/sign`, `brand-kit/assets/sign`, `kb/*/sign`) — the
  pre-upload signing handshake; the paired `finalize` is the real event
- `cost`, `compile-preview`, `upstream-images` — POSTs that compute rather than mutate

**Bucket 2 — superseded (dropped, replaced by a generation entry).** Only where §4.1 finds a
matching `generations` row.

**Bucket 3 — meaningful (listed with a human label).** Everything else, including:

| Source | Label |
|---|---|
| `createCanvasAction` / `deleteCanvasAction` / `renameCanvasAction` | Created / Deleted / Renamed a canvas |
| `createClientAction` | Created a client |
| `deleteKBDocumentAction` | Deleted a knowledge-base document |
| `deleteBrandImageAction` | Deleted a brand image |
| `patchKBFieldAction` / `saveKBOutputAction` | Edited the knowledge base |
| `startKBBuildJob` / `markKBReadyAction` | Started / completed a knowledge-base build |
| `savePromptOutputAction` / `saveScriptOutputAction` | Edited a prompt's / script's output |
| `setVersionApprovalAction` / `setVersionLabelAction` | Approved / labelled a version |
| `markStuckJobFailed` | Marked a stuck job failed |
| `DELETE` on any gated route | Deleted a \<resource\> |
| `*/finalize` routes | Uploaded a file |
| `kb/re-analyze`, `kb/re-extract` | Re-ran knowledge-base extraction |
| `restore-version` | Restored a version |
| `duplicate`, `duplicate-batch` | Duplicated a node |

**The fallback is visible, never silent.** Anything unmapped renders as `METHOD /path`. A new
gated route added later therefore *appears* in the trail as something, rather than vanishing —
which is the whole guarantee an audit view has to make. `testAction` is the sole exception, as
it only exists for the test suite.

## 5. UI

A third tab, **Support activity**, beside Overview and Generations in
`src/app/admin/orgs/[id]/org-detail-tabs.tsx`. New components under
`src/components/admin/impersonation-audit/` (split per the ~200-line rule: the list, a session
card, and the entry row).

Not a table. A session is an episode, so each one is a **card** — white, 1px `neutral-200`
border, `shadow-card`, radius 12–16px, generous padding, the same object language as the rest
of the product.

**Collapsed card** — one line, scannable:

```
┌──────────────────────────────────────────────────────────────────┐
│ (AD)  Adarsh          11 Aug, 00:12 · 36 min      [ Editing ]  ▾ │
│       3 generations · 1 deletion · 142 quiet writes              │
└──────────────────────────────────────────────────────────────────┘
```

- Operator initials chip (reusing `initials` from `@/lib/format/initials`), name in
  `font-semibold`, timestamp and duration in `neutral-500`.
- A summary line of counts, so a collapsed card still answers "did anything happen here".
- State pill: neutral `Read-only`, or amber `Editing` reusing D139's banner treatment, so the
  consequential sessions are scannable without opening anything. An open session shows a
  pulsing dot and `In progress` in place of a duration.

**Expanded** — a vertical timeline, 1px `neutral-200` rule down the left, entries hung off it:

```
│  00:14   ⬤  Enabled editing
│  00:19   ▣  Generated image · kling-o1 · 4 credits
│  00:26   ▣  Generated video · veo-3 · 12 credits          failed
│  00:31   ▣  Deleted a canvas
│          ⋯  142 quiet writes (autosaves, uploads handshakes)
│  00:48   ⬤  Exited
```

- Times in tabular figures, `neutral-500`, fixed column so they align.
- Lucide icons at 1.5 stroke; generation entries carry model and credits as `neutral-500`
  metadata, and a failed generation shows its status without shouting.
- The quiet-write line is muted and un-timed — it is a count, not an event.
- Accordion open/close uses the system easing `cubic-bezier(0.22,1,0.36,1)` at 200ms. No
  springs.

**Empty state:** a calm centred line inside the tab — "No support sessions recorded for this
organization." — not an empty table shell.

## 6. Pagination

Mirrors `GenerationsTable` exactly, so the two tabs behave identically:

- Page 1 is rendered server-side and passed in as `initial`, and the first client effect pass
  is skipped so mount does not immediately re-fetch it.
- Later pages come from a new `GET /api/admin/orgs/[id]/impersonation-sessions` route,
  `requireSuperAdmin()`-gated like its neighbour.
- The shared `Pagination` primitive plus a rows-per-page `Select` (10 / 20 / 50), default
  **20 sessions**.
- `pageCount` is clamped the same way, so a page that empties out mid-session cannot strand
  the user past the end.

## 7. Testing

Pure-module tests, matching the repo's convention (no DOM stack — see §8 of the impersonation
UX design for why):

- a complete session groups start → elevated → writes → end, in order
- an unterminated session is returned as active, not dropped
- consecutive autosave rows collapse into `quietCount` and appear in no entry
- a generation matches its `write_action` row by node id, leaving exactly one entry
- a generate row with **no** matching generation is kept as "Attempted a generation"
- a generation by a *different* operator in the same window does not join the session
- an unmapped action renders as a visible `METHOD /path` rather than disappearing
- events preceding the page's first `session_started` are discarded

## 8. Out of scope

- **No cross-org `/admin/audit` feed.** Per-org only; a global feed is a reasonable next step.
- **No change to what gets written.** Adding structured detail to the gate would improve the
  fallback rows, but it touches every gated route and §4.1 already covers what matters.
- **Autosave timing is not recoverable** from this view. Counting rather than listing is what
  keeps generations visible; the rows remain in the table for anyone who needs them.
