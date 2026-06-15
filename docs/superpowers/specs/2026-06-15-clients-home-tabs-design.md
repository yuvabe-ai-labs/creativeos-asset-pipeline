# Clients home — Clients / Recent canvases header tabs

**Date:** 2026-06-15
**Status:** Approved (design)

## Problem

The Clients home page (`src/app/page.tsx`) only lists clients. To open a canvas
you must drill in: pick a client → open that client → find the canvas. People who
return to the app usually want the canvas they were just editing, not the client
hierarchy. There is no way to jump straight into a recently-touched canvas.

## Goal

Turn the page header into two prominent tabs — **Clients** and **Recent canvases** —
so a user can flip to a globally recency-sorted list of canvases and jump directly
into one, regardless of which client owns it.

## Non-goals

- No new "create canvas" affordance on this page (canvases are created inside a
  client). The top-right action is New-client only.
- No lazy/API-route loading; both lists are fetched server-side (see Approach).
- No pagination UI. The recent list is capped at a fixed limit (below).

## Approach

**Fetch both lists server-side, toggle on the client.**

`page.tsx` remains a server component (keeps `export const dynamic = "force-dynamic"`).
It fetches `listClients()` **and** a new `listRecentCanvases()`, then passes both into
a small `"use client"` tabs wrapper. The toggle is instant with no loading state, and
it matches the existing server-component data-fetching pattern on this page.

Rejected alternative — lazy-loading the canvases tab through a new API route — adds an
API route, a client fetch, and a loading state for no real benefit at this scale
(the recent payload is small and capped). YAGNI.

## Design

### 1. Data layer — `listRecentCanvases`

New function in `src/lib/db/canvases.ts`:

- `listRecentCanvases(limit = 30): Promise<RecentCanvas[]>`
- Supabase query: `from("canvases").select("*, clients(slug, name, logo_url)").order("updated_at", { ascending: false }).limit(limit)`.
- Flatten the embedded `clients` relation into a new exported type:

```ts
export type RecentCanvas = CanvasRow & {
  client_slug: string;
  client_name: string;
  client_logo_url: string | null;
};
```

- Map the embedded `clients` object (Supabase returns it nested) onto the flat
  fields; drop the nested object from the returned shape.
- The `limit = 30` cap keeps the global list bounded as total canvas count grows.
  Ordering is by `updated_at desc` (most recently edited first).

### 2. Header tabs — `clients-home-tabs.tsx`

New `"use client"` component `src/components/clients/clients-home-tabs.tsx`.

- Uses the existing `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` (`line` variant).
- The two triggers are styled up to **display type** so they read as the page title,
  not a small control: `font-display`, ~`text-4xl`, tight tracking, with the `line`
  variant's underline `after:` indicator marking the active tab. Inactive tab uses
  the muted foreground; active is `text-foreground`.
- Eyebrow (`INCREMENT 1D · PERSISTED`) sits above the tab row, as today.
- Controlled tabs: the wrapper tracks the active value via `value` / `onValueChange`
  on the `Tabs` root (default `"clients"`).
- `NewClientDialog` renders top-right **only when the Clients tab is active**
  (conditional on the active value). Hidden on the Recent-canvases tab.
- Two `TabsContent` panels:
  - `clients`: the empty-state card (moved here from `page.tsx`) when there are no
    clients, otherwise `<ClientsTable clients={...} />`.
  - `recent`: `<RecentCanvasesTable canvases={...} />`.
- Preserve the `animate-rise` entrance treatment on the content.

Props:

```ts
{ clients: ClientWithCount[]; recentCanvases: RecentCanvas[] }
```

### 3. Recent list — `recent-canvases-table.tsx`

New `"use client"` component `src/components/canvases/recent-canvases-table.tsx`,
mirroring `canvases-table.tsx`:

- Same `ListToolbar` (search + recent/name sort) driven by the generic
  `filterAndSort` with accessors `{ name: (c) => c.name, timestamp: (c) => c.updated_at }`.
- Same rounded-xl `border bg-card shadow-card` table shell.
- Header row: **Canvas** (`flex-[3]`) · **Client** (`flex-[2]`) · **Last edited**
  (`flex-1`, right-aligned).
- Row columns:
  - Canvas: `canvas.name`, medium weight.
  - Client: small chip — `client_logo_url` as a `size-6`/`size-7` rounded logo (or
    initials fallback, reusing the `initials()` helper pattern) + `client_name` in
    muted text.
  - Last edited: `formatRelativeTime(canvas.updated_at)` + the hover chevron.
- Each row is a `Link` to `/clients/${canvas.client_slug}/canvases/${canvas.slug}`.
- Empty states: "No canvases match …" when a search filters everything out;
  a dashed empty-state card when `recentCanvases` is empty (no canvases anywhere yet).

### 4. Wiring — `page.tsx`

- Fetch both: `const [clients, recentCanvases] = await Promise.all([listClients(), listRecentCanvases()])`.
- Replace the current `<header>` + conditional table block with
  `<ClientsHomeTabs clients={clients} recentCanvases={recentCanvases} />`.
- Keep `dynamic = "force-dynamic"`.

## Testing

- Unit-test `listRecentCanvases` shaping: flattening the embedded `clients` relation
  into `client_slug` / `client_name` / `client_logo_url`, `updated_at desc` ordering,
  and the `limit` cap. (Mock the Supabase client the same way existing db tests do, if
  any; otherwise test the pure mapping by extracting it.)
- The new accessors for the recent list are covered by the existing `filterAndSort`
  tests — add a case only if shaping differs.
- The tab wrapper and row component are presentational; no unit tests beyond a smoke
  render if the project has a component-test setup.

## Files touched

- `src/lib/db/canvases.ts` — add `listRecentCanvases` + `RecentCanvas` type.
- `src/components/clients/clients-home-tabs.tsx` — new.
- `src/components/canvases/recent-canvases-table.tsx` — new.
- `src/app/page.tsx` — fetch both lists, render the wrapper.
