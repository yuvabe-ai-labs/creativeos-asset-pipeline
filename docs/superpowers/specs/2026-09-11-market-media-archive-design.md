# Design: Market media archive — owning the bytes

**Date:** 2026-09-11
**Status:** Proposed. Decisions to be recorded as **D257–D264** in the ADR log
(`2026-05-30-creativeos-staging-roadmap.md` §7).
**Extends:** Market Signals V1 (`2026-08-27-market-signals-v1-design.md`, D184–D190) and
Handle Performance (`2026-09-03-handle-performance-design.md`, D235–D238, D252–D253).
**Current-state map:** https://claude.ai/code/artifact/29c7571d-2b2d-45ea-9eb9-b662586f47f9
**Branch:** `feat/market-media-archive` (worktree off `staging`).

---

## 0. The one-line architecture

**The clip stays synchronous and fast; a background Trigger.dev task downloads the actual
media and re-hosts it to GCS, and playback reads only from our copy.**

The market-research team keeps collecting at the speed they collect today. The bytes
arrive when they arrive. Nothing in the capture path waits on a provider.

## 1. The problem

A moodboard item stores a URL, not a thing. For an Instagram reel, a YouTube Short or a
Pinterest pin, `image_url` is the *permalink* and the only file we own is a single
re-hosted JPEG cover frame (`thumbnail_url`, D185's bounded exception to URL-only
storage, D92).

Three distinct rot vectors follow, and they fail at different times:

1. **Capture-time.** `resolveThumbnailSource` ladders four rungs for Instagram (oEmbed →
   og:image → `display_url` scraped out of the embed page's JSON). When all four fail the
   item gets a favicon card, *permanently* — `thumbnail_url IS NULL` records no attempt,
   and nothing retries.
2. **Later.** Playback is a live cross-origin iframe. A deleted post, a privated account
   or a gated embed turns the lightbox into a blank box, and the iframe fires no error we
   can observe.
3. **Always.** The media itself was never downloaded. There is nothing to feed to an AI
   pipeline, and nothing that survives the post being removed.

The requirement that settles the shape: **durability is the driver now, but the archived
file must be the real media**, because later AI processing needs the actual frames, not a
cover image.

## 2. What already exists (and is therefore not in scope to build)

| Asset | Where | Why it matters here |
|---|---|---|
| One ingest funnel | `src/lib/market/ingest.ts` `ingestReference()` | Both the Market route and the extension route call it. One change covers both surfaces. |
| Market = moodboards | `ensureSystemBoards()`, `moodboard_items` | Market "Direct"/"Adjacent" are system boards. Archiving at item level fixes Market *and* moodboards with no second pipeline. |
| Apify client | `src/lib/market/apify.ts` | `apify/instagram-scraper` already integrated, `APIFY_TOKEN` already provisioned in both Trigger projects. |
| The exact loop we need, next door | `src/lib/market/snapshot.ts` | Already does *provider URL → download → `uploadMarketThumbnail` → update row*, with an idempotency guard. Media archiving is this loop pointed at a different table. |
| Storage layering | `src/lib/storage/{paths,index}.ts` | Pure path fn + one private `_upload` + a named helper per asset type. Adding media is one path fn and one helper. |
| Background task precedent | `trigger/snapshot-handles.ts` | A `schedules.task` that writes **straight to Supabase and GCS with no webhook**. |

**Not reusable, deliberately:** `_signPutUrl` is for browser→GCS direct PUT to dodge
Vercel's 4.5 MB request-body limit. Our bytes come from a server-side fetch, so no request
body exists. The binding constraint is function *duration*, which is the actual argument
for a background task rather than a larger route.

## 3. Data model — migration `0039_market_media_archive.sql`

State lives on `moodboard_items`. There is **no separate jobs table**: one item has at
most one archive, the lifecycle is four states long, and `generations` is unusable anyway
(`node_id NOT NULL references nodes(id)` — a market item is not a node).

```sql
alter table moodboard_items
  add column if not exists media_url        text,
  add column if not exists media_bytes      bigint,
  add column if not exists media_type       text,
  add column if not exists archive_status   text not null default 'pending',
  add column if not exists archive_error      text,
  add column if not exists archive_attempts   int  not null default 0,
  add column if not exists archive_started_at timestamptz,
  add column if not exists archived_at        timestamptz;

alter table moodboard_items
  drop constraint if exists moodboard_items_archive_status_check;
alter table moodboard_items
  add  constraint moodboard_items_archive_status_check
  check (archive_status in ('pending','downloading','ready','failed','skipped'));

-- Pinterest becomes a first-class kind (D260). The 0034 CHECK was created inline,
-- so Postgres auto-named it moodboard_items_kind_check.
alter table moodboard_items drop constraint if exists moodboard_items_kind_check;
alter table moodboard_items
  add  constraint moodboard_items_kind_check
  check (kind in ('image','gif','video','youtube','instagram','tiktok','link','pinterest'));

-- The sweep's selection query, and only that. Partial so it stays small as `ready` grows.
-- `downloading` is included so the sweep can also find rows a crashed task abandoned
-- mid-flight (§9) — without it those are invisible and stay stuck forever.
create index if not exists moodboard_items_archive_pending_idx
  on moodboard_items(archive_status)
  where archive_status in ('pending','failed','downloading');
```

`archive_started_at` is stamped when the task claims a row and is what makes an abandoned
`downloading` row detectable; `archived_at` is stamped only on success. Two timestamps
because one cannot answer both "when did this begin" and "when did this finish".

A `text` + CHECK constraint rather than a Postgres enum: it matches the `kind` column
immediately above it, and unlike `generations.status` (0007, a comment with no constraint)
it is actually enforced.

> **Operator note.** Migrations here are applied **by hand in the Supabase SQL editor**,
> and the folder has a live history of duplicate numbers (0008, 0027, 0034) and a missing
> 0029. `0039` is free; confirm before applying.

## 4. The capture path — unchanged, plus one line

`ingestReference` keeps its D185 contract exactly: classify, save the row, best-effort
thumbnail, return. The thumbnail stays **inside the request on purpose** — it is what
makes a freshly clipped tile look finished immediately, which is what hides the archive
latency from the team.

One line is added after the thumbnail step:

```ts
await tasks.trigger("archive-reference", { itemId: item.id, clientId: args.clientId });
```

**Enqueued from inside `ingestReference`, not from the two routes.** Both surfaces inherit
it, there is one place to reason about, and it cannot drift between Market and the
extension. The enqueue is wrapped in try/catch and a failure is *logged, not thrown* —
D185's spirit extends to it, and the nightly sweep (§9) is the backstop that makes a
dropped enqueue self-healing rather than permanent.

## 5. The archive task — `trigger/archive-reference.ts`

Modelled on `snapshot-handles`, **not** on `video-generate`: it writes directly to
Supabase and GCS and calls no webhook.

```
claim   → archive_status = 'downloading', archive_attempts += 1, archive_started_at = now()
resolve → resolveMediaSource(item) — per-kind ladder (§6)
download→ fetch the (usually expiring) URL immediately
store   → uploadMarketMedia() → clients/<clientId>/market/media/<itemId>.<ext>
finish  → media_url, media_bytes, media_type, archived_at, archive_status = 'ready'
```

Every `@/lib` import must be a dynamic `await import(...)` — those modules carry
`import "server-only"`, which Trigger's separate build must not evaluate statically
(documented in `reconcile-stuck-generations.ts`).

**Idempotency:** the task early-returns when `archive_status = 'ready'`, mirroring
`snapshot.ts`'s `if (row.thumbnail_url) continue`. The GCS path is deterministic and keyed
by `itemId`, so a re-run overwrites rather than accumulating — the same property
`pathForMarketThumb` already has.

**Failure:** any throw records `archive_status = 'failed'` with `archive_error` set to the
reason. Nothing is silent, and nothing is permanent.

**Why no webhook matters twice.** It is simpler, *and* callback-based tasks are known not
to complete against a local dev server (dev trigger key + unreachable localhost
`APP_URL`). A task that writes straight to Supabase and GCS is testable from a dev
machine.

## 6. Per-kind media resolution — `src/lib/market/media.ts`

One laddered function shaped like `resolveThumbnailSource`, returning
`{ url, contentType } | null`. Two of the rungs cost nothing and need no provider:

| kind | Source | Cost |
|---|---|---|
| `image` / `gif` | `image_url` itself | free |
| `video` | the direct file URL | free |
| `pinterest` | og:image at full resolution — already fetched for the thumbnail | free |
| `instagram` | `apify/instagram-scraper`, permalink in `directUrls` → `videoUrl`, else `displayUrl` | ~$0.0015–0.0027/clip |
| `youtube` | `streamers/youtube-video-downloader`, `{videos:[{url}], preferredFormat:"mp4"}` | ~$2.50/1k per MB-unit |
| `tiktok` / `link` | none — `archive_status = 'skipped'` | — |

The Instagram call is a **new function in the existing `apify.ts`**, not a new module:
same actor, same token, same `run-sync-get-dataset-items` endpoint, different input shape
(a single permalink instead of a profile URL).

**The provider's direct-to-cloud option is declined.** `streamers/youtube-video-downloader`
accepts `googleCloudServiceKey` + `googleCloudBucketName` and would write into our bucket
itself. Rejected on three grounds: it hands a third party write credentials to the bucket
holding every client asset; the object bypasses `paths.ts` naming and `ownership.ts`; and
Instagram needs a download loop regardless, so taking it would mean maintaining two
archival mechanisms with two failure modes for one feature.

A size ceiling (`MARKET_MEDIA_SIZE_LIMIT`, proposed 200 MB) goes in
`src/lib/market/constants.ts` alongside the existing `THUMBNAIL_SIZE_LIMIT`, and a
too-large response is a `failed` with a clear reason rather than an OOM.

## 7. Pinterest becomes a real kind

`REFERENCE_KINDS` gains `pinterest`; `classifyUrl` matches `pinterest.com` +
`/pin/<id>`; `KindBadge` gets an icon. The extension already clips pins correctly
(`findPinterestTarget` in `clip-button.js`) — the capture side has been a step ahead of
the storage side, and this closes the gap. Still pins are images, so og:image is both the
thumbnail and the media. **Video pins are out of scope for v1.**

## 8. Playback — archive-first, no embed fallback

When `archive_status = 'ready'`, `ReferenceLightbox` plays `media_url` through a native
`<video>` (or the existing `FullScreenImageZoom` for stills). Otherwise it shows the
thumbnail with a "still downloading" state and an *Open source* link.

**No embed fallback**, and this is the decision that makes durability real rather than
claimed: a cross-origin iframe never reports that it went blank, so "fall back when the
embed fails" is not implementable. Keeping embeds would mean shipping a durability story
we cannot verify. The cost — losing Instagram's caption/likes chrome in the lightbox — is
accepted.

`embedUrlFor` is **not deleted**: `tiktok` and `link` are never archived, so the iframe
path remains their only player.

## 9. Backfill and retry — `trigger/archive-sweep.ts`

A `schedules.task` (cron, off-peak, following `snapshot-handles`' `0 5 * * *` precedent)
selects rows where `archive_status in ('pending','failed')` and `archive_attempts <
MAX_ARCHIVE_ATTEMPTS` (proposed 4), and re-queues each. Per-row try/catch so one bad item
cannot starve the sweep, exactly as the handle sweep does.

This one task is three things at once, which is why it is worth its weight:

- **Backfill** for every item already on the shelf — they default to `pending`, so the
  first sweep picks up the entire existing corpus with no separate migration script.
- **Retry** for transient provider failures — the capability §1 says is missing today.
- **Self-healing** for a dropped `tasks.trigger` enqueue.

There is no equivalent of `reconcile-stuck-generations` for free: that reconciler keys off
`stuck_reservations`, a *credit-ledger* view, and an archive job reserves no credits. So
the same sweep does that job too — rows with `archive_status = 'downloading'` and
`archive_started_at` older than `STUCK_ARCHIVE_MINUTES` (proposed 30) are moved to
`failed` with `archive_error = 'abandoned mid-download'`, which makes them eligible for
the retry branch on the next pass.

## 10. UI — the smallest thing that works

**No realtime, no polling.** `useMarket` already refetches the whole board after every
`addReference` (`use-market.ts:39`), so a team that keeps collecting keeps refreshing the
states for free — the very behaviour being optimised for is also the refresh mechanism.

This matters beyond convenience: `moodboard_items` is not in the `supabase_realtime`
publication and has **zero RLS policies** by design (default-deny, service-role only,
0026). Every realtime consumer in this app needed both a publication entry *and* an
`authenticated` SELECT policy, and `moodboard_items` has no `org_id`/`client_id` — it is
two hops to org. Realtime here would mean writing the first-ever RLS policy for the market
tables, which is a security change, not a hook.

Rendering, in `reference-tile.tsx`: a small chip in the tile's **bottom-left corner**
(top-left, top-right and bottom-right are already taken by `KindBadge`, the selection
checkbox and the remove button). `downloading` → a quiet "downloading…" chip; `failed` →
"retrying"; `ready` → nothing at all, because success should be silent; `skipped` →
nothing.

## 11. Deletion

`removeItem` must delete the GCS object as well, or an archived video outlives its row.
`removeObject(urlOrPath)` and `parsePathFromUrl` already exist. The thumbnail has the same
latent leak today; this design fixes both together, since it is the same one-line call.

## 12. Spikes required before coding

The house standard here is `scripts/spike-instagram.mjs` — verify against a live provider
rather than a fixture, because a fixture freezes an assumption and stays green after the
provider moves.

1. **`scripts/spike-youtube-download.mjs`** — run `streamers/youtube-video-downloader`
   against one real Short. Its dataset output field names are **not documented**, Shorts
   support is **not stated**, and it is unknown whether a fetchable link comes back with
   `storeInKVStore: false`. The YouTube resolver cannot be written from the docs. If it
   fails, `maximedupre/youtube-shorts-downloader` ($2.65/1k, purpose-built for Shorts,
   returns source-hosted links) is the fallback.
2. **`scripts/spike-instagram-permalink.mjs`** — confirm `apify/instagram-scraper` returns
   `videoUrl` for a single reel permalink via `directUrls`, not only in profile-crawl
   mode. The actor docs list the field; the existing integration only ever calls
   `resultsType: "details"` on a *profile*.

Both record their findings back into this spec, as §1.1 of the handle-performance design
does.

## 13. Testing

Following `src/lib/market/{ingest,snapshot}.test.ts`: mock `@/lib/storage`, inject
`fetchImpl`, assert on DB-layer calls.

- `classify.test.ts` — pinterest URLs classify as `pinterest`; `/pin/` variants; non-pin
  pinterest.com pages stay `link`.
- `media.test.ts` — each kind resolves to the expected source; `tiktok`/`link` return
  null; oversized responses reject.
- `archive.test.ts` — happy path writes `media_url` + `ready`; a throw writes `failed` +
  `archive_error` and increments attempts; an already-`ready` row is a no-op.
- `ingest.test.ts` — **regression: a thrown enqueue must not fail the ingest**, and the
  row must still be returned.
- Manual end-to-end on staging: clip a reel, confirm 201 returns without waiting, confirm
  the tile renders from the thumbnail immediately, confirm the row flips to `ready` and
  the lightbox then plays from `storage.googleapis.com`.

## 14. Decisions for the ADR log (§7)

| # | Decision | Rejected |
|---|---|---|
| **D257** | Media archiving is a background Trigger.dev task; the capture path keeps its current shape, speed and D185 contract. | Archiving inline in the POST (stalls the pill, risks the serverless duration ceiling). |
| **D258** | Archive state lives on `moodboard_items` as `media_url` + `archive_status` + error/attempt columns. | A separate jobs table; reusing `generations` (node-scoped, unusable). |
| **D259** | Playback is archive-first with **no embed fallback**. | Embed-first with fallback — undetectable, since a cross-origin iframe reports no error. |
| **D260** | `pinterest` becomes a first-class `ReferenceKind`. | Leaving pins as `link`, which the extension already contradicts. |
| **D261** | One per-kind media ladder; free rungs (image/gif/video/pinterest) before paid ones; `tiktok`/`link` are `skipped`. | A provider call for every kind. |
| **D262** | No realtime and no polling in Market; state appears on the refetch that collecting already triggers. | Supabase Realtime — needs the first-ever RLS policy on `moodboard_items` plus a publication change. |
| **D263** | We download and upload the bytes ourselves; the provider's direct-to-GCS option is declined. | Giving Apify write credentials to the client-asset bucket and bypassing `paths.ts`/`ownership.ts`. |
| **D264** | One nightly sweep serves as backfill, retry and enqueue-loss recovery. | A one-off backfill script plus a separate retry mechanism. |

## 15. Out of scope for v1

- **TikTok media** — no chosen provider, and not what the team clips most.
- **Pinterest video pins** — still pins only.
- **Canvas hand-off.** Owning the bytes satisfies "available for later AI processing".
  Exposing an archived reel as a File node or a generation input is a separate feature.
- **Transcoding / thumbnail regeneration from the archived video.** Tempting (the archive
  is a better thumbnail source than the scraping ladder) but a second concern; note it as
  a follow-up rather than widening this.
- **Storage quotas or retention policy.** At ~5 MB/clip and ~$0.002/clip, neither binds
  yet; revisit if a client's board passes ~10k items.
