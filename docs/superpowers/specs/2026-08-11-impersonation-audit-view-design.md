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

Two bounded queries, both on the existing `/admin/orgs/[id]` server page:

1. **Audit rows** for the org, newest-first, capped (§7). Operator display names come from the
   `profiles` table (`user_id` → `display_name`), the same join `listOrgMembers` already uses.
2. **Recent generations** for the org, over the window the returned sessions span.

One generations query for the whole page, bucketed in memory — not one per session.

New in `src/lib/db/impersonation-audit.ts`: `listImpersonationEventsForOrg(orgId, limit)`.
New in `src/lib/db/generations.ts`: a time-windowed lookup for the org.

## 4. Grouping — a pure module

`src/lib/auth/impersonation-audit-view.ts`, unit-testable under the repo's
`environment: "node"` vitest setup, following the same split used for the banner.

```ts
type SessionEntry =
  | { kind: "elevated"; at: string }
  | { kind: "generation"; at: string; genType: string; model: string | null;
      status: string; credits: number | null }
  | { kind: "write"; at: string; label: string };

type ImpersonationSession = {
  id: string;              // the session_started row's id
  operatorId: string;
  operatorName: string;
  startedAt: string;
  endedAt: string | null;  // null → still active
  elevated: boolean;
  entries: SessionEntry[]; // chronological, noise removed
  saveCount: number;       // collapsed autosaves
};
```

- `groupIntoSessions(events, generations): ImpersonationSession[]` — opens a session at
  `session_started`, closes at `session_ended`. A session with no end renders as **still
  active** rather than being dropped. Events arriving before any `session_started` (possible
  only from a truncated window) are discarded rather than synthesising a fake session.
  Generations join a session by timestamp window **and** matching operator id.
- `describeWriteAction(detail): { label: string; kind: "save" | "generate" | "other" }` —
  classifies one `write_action` row.

### Classification rules

| Row | Treatment |
|---|---|
| `{ action: "saveCanvasAction" }` | **Noise.** Counted into `saveCount`, never listed. |
| `{ action: "<name>Action" }` | Human label, e.g. `deleteCanvasAction` → "Deleted a canvas". |
| path matching a `/generate` endpoint | **Dropped** — see below. |
| anything else | Compact `METHOD /path` fallback, so nothing is silently lost. |

**Generation rows are dropped deliberately.** The real `generations` row supersedes them;
keeping both would list every generation twice — once as an opaque
`POST /api/nodes/<uuid>/generate`, once properly. This is the one place the view discards
real audit data, and it does so only where a strictly richer record of the same event exists.

## 5. UI

A third tab, **Support activity**, beside Overview and Generations in
`src/app/admin/orgs/[id]/org-detail-tabs.tsx`. New component
`src/components/admin/impersonation-audit.tsx`.

An accordion (`src/components/ui/accordion.tsx` already exists) of sessions, newest first:

```
▾  Adarsh · 11 Aug, 00:12 — 00:48        [Editing]
     00:14  Enabled editing
     00:19  Generated image · kling-o1 · 4 credits
     00:26  Generated video · veo-3 · 12 credits
     00:31  Deleted a canvas
     ⤷ 142 canvas saves
     00:48  Exited
```

Read-only sessions carry a neutral pill; sessions where editing was enabled carry the amber
treatment from D139's banner, so the consequential ones are scannable without reading. An
active session shows "in progress" in place of an end time.

**Naming:** the tab is "Support activity", not "Impersonation" — plain language, consistent
with D139's choice of "Enable editing" over the internal "elevated mode".

**Empty state:** "No support sessions recorded for this organization."

## 6. Testing

Pure-module tests only, matching the repo's convention (no DOM stack — see §8 of the
impersonation UX design for why):

- a complete session groups start → elevated → writes → end in order
- an unterminated session is returned as active, not dropped
- consecutive `saveCanvasAction` rows collapse into `saveCount` and appear in no entry
- a generation lands in the session whose window contains it
- a generation by a *different* operator in the same window does **not** join the session
- `write_action` rows for a generate endpoint are dropped, leaving exactly one entry per
  generation
- events preceding the first `session_started` are discarded

## 7. Bounds and out of scope

- Capped at the **25 most recent sessions**, with a matching cap on the underlying event
  query, so an org with heavy support history cannot slow the page. No pagination in this
  pass — if 25 proves limiting, pagination is the follow-up, not a redesign.
- **No cross-org `/admin/audit` feed.** Per-org only. A global feed is a reasonable next step
  and deliberately not built here.
- **No change to what gets written.** Adding structured detail to the gate (so a write knows
  *which* canvas it touched) would improve the "other" fallback rows, but it touches every
  gated route and the generations correlation already covers the case that matters.
- **Autosave timing is not recoverable** from this view. Counting rather than listing is what
  keeps generations visible; the rows remain in the table for anyone who needs them.
