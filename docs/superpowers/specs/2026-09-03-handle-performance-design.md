# Design: Handle Performance — Market tab

**Date:** 2026-09-03
**Status:** Approved shape, pre-plan. Decisions recorded as **D205–D208** in the ADR log
(`2026-05-30-creativeos-staging-roadmap.md` §7).
**Extends:** Market Signals V1 (`2026-08-27-market-signals-v1-design.md`, D184–D189).
**Branch:** new worktree from `main` (created at plan-execution time).

---

## 0. The one-line architecture

**Performance is a fourth Market tab fed by a daily Apify snapshot pipeline we own.**
The provider returns only *today's* numbers; every trend the tab will ever show exists
because we snapshot on a schedule and keep the time series ourselves. Client's own
Instagram handle first; competitors are V1.x through the same pipeline.

## 1. Evidence (spike, 2026-09-03)

One `apify/instagram-scraper` call (`resultsType: "details"`,
`run-sync-get-dataset-items`, ~9s, pay-per-result ≈ $2.70/1k results free tier) for
`prakritisattva` returned:

* **Account:** `followersCount` 144, `followsCount` 62, `postsCount` 57, biography,
  `businessCategoryName`, `externalUrl`, verified/private flags, HD avatar URL.
* **Posts (~12 embedded):** `type` (Image/Video/Sidecar), `timestamp`, `likesCount`,
  `commentsCount`, `videoViewCount` (videos only), caption, hashtags, `shortCode`,
  `displayUrl`.
* **Caveats that shape the design:** `likesCount: -1` = hidden likes (sentinel, not a
  count); `displayUrl` is an expiring Instagram CDN link; no reach/impressions/saves
  (owner-auth only — permanent ceiling for public scraping); no history — snapshots only.

## 2. Data model — migration `0035_handle_performance.sql`

Filenames, not numbers, are migration identity; 0035 is the next free number.
Both tables get default-deny RLS (enable, zero policies) per 0017's pattern.

### 2.1 `account_snapshots` — the time series

```sql
create table account_snapshots (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  platform        text not null default 'instagram'
    check (platform in ('instagram')),
  handle          text not null,
  followers_count int  not null,
  follows_count   int  not null,
  posts_count     int  not null,
  raw             jsonb not null,
  captured_at     timestamptz not null default now()
);
create index account_snapshots_series_idx
  on account_snapshots (client_id, platform, handle, captured_at desc);
```

* `platform` is a check-constrained column from day one so TikTok/competitor expansion
  is an `alter … drop constraint`, not a migration of shape.
* `raw` keeps the full Apify item (D207). V1 normalizes only what it renders; per-post
  metric *history* (e.g. a reel's views over its first week) stays recoverable from raw
  without re-scraping.
* Follower trend = `select followers_count, captured_at … order by captured_at`.

### 2.2 `tracked_posts` — latest per-post metrics

```sql
create table tracked_posts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  platform         text not null default 'instagram'
    check (platform in ('instagram')),
  handle           text not null,
  short_code       text not null,
  post_type        text not null check (post_type in ('image', 'video', 'carousel')),
  caption          text not null default '',
  post_url         text not null,
  likes_count      int,            -- null = hidden (provider sentinel -1 dies at the boundary)
  comments_count   int not null default 0,
  video_view_count int,            -- videos only
  posted_at        timestamptz not null,
  thumbnail_url    text,           -- GCS re-hosted; source displayUrl expires
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (client_id, platform, short_code)
);
```

* Upserted by `short_code` each run: metrics + `last_seen_at` overwrite, `first_seen_at`
  and `thumbnail_url` persist (thumbnail re-hosted only when absent — one GCS write per
  post ever, via the existing `src/lib/market/thumbnail.ts` pipeline, per AGENTS.md
  reuse rules).
* Provider `type` values (`Image`/`Video`/`Sidecar`) normalize to
  `image`/`video`/`carousel`.

### 2.3 Handle source — no new registration UI (D206)

The client's handle is **`clients.brand_details.instagram`** (D130), the field the Brand
panel already edits. A pure parser normalizes what humans type — `@prakritisattva`,
`prakritisattva`, `https://www.instagram.com/prakritisattva/` — to a canonical handle.
Empty/unparseable ⇒ the tab shows the "connect handle" empty state; the pipeline skips
the client. Competitor handles get a `tracked_handles` table in V1.x, seeded the same
way; V1 deliberately does not create it (YAGNI — one handle per client needs no table).

## 3. Ingestion — Trigger.dev scheduled task

One scheduled task (`snapshot-handles`), **daily**:

1. List clients with a parseable `brand_details.instagram`.
2. Per client: call Apify `apify/instagram-scraper`
   (`POST /v2/acts/apify~instagram-scraper/run-sync-get-dataset-items`,
   `{directUrls: [profileUrl], resultsType: "details"}`, `APIFY_TOKEN` env secret).
3. Normalize (sentinels → null, type mapping, handle canonicalization) — pure module,
   `src/lib/market/performance.ts`.
4. Insert one `account_snapshots` row (raw included); upsert `tracked_posts`; re-host
   thumbnails for new posts only.
5. Per-client failures are logged and skipped — one bad handle must not starve the rest.

**Manual refresh:** the tab's ↻ triggers the same task for one client, guarded to at
most one manual run per client per hour (it is pay-per-result). Trigger task → writes
straight to Supabase; no `APP_URL` callback, so the localhost limitation that affects
async video-gen does not apply.

**Cadence rationale:** the client posts ~monthly; daily captures every follower change
that matters at this scale for ~$0.08/month/handle. The 4-hourly cadence in listening
pipelines is for spike *alerting*, which V1 does not do.

## 4. Read path & computation

`GET /api/clients/[id]/performance` — `withClient` + `withTryCatch`, `apiOk`/`apiError`:

```ts
{
  handle: string | null,            // canonical, or null → "connect" empty state
  latest: AccountSnapshot | null,   // null → "first snapshot pending" empty state
  series: { capturedAt: string; followers: number }[],
  posts: TrackedPost[],             // newest first
  stats: {
    engagementRate: number | null,  // (median likes + median comments) / latest followers
    medianLikes: number | null,     // hidden-likes posts excluded from medians
    cadencePerMonth: number | null, // from posted_at spread
    followerDelta7d: number | null, // null until ≥2 snapshots ≥1d apart
  }
}
```

All derivations live in `src/lib/market/performance.ts` as pure functions over rows —
per-post multiplier vs median (`likes / medianLikes`) is computed client-side from the
same numbers so tile and header can never disagree. Unit fixtures come from the real
spike payload, including the `-1` sentinel row.

## 5. UI — Layout A + multiplier pill (visual brainstorm, 2026-09-03)

`performance` joins `MarketTab` in `market-view.tsx`; a fourth `TabsTrigger`
("Performance") renders `<PerformanceView>`; existing tabs untouched.

New components, `src/components/market/`:

* **`performance-view.tsx`** — top to bottom: identity strip (avatar, @handle,
  category, external link) → four stat cards (Followers +Δ, Engagement, Posts,
  Cadence) → follower trend line (inline SVG, one series, no chart dependency) →
  posts grid → "Last updated · ↻ Refresh". Stat cards are white `shadow-card`
  `rounded-xl` per the system; the delta is the only green on the card.
* **`performance-post-tile.tsx`** — thumbnail (+ Reel badge reusing `kind-badge`
  conventions), likes/comments/views row, **multiplier pill** ("3.5× median" green /
  "below median" neutral / "likes hidden" dashed neutral), clamped caption, date.
* **Empty states:** no handle → dashed-border primary chip CTA "Connect the client's
  Instagram in Brand Kit" (links there); handle but no snapshot → "First snapshot
  pending" + Refresh affordance.

All controls are shadcn primitives; purple stays scarce (tab active state, refresh
focus ring); semantic green appears only in delta + over-performer pill.

## 6. Decisions (ADR log §7)

* **D205 — Apify snapshots, series owned by us.** `apify/instagram-scraper`
  (`details` mode, sync endpoint) scraped daily per handle into `account_snapshots` /
  `tracked_posts`. *Rejected:* Instagram Graph API (owner-auth only, no competitors);
  4-hourly listening cadence (pays to re-read a ~monthly poster); provider-side
  history (none exists — snapshots are the product).
* **D206 — `brand_details.instagram` is the only handle source.** Normalized at read.
  *Rejected:* a handle field on the Market page (second copy of D130 data, drift).
* **D207 — Raw payload retention, normalize at the boundary.** Full Apify item in
  `account_snapshots.raw`; sentinels (`-1` likes) become nulls in columns.
  *Rejected:* normalizing everything now (YAGNI), discarding raw (unrecoverable
  per-post history).
* **D208 — Performance is a tab, not a listening system.** Sentiment (no comment
  volume on this account), share-of-voice/hashtag intelligence, website diffing, and
  alerting are explicitly out of V1. Competitor handles are V1.x via a
  `tracked_handles` table over the same pipeline.

## 7. Testing

* **Pure module (TDD):** handle parser (@/bare/URL/garbage), sentinel normalization,
  type mapping, medians excluding hidden likes, engagement rate, cadence, multiplier —
  fixtures from the spike payload.
* **Route:** shape + empty-state variants (no handle / no snapshots) via existing
  route-test patterns.
* **Task:** ingestion logic factored pure (fetch → normalize → rows) so the Trigger
  task body is a thin shell; the pure part unit-tested, incl. per-client failure
  isolation.

## 8. Out of scope (recorded)

Competitor handles (V1.x), TikTok/other platforms (schema-ready, not built), comments/
sentiment, hashtag/share-of-voice, alerts, website diffing, AI commentary on metrics
(D204 flavour hook exists when history makes it worth interpreting).
