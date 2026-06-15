# List/table redesign — Clients & Canvases screens

**Date:** 2026-06-15
**Status:** Approved (design), pending implementation plan

## Problem

Both list screens use a card grid that wastes space and carries almost no
information scent:

- **Clients** ([src/app/page.tsx](../../../src/app/page.tsx)) — cards show logo +
  name + canvas count only. No status, no recency.
- **Canvases** ([src/app/clients/[id]/page.tsx](../../../src/app/clients/[id]/page.tsx))
  — cards render `canvas.name` as a giant `font-display` headline (the "4 3 2 1"
  screen) with zero supporting metadata. Maximum visual weight, minimum signal.

The user's primary job on both screens is **find & resume fast**, at a scale of
**20–100 rows**. Cards optimize for neither.

## Decision

Replace both card grids with a **relaxed table** (brainstorm option C): aligned,
scannable columns with premium spacing and avatars — table density without a
sterile data-grid feel. This keeps the Yuvabe "light editorial premium" system
intact while surfacing the missing metadata.

Each screen gets: a **search box**, a **recency/name sort control**, an uppercase
column-header strip, and rows whose name drops from giant `font-display` to normal
weight so meta (recency, status, count) earns the reclaimed space. Rows keep the
barely-perceptible hover lift (`translateY(-2px) scale(1.006)`). Existing
dashed-card empty states are preserved.

## Layout

### Clients screen
| Column   | Content                                                |
|----------|--------------------------------------------------------|
| Client   | logo (or initials avatar) + name                       |
| Activity | `N canvases` + relative "edited 2h ago" (last_active)  |
| Brand KB | status badge: Ready / In review / Pending              |

- Sort: **Recent** (by `last_active`, default) / **Name**.
- Search: by client name (client-side).
- Row → `/clients/{slug}`.

### Canvases screen
| Column      | Content                          |
|-------------|----------------------------------|
| Canvas      | name                             |
| Last edited | relative time (`updated_at`)     |
| Created     | date (`created_at`)              |

- Sort: **Recent** (by `updated_at`, default) / **Name**.
- Search: by canvas name (client-side).
- Row → `/clients/{slug}/canvases/{canvasSlug}`.
- **eval-harness canvas:** keep current behavior — it remains a normal row in the
  list (no special tag, no hiding). The "Eval review" header button is unchanged.

## Data changes

- [`listClients()`](../../../src/lib/db/clients.ts) — change the embedded select
  from `*, canvases(count)` to `*, canvases(updated_at)`. Derive **both** fields in
  JS from the returned rows:
  - `canvas_count` = `rows.length`
  - `last_active` = `MAX(updated_at)` (or `null` when there are no canvases)

  `ClientWithCount` gains `last_active: string | null`. Reuses the existing FK
  embed; the separate `count` aggregate is dropped. Acceptable at 20–100 scale.
- [`listCanvases()`](../../../src/lib/db/canvases.ts) — no change. `updated_at` and
  `created_at` already arrive via `select("*")`.

## Components

Follows [docs/component-structure.md](../../component-structure.md): one component
per file, named export, no prop drilling, shadcn Base UI `render` prop.

| File | Responsibility |
|------|----------------|
| `src/lib/format/relative-time.ts` | pure `formatRelativeTime(iso: string): string` → "just now" / "2h ago" / "yesterday" / "3d ago" / "2w ago" |
| `src/lib/list/filter-sort.ts` | pure `filterAndSort<T>(rows, query, sort, accessors)` — name search + recency/name sort |
| `src/components/ui/list-toolbar.tsx` | shared search input + sort select (client component) |
| `src/components/clients/kb-status-badge.tsx` | maps `kb_status` → badge variant + label |
| `src/components/clients/clients-table.tsx` | client component: holds search/sort state, renders toolbar + client rows |
| `src/components/canvases/canvases-table.tsx` | client component: holds search/sort state, renders toolbar + canvas rows |

Server pages keep fetching data and pass plain rows into the client tables. All
filter/sort logic lives in the pure `filterAndSort` helper so the table components
stay thin (state + render).

### Styling notes (Yuvabe system)
- Drive colors through shadcn CSS variables; never hardcode. Purple used only for
  focus ring / active sort, not fills.
- KB badges: Ready → success-tinted, In review → amber-tinted, Pending → neutral.
- Borders `neutral-200`, header strip text via `.text-eyebrow` utility.
- Card/table container uses `shadow-card`; hover transition uses
  `cubic-bezier(0.22,1,0.36,1)`.
- Icons: Lucide, 1.5 stroke (search, chevron, sort).

## Testing

Logic lives in pure functions so behavior is testable without rendering:

- `relative-time` — boundaries: just now, minutes, hours, yesterday, days, weeks,
  and `null`/invalid input.
- `filter-sort` — name search match (case-insensitive, partial), empty query
  returns all, recency sort order, name sort order, stable handling of `null`
  timestamps (clients with no canvases sort last).

Table components stay thin; no heavy component tests required beyond a smoke
render if convenient.

## Out of scope (YAGNI for now)

- Column-header click-to-sort (sort lives in the toolbar control instead).
- Status filters / faceted filtering (deferred until past ~100 rows).
- Created-date column on the Clients screen.
- Special treatment / tagging for the eval-harness canvas.
- Bulk actions, multi-select, inline rename from the list.
