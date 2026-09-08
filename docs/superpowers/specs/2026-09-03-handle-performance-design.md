# Design: Handle Performance — Market tab

**Date:** 2026-09-03 (revised 2026-09-08 — handle-driven model)
**Status:** Approved shape. Decisions recorded as **D235–D238** plus **D252–D253** in the
ADR log (`2026-05-30-creativeos-staging-roadmap.md` §7).
**Extends:** Market Signals V1 (`2026-08-27-market-signals-v1-design.md`, D184–D189).
**Branch:** `worktree-handle-performance`.

> **Revision note (2026-09-08).** The original design keyed performance to a single
> handle read from `clients.brand_details.instagram` (D236) and deferred competitors to
> V1.x (D238). Both are superseded: **handles are entered on the Market page, and each
> tracked handle gets its own sub-tab under Performance.** See D252/D253. The storage
> layer is unchanged — `platform` and `handle` were already first-class columns.

---

## 0. The one-line architecture

**Performance is a fourth Market tab containing one sub-tab per tracked handle, each fed
by a daily Apify snapshot pipeline we own.**
The provider returns only *today's* numbers; every trend the tab will ever show exists
because we snapshot on a schedule and keep the time series ourselves. A handle is added
on the Market page and starts being tracked immediately — the client's own account and a
competitor's are the same kind of thing.

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

Nothing in the payload is owner-scoped, which is *why* a competitor handle costs exactly
what the client's own handle costs. That symmetry is the basis of D253.

### 1.1 Re-verified live, 2026-09-08 (`scripts/spike-instagram.mjs`)

Every claim above was re-checked against a live call, because a fixture freezes an
assumption about the provider and stays green even when the provider moves:

* **Billing settled: one `details` scrape = 1 dataset item**, with the 12 posts embedded
  inside it, *not* billed individually. The actor's API page and its store listing
  contradicted each other on this (a 13× difference); the run resolved it. At $2.70/1k
  on the free plan that is **~$0.081/month per handle** at daily cadence — the free $5
  credit covers ~61 handles. Cost scales with handles (D253), but not bindingly.
* **Every rendered field present:** `businessCategoryName`, `externalUrl`,
  `profilePicUrlHD`, all three stat-card counts, and `shortCode`/`type`/`url`/`timestamp`
  on all 12 posts. `displayUrl` on 12/12 (so every tile gets a re-hosted thumbnail);
  `videoViewCount` on 1/12 (videos only, as the normalizer assumes).
* **All three provider `type` values appeared** (`Video`, `Sidecar`, `Image`) and all map
  — no unmapped value silently falling back to `image`.
* **The `-1` hidden-likes sentinel is real live data**, not a spike artifact: 1 of 12
  posts. Its post is exactly why medians exclude hidden-likes posts.
* **`reach` / `impressions` / `saves` / `shares` absent**, confirming the owner-auth
  ceiling. No future design should plan around them.
* **`followersCount` read 146, against 144 on 2026-09-03.** The fixture stays at 144 by
  design. The +2 is the premise in miniature: that movement is already unrecoverable, and
  is only ever drawable because we snapshot.

Re-run the spike before any change that leans on a provider field the tab does not
already render.

### 1.2 Full field inventory — what the payload makes possible

Every field below is **already captured and retained in `account_snapshots.raw`** (D237) at
no extra cost. "V1" marks what the tab renders today; everything else is available with a
read-path change and **no re-scrape**. Recorded so future scope conversations start from
evidence rather than guesses.

**Account level** — 21 fields returned:

| Field | V1 | What it is / could power |
|---|---|---|
| `username`, `followersCount`, `followsCount`, `postsCount` | ✅ | Identity strip + all four stat cards |
| `businessCategoryName`, `profilePicUrlHD` | ✅ | Identity strip |
| `externalUrl` | ✅ | First link only — see `externalUrls` below |
| `externalUrls` | — | **An array of titled links** (this account has 2: "Etsy" and "Website" → a Labor Day sale page). The identity strip could show all of them, with their titles. |
| `biography` | — | Full bio text, emoji included. Positioning evidence. |
| `id`, `fbid` | — | **Stable account ids that survive a handle rename.** See the caveat below. |
| `isBusinessAccount`, `verified`, `private` | — | Account-type badges; `private` explains an empty scrape. |
| `fullName`, `url`, `profilePicUrl`, `inputUrl`, `externalUrlShimmed` | — | Display name, canonical URL, low-res avatar, echoes of our own input. |
| `latestIgtvVideos` | — | Empty for this account. |

**Post level** — 23 fields per post, 12 posts spanning **343 days**:

| Field | V1 | What it is / could power |
|---|---|---|
| `shortCode`, `type`, `url`, `timestamp` | ✅ | Tile identity, ordering, cadence |
| `likesCount`, `commentsCount`, `videoViewCount` | ✅ | Metrics row + multiplier pill |
| `displayUrl` | ✅ | GCS re-host source (12/12 present) |
| `caption` | ✅ | Clamped tile caption |
| `hashtags` | — | **86 unique tags across 12 posts**, every post tagged, max 16 on one. The densest unused field by far. |
| `childPosts` | — | **Carousel slides, fully populated** — 2/2/6/4/2 across the five Sidecars. 12 posts really means **28 images**. |
| `productType` | — | `"clips"` on the one Video, `null` elsewhere — the field that identifies a *true Reel* rather than a plain video. |
| `paidPartnership` | — | `false` throughout here; the tell for a **competitor running sponsored content**. |
| `videoUrl`, `images`, `dimensionsWidth/Height` | — | Playable video file, media variants, aspect ratio. |
| `mentions` | — | Empty on all 12 posts for this account. |
| `isCommentsDisabled`, `id`, `ownerId`, `ownerUsername` | — | Housekeeping. |

Carousel children carry their own `likesCount`, `caption`, `hashtags`, **`alt`** (accessibility
text) and `latestComments`.

**Three findings that constrain design, not just enable it:**

* **`latestComments` is absent from top-level posts in `details` mode**, and total comment
  volume across all 12 posts is **1**. D238's exclusion of sentiment is confirmed by data,
  not assumed — there is nothing to analyse.
* **Hashtag case is not normalized by the provider.** `#prakritisattva` (7) and
  `#PrakritiSattva` (4) are returned as distinct tags but are one tag used 11 times. Any
  future tag feature needs the same lowercasing `parseInstagramHandle` applies to handles.
* **A handle rename silently starts a new series.** Our keys are
  `(client_id, platform, handle)`, but `id`/`fbid` are the account's stable identity. If a
  tracked account renames, the sweep either 404s or begins a fresh, disconnected history.
  V1 accepts this; the fix, if it ever bites, is to store `id` on `tracked_handles` and
  reconcile by it. Recorded rather than solved — nothing has hit it yet.

## 2. Data model — migration `0038_handle_performance.sql`

Filenames, not numbers, are migration identity; 0038 is the next free number
(0035–0037 went to review annotations while this design was in flight).
All three tables get default-deny RLS (enable, zero policies) per 0017's pattern.

### 2.1 `tracked_handles` — the enrolment list (D252)

```sql
create table tracked_handles (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  platform   text not null default 'instagram'
    check (platform in ('instagram')),
  handle     text not null,
  added_at   timestamptz not null default now(),
  unique (client_id, platform, handle)
);
create index tracked_handles_client_idx on tracked_handles (client_id, added_at);
```

* This is the table D238 deferred to V1.x. It is V1 now, because the tab strip needs a
  list to render and "the client's own handle" is no longer a distinguished case.
* **No `is_primary` / `label` column.** Tab order is `added_at`; the first handle added
  is the client's own by convention, not by constraint. Add the flag when something
  actually needs to distinguish them (YAGNI — nothing in V1 does).
* Deleting a row unenrols the handle. Its `account_snapshots` / `tracked_posts` rows are
  deliberately **not** cascaded — history survives an accidental removal and is picked
  back up if the handle is re-added. Cleanup, if ever wanted, is a separate decision.

### 2.2 `account_snapshots` — the time series

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

* `platform` is a check-constrained column from day one so TikTok expansion is an
  `alter … drop constraint`, not a migration of shape.
* The `(client_id, platform, handle, …)` index was written for the deferred competitor
  case and is exactly the index the sub-tab read path needs — no change required.
* `raw` keeps the full Apify item (D237). V1 normalizes only what it renders; per-post
  metric *history* (e.g. a reel's views over its first week) stays recoverable from raw
  without re-scraping. The identity strip (§5) reads `businessCategoryName`,
  `externalUrl` and `profilePicUrlHD` back out of it.
* Follower trend = `select followers_count, captured_at … where handle = $1 order by
  captured_at`.

### 2.3 `tracked_posts` — latest per-post metrics

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
create index tracked_posts_handle_idx on tracked_posts (client_id, handle, posted_at desc);
```

* Upserted by `short_code` each run: metrics + `last_seen_at` overwrite, `first_seen_at`
  and `thumbnail_url` persist (thumbnail re-hosted only when absent — one GCS write per
  post ever, via the existing `src/lib/market/thumbnail.ts` pipeline, per AGENTS.md
  reuse rules).
* A shortcode identifies one post on one account, so the existing uniqueness on
  `(client_id, platform, short_code)` stays correct across multiple handles.
* Provider `type` values (`Image`/`Video`/`Sidecar`) normalize to
  `image`/`video`/`carousel`.

### 2.4 Handle source — entered on Market (D252)

A handle is added through the Performance tab's **+ Add handle** affordance, parsed by
the same pure normalizer used everywhere else — `@prakritisattva`, `prakritisattva`,
`https://www.instagram.com/prakritisattva/` all canonicalize to `prakritisattva`.

`clients.brand_details.instagram` (D130) is **no longer the source of truth**, because a
contact field on the client cannot express "and these three competitors". It survives as
a **prefill suggestion**: when the client has one and it is not yet tracked, the add
dialog offers it pre-filled. Brand Kit stays contact info; Market owns tracking.

## 3. Ingestion — Trigger.dev scheduled task

One scheduled task (`snapshot-handles`), **daily at 05:00 UTC**:

1. List every row in `tracked_handles`.
2. Per row: call Apify `apify/instagram-scraper`
   (`POST /v2/acts/apify~instagram-scraper/run-sync-get-dataset-items`,
   `{directUrls: [profileUrl], resultsType: "details"}`, `APIFY_TOKEN` env secret).
3. Normalize (sentinels → null, type mapping) — pure module,
   `src/lib/market/performance.ts`.
4. Insert one `account_snapshots` row (raw included); upsert `tracked_posts`; re-host
   thumbnails for new posts only.
5. Per-handle failures are logged and skipped — one bad handle must not starve the rest.

**Manual refresh:** each sub-tab's ↻ runs the same orchestrator for that one handle,
guarded to at most one manual run **per handle** per hour (it is pay-per-result). The
task writes straight to Supabase; no `APP_URL` callback, so the localhost limitation that
affects async video-gen does not apply.

**Cost.** ~$0.08/month per handle at daily cadence. Cost now scales with handles tracked,
not clients — which is the one real consequence of D253 and the reason adding a handle is
a deliberate act with a visible list, not an automatic side effect of some other field.

## 4. Read path & computation

* `GET /api/clients/[id]/performance/handles` → `{ handles: TrackedHandle[]; suggestion: string | null }`
  — the sub-tab strip, plus the Brand Kit prefill when untracked.
* `POST /api/clients/[id]/performance/handles` `{ handle }` → parses, dedupes, inserts.
* `DELETE /api/clients/[id]/performance/handles/[handle]` → unenrols (history retained).
* `GET /api/clients/[id]/performance?handle=x` → one handle's payload:

```ts
{
  handle: string,
  identity: {                       // read back out of latest.raw (D237)
    category: string | null,
    externalUrl: string | null,
    avatarUrl: string | null,
  } | null,
  latest: AccountSnapshot | null,   // null → "first snapshot pending" empty state
  series: { capturedAt: string; followers: number }[],
  posts: TrackedPost[],             // newest first
  stats: {
    engagementRate: number | null,  // (median likes + median comments) / latest followers
    medianLikes: number | null,     // hidden-likes posts excluded from medians
    cadencePerMonth: number | null, // from posted_at spread
    followerDelta7d: number | null, // null until a baseline ≥7d older exists
  }
}
```

* `POST /api/clients/[id]/performance/refresh` `{ handle }` → 200 | 404 (untracked) |
  429 (within the hour).

All derivations live in `src/lib/market/performance.ts` as pure functions over rows —
per-post multiplier vs median (`likes / medianLikes`) is computed client-side from the
same numbers so tile and header can never disagree. Unit fixtures come from the real
spike payload, including the `-1` sentinel row.

## 5. UI — Layout A + multiplier pill

Reference: published artifact **"Market Performance Tab"**
(https://claude.ai/code/artifact/33673014-d44a-4945-b9e2-fe507d79a26a). Follow it for
hierarchy, not pixel-for-pixel.

```
Market:        Direct · Adjacent · Signals · [Performance]
                                              │
Performance:   [@prakritisattva] [@competitor] [+ Add handle]
                    │
                    identity strip → stat cards → trend → posts grid → last updated · ↻
```

`performance` joins `MarketTab` in `market-view.tsx`; a fourth `TabsTrigger`
("Performance") renders `<PerformanceView>`; existing tabs untouched.

New components, `src/components/market/`:

* **`performance-view.tsx`** — owns the handle sub-tab strip and the add dialog; renders
  `<HandlePerformance>` for the selected handle.
* **`handle-performance.tsx`** — one handle's content, top to bottom: identity strip
  (avatar, @handle, category, external link) → four stat cards (Followers +Δ,
  Engagement, Posts, Cadence) → follower trend line → posts grid → "Last updated · ↻".
  Stat cards are white `shadow-card` `rounded-xl`; the delta is the only green.
* **`performance-chart.tsx`** — inline single-series SVG with gridlines, value labels and
  a hover readout, per the mockup. No chart dependency for one line.
* **`performance-post-tile.tsx`** — thumbnail (+ kind badge), likes/comments/views row,
  **multiplier pill** ("3.5× median" green / "below median" neutral / "likes hidden"
  dashed neutral), clamped caption, date.
* **`add-handle-dialog.tsx`** — shadcn `Dialog` + `Input`; prefilled with the Brand Kit
  suggestion when there is one; rejects unparseable input inline.

**Empty states:** no handles at all → the Performance tab is just the dashed
`+ Add handle` chip and a line of copy. Handle tracked but no snapshot → "First snapshot
pending for @handle" + Refresh.

All controls are shadcn primitives; purple stays scarce (tab active state, the add chip,
refresh focus ring); semantic green appears only in delta + over-performer pill.

## 6. Decisions (ADR log §7)

* **D235 — Apify snapshots, series owned by us.** *(unchanged)*
* **D236 — `brand_details.instagram` is the only handle source.** **Superseded by D252.**
* **D237 — Raw payload retention, normalize at the boundary.** *(unchanged — and now
  load-bearing: the identity strip reads category/externalUrl/avatar back out of `raw`.)*
* **D238 — Performance is a tab, not a listening system.** *(holds; its "competitors are
  V1.x" clause is superseded by D253.)*
* **D252 — Handles are entered on Market, not read from Brand Kit.** `tracked_handles`
  is the source of truth; `brand_details.instagram` degrades to a prefill suggestion.
  *Rejected:* keeping D236 (a contact field cannot express a competitor set); syncing
  both ways (two writers, guaranteed drift).
* **D253 — Multi-handle sub-tabs in V1.** Each tracked handle is a sub-tab under
  Performance; the client's own account is simply the first one added. *Rejected:*
  handles as top-level Market tabs (crowds a nav that is about evidence *kinds*);
  a primary/competitor distinction (nothing in V1 reads it).

## 7. Testing

* **Pure module (TDD):** handle parser (@/bare/URL/garbage), sentinel normalization,
  type mapping, medians excluding hidden likes, engagement rate, cadence, multiplier —
  fixtures from the spike payload. *(built, 14 tests green)*
* **Routes:** handles CRUD (add/dedupe/reject-garbage/delete), per-handle payload,
  refresh guard — via existing route-test patterns.
* **Task:** ingestion logic factored pure so the Trigger task body is a thin shell; the
  pure part unit-tested, incl. per-handle failure isolation.

## 8. Out of scope (recorded)

TikTok/other platforms (schema-ready, not built), alerts, website diffing, cross-handle
comparison views (each sub-tab stands alone in V1), AI commentary on metrics (D204 flavour
hook exists when history makes it worth interpreting).

**Deferred but already captured.** §1.2 inventories every field the payload returns; the
ones below are retained in `raw` today and need only a read-path change — never a
re-scrape — if they are ever wanted:

* **Hashtag intelligence / share-of-voice** — the densest unused data we hold (86 tags
  across 12 posts). Still out of V1 per D238; the point is that deferring costs nothing.
* **Carousel slides** — `childPosts` is fully populated, so a tile could open all 28
  images rather than showing one frame under a "Carousel" badge.
* **Multiple external links** — `externalUrls` is an array of titled links; V1's identity
  strip shows only the first.
* **`paidPartnership`** — the most interesting of these for *competitor* handles, since it
  flags a rival running sponsored content.
* **True-Reel detection** — `productType: "clips"` distinguishes a real Reel from a plain
  video, which V1's `TYPE_MAP` currently collapses.

**Genuinely unavailable, at any price:** follower history (no public source — the whole
premise of D235), per-post metrics *as they were at the time* (only cumulative totals come
back, though our own snapshots build this going forward), and reach/impressions/saves/
shares (owner-auth only, confirmed absent in §1.1). Comment sentiment is excluded for a
different reason: the data is not there to analyse — 1 comment across 12 posts.
