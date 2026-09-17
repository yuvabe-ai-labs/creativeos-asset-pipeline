# Design: Market media archive — owning the bytes

**Date:** 2026-09-11
**Status:** Proposed; provider feasibility CONFIRMED by live spikes (§1, 2026-09-11). Decisions to be recorded as **D264–D272** in the ADR log
(`2026-05-30-creativeos-staging-roadmap.md` §7).
**Extends:** Market Signals V1 (`2026-08-27-market-signals-v1-design.md`, D184–D190) and
Handle Performance (`2026-09-03-handle-performance-design.md`, D235–D238, D252–D253).
**Companion diagrams — "Permalink to Bytes":**
https://claude.ai/code/artifact/29c7571d-2b2d-45ea-9eb9-b662586f47f9
Six diagrams covering both halves of this spec: how the two capture surfaces converge on
one ingest today, what is inside `ingestReference`, what we own versus what we borrow, and
then the target state — the clip path with its one added enqueue, the archive lifecycle
with the tile rendering for each state, and the per-kind resolver table. Read it alongside §2–§11;
it carries the pictures this document deliberately does not duplicate in prose.
**Branch:** `feat/market-media-archive` (worktree off `staging`).

---

## 0. The one-line architecture

**The clip stays synchronous and fast; a background Trigger.dev task downloads the actual
media and re-hosts it to GCS, and playback reads only from our copy.**

The market-research team keeps collecting at the speed they collect today. The bytes
arrive when they arrive. Nothing in the capture path waits on a provider.

## 1. Evidence (spikes, 2026-09-11 — all three passed)

Run live against real clipped URLs taken from our own `moodboard_items`, not invented
ones. Scripts: `scripts/spike-instagram-permalink.mjs`, `scripts/spike-youtube-download.mjs`.

### 1.0 The current damage, measured

> **Corrected 2026-09-15.** The original figures below were read from the project
> `.env.local` points at (`udxnhxferhiqjvnztyhm`, the everyday dev database), **not**
> staging — the ad-hoc script followed the same convention as `scripts/db-inspect.mjs`,
> which reads `.env.local`. The conclusion survives but is weaker than first stated, and
> the two databases differ enough to matter.

On the **dev** project, 111 items:

| kind | rows | with a thumbnail |
|---|---|---|
| `instagram` | 62 | **0** |
| `youtube` | 20 | 15 |
| `link` (Pinterest pins) | 29 | 29 |

On **staging** (`noxqniccdbdegvvgowki`), 120 items, measured after the migration:

| kind | rows | missing a thumbnail |
|---|---|---|
| `instagram` | 88 | 9 |
| `youtube` | 23 | 5 |
| `image` | 4 | 3 |
| `link` (4 of 5 are pins) | 5 | 0 |

So the Instagram ladder is **catastrophically** broken on dev and **intermittently**
broken on staging — 9 of 88, roughly one clip in ten, silently permanent. That is still
a real defect with no retry path, and D272 still earns its place; it is simply a
one-in-ten repair on staging rather than a total one. The dev figure is likely what a
run of clips looks like when Meta is actively refusing, which is the failure mode the
ladder cannot survive and the archive can.

**Note the Pinterest gap this exposes**: every pin already on the shelf was clipped
before `pinterest` existed as a kind, so those rows are stored as `link` and the
resolver returns `null` for them — they archive as `skipped`, forever. Reclassifying
existing rows is a follow-up this design does not cover (§16).

### 1.1 Instagram — `apify/instagram-scraper`, single permalink

Input `{directUrls:[reelUrl], resultsType:"posts", resultsLimit:1, addParentData:false}`
against `https://www.instagram.com/reel/DZF-BbBxWJl/` → **1 dataset item, 17.6s.**

* `type: "Video"`, `productType: "clips"`, `videoDuration: 17.1`, `shortCode`.
* **`videoUrl` → HTTP 200, `video/mp4`, 4,158,066 bytes.** Fetchable with no UA, no
  Referer, no cookies.
* **`displayUrl` → HTTP 200, `image/jpeg`, 141,664 bytes** — a working thumbnail source,
  which is what makes this call the fix for §1.0.
* Billing is 1 result per permalink, matching the profile-scrape finding in D235.

> **Do not send a `Range` header.** The first probe failed with a bare `fetch failed`
> until the ranged request was dropped; the Instagram CDN rejects ranged GETs outright.
> The downloader must read the whole body.

A permalink that does not exist returns a row of
`{url, username, error:"not_found", errorDescription:"Post does not exist"}` rather than an
empty dataset — so the resolver must check for an `error` key, not just for absence.

### 1.2 YouTube — `streamers/youtube-video-downloader`

Input `{videos:[{url}], preferredFormat:"mp4", preferredQuality:"720p", storeInKVStore:false}`
against `https://www.youtube.com/shorts/8KuMqb6zxJc` → **1 dataset item, 38.4s.**

* **Shorts ARE supported** (the actor's page never says so — this settles it).
* The field is **`downloadedFileUrl`** → HTTP 200, `video/mp4`, 846,121 bytes for a 20s
  Short. Also returns `durationSeconds`, `id`, `fileKey`.
* `videoOnlyUrl` and `audioOnlyUrl` are **HLS manifests** (`application/vnd.apple.mpegurl`),
  not progressive files — unusable without muxing. Ignore both.
* `storeInKVStore: false` **did not prevent** key-value storage, and the payload carries a
  `note`: *"THE FILE IN KEY-VALUE STORE WILL EXPIRE IN ~3 DAYS."* Harmless here because we
  download within seconds, but it confirms the actor's storage can never be our archive.

The `maximedupre/youtube-shorts-downloader` fallback was therefore not needed and is not
in scope; the spike script retains a `--fallback` flag if that ever changes.

### 1.3 Pinterest — og:image, free rung

* og:image is present but only matches the **reversed attribute order**
  (`content=… property="og:image"`). `ogImage()` in `thumbnail.ts` already tries both
  orderings, which is why 29/29 pins have thumbnails. A single-regex implementation would
  silently find nothing.
* og:image returns the **`/736x/` sized variant** (29 KB and 87 KB on two real pins) —
  thumbnail-grade, not media-grade.
* **Swapping `/736x/` → `/originals/` works and is worth doing:** 29 KB → 292 KB and
  87 KB → 600 KB. But the **extension is not predictable** — one pin's original is `.png`,
  the other's is `.jpg`, and the wrong extension returns HTTP 403. The resolver must probe
  `jpg`, `png`, `webp` in order and fall back to the 736x URL if all fail.
* Real clipped pins use the **regional host `in.pinterest.com`**, so `classifyUrl` must
  match the host by suffix, never by equality with `pinterest.com`.

## 2. The problem

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

> Diagram: *"Ours versus borrowed"* in the companion artifact draws this split — the row
> and the JPEG on our side, the mp4 and the player on the platform's, and the empty box in
> between that this feature fills.

## 3. What already exists (and is therefore not in scope to build)

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

## 4. Data model — migration `0039_market_media_archive.sql`

State lives on `moodboard_items`. There is **no separate jobs table**: one item has at
most one archive, the lifecycle is five states long, and `generations` is unusable anyway
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

-- Pinterest becomes a first-class kind (D267). The 0034 CHECK was created inline,
-- so Postgres auto-named it moodboard_items_kind_check.
alter table moodboard_items drop constraint if exists moodboard_items_kind_check;
alter table moodboard_items
  add  constraint moodboard_items_kind_check
  check (kind in ('image','gif','video','youtube','instagram','tiktok','link','pinterest'));

-- The sweep's selection query, and only that. Partial so it stays small as `ready` grows.
-- `downloading` is included so the sweep can also find rows a crashed task abandoned
-- mid-flight (§10) — without it those are invisible and stay stuck forever.
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

## 5. The capture path — unchanged, plus one line

`ingestReference` keeps its D185 contract exactly: classify, save the row, best-effort
thumbnail, return. The thumbnail stays **inside the request on purpose** — it is what
makes a freshly clipped tile look finished immediately, which is what hides the archive
latency from the team.

One line is added after the thumbnail step:

```ts
await tasks.trigger("archive-reference", { itemId: item.id, clientId: args.clientId });
```

> Diagram: *"Clip returns immediately; bytes arrive later"* shows this as two bands — what
> stays inside the POST, and what moves below it.

**Enqueued from inside `ingestReference`, not from the two routes.** Both surfaces inherit
it, there is one place to reason about, and it cannot drift between Market and the
extension. The enqueue is wrapped in try/catch and a failure is *logged, not thrown* —
D185's spirit extends to it, and the nightly sweep (§10) is the backstop that makes a
dropped enqueue self-healing rather than permanent.

## 6. The archive task — `trigger/archive-reference.ts`

Modelled on `snapshot-handles`, **not** on `video-generate`: it writes directly to
Supabase and GCS and calls no webhook.

```
claim   → archive_status = 'downloading', archive_attempts += 1, archive_started_at = now()
resolve → resolveMediaSource(item) — per-kind ladder (§7)
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

**It also repairs the thumbnail.** When `thumbnail_url IS NULL` and the resolver's payload
carried a still (`displayUrl` for Instagram, the 736x og:image for Pinterest, the derived
`i.ytimg.com` URL for YouTube), the task re-hosts that too and fills the column. This costs
one extra upload on a call we are already making, and it is the only route by which the 62
Instagram items currently showing a favicon card (§1.0) ever get a picture — the capture
ladder has no retry and will not fix them.

**Failure:** any throw records `archive_status = 'failed'` with `archive_error` set to the
reason. Nothing is silent, and nothing is permanent.

**Why no webhook matters twice.** It is simpler, *and* callback-based tasks are known not
to complete against a local dev server (dev trigger key + unreachable localhost
`APP_URL`). A task that writes straight to Supabase and GCS is testable from a dev
machine.

## 7. Per-kind media resolution — `src/lib/market/media.ts`

One laddered function shaped like `resolveThumbnailSource`, returning
`{ url, contentType } | null`. Two of the rungs cost nothing and need no provider:

| kind | Source (field names verified in §1) | Cost |
|---|---|---|
| `image` / `gif` | `image_url` itself | free |
| `video` | the direct file URL | free |
| `pinterest` | og:image, then upgrade `/736x/` → `/originals/` by probing extensions | free |
| `instagram` | `apify/instagram-scraper` → **`videoUrl`**, else **`displayUrl`** | ~$0.0027/clip |
| `youtube` | `streamers/youtube-video-downloader` → **`downloadedFileUrl`** | ~$2.50/1k per MB-unit |
| `tiktok` / `link` | none — `archive_status = 'skipped'` | — |

The Instagram call is a **new function in the existing `apify.ts`**, not a new module:
same actor, same token, same `run-sync-get-dataset-items` endpoint, different input shape
(a single permalink instead of a profile URL). It must treat a returned `error` key as a
failure — a dead permalink yields a row, not an empty dataset (§1.1).

**The downloader sends no `Range` header** (§1.1) and no custom User-Agent: both
verified unnecessary, and the ranged request actively breaks Instagram.

**Pinterest's `/originals/` upgrade is a probe, not a rewrite.** The extension does not
follow from the 736x URL — `.png` and `.jpg` both occur and the wrong one returns 403 — so
`resolvePinterestOriginal()` tries `jpg`, `png`, `webp` in order with a `HEAD`-style
request and falls back to the 736x URL when all three fail. Worth the three requests: it
is a 7–10× resolution gain for free.

**The provider's direct-to-cloud option is declined.** `streamers/youtube-video-downloader`
accepts `googleCloudServiceKey` + `googleCloudBucketName` and would write into our bucket
itself. Rejected on three grounds: it hands a third party write credentials to the bucket
holding every client asset; the object bypasses `paths.ts` naming and `ownership.ts`; and
Instagram needs a download loop regardless, so taking it would mean maintaining two
archival mechanisms with two failure modes for one feature.

A size ceiling (`MARKET_MEDIA_SIZE_LIMIT`, proposed 200 MB) goes in
`src/lib/market/constants.ts` alongside the existing `THUMBNAIL_SIZE_LIMIT`, and a
too-large response is a `failed` with a clear reason rather than an OOM.

## 8. Pinterest becomes a real kind

`REFERENCE_KINDS` gains `pinterest`; `classifyUrl` matches `pinterest.com` +
`/pin/<id>`; `KindBadge` gets an icon. The extension already clips pins correctly
(`findPinterestTarget` in `clip-button.js`) — the capture side has been a step ahead of
the storage side, and this closes the gap. Still pins are images, so og:image is both the
thumbnail and the media. **Video pins are out of scope for v1.**

## 9. Playback — archive-first, no embed fallback

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

## 10. Backfill and retry — `trigger/archive-sweep.ts`

A `schedules.task` (cron, off-peak, following `snapshot-handles`' `0 5 * * *` precedent)
selects rows where `archive_status in ('pending','failed')` and `archive_attempts <
MAX_ARCHIVE_ATTEMPTS` (proposed 4), and re-queues each. Per-row try/catch so one bad item
cannot starve the sweep, exactly as the handle sweep does.

This one task is three things at once, which is why it is worth its weight:

- **Backfill** for every item already on the shelf — they default to `pending`, so the
  first sweep picks up the entire existing corpus with no separate migration script.
- **Retry** for transient provider failures — the capability §2 says is missing today.
- **Self-healing** for a dropped `tasks.trigger` enqueue.

There is no equivalent of `reconcile-stuck-generations` for free: that reconciler keys off
`stuck_reservations`, a *credit-ledger* view, and an archive job reserves no credits. So
the same sweep does that job too — rows with `archive_status = 'downloading'` and
`archive_started_at` older than `STUCK_ARCHIVE_MINUTES` (proposed 30) are moved to
`failed` with `archive_error = 'abandoned mid-download'`, which makes them eligible for
the retry branch on the next pass.

## 11. UI — the smallest thing that works

**No realtime, no polling.** `useMarket` already refetches the whole board after every
`addReference` (`use-market.ts:39`), so a team that keeps collecting keeps refreshing the
states for free — the very behaviour being optimised for is also the refresh mechanism.

This matters beyond convenience: `moodboard_items` is not in the `supabase_realtime`
publication and has **zero RLS policies** by design (default-deny, service-role only,
0026). Every realtime consumer in this app needed both a publication entry *and* an
`authenticated` SELECT policy, and `moodboard_items` has no `org_id`/`client_id` — it is
two hops to org. Realtime here would mean writing the first-ever RLS policy for the market
tables, which is a security change, not a hook.

> Diagram: *"Four states, and what the tile shows in each"* draws the state machine and
> the four tile renderings side by side, including the sweep's retry edge.

Rendering, in `reference-tile.tsx`: a small chip in the tile's **bottom-left corner**
(top-left, top-right and bottom-right are already taken by `KindBadge`, the selection
checkbox and the remove button). `downloading` → a quiet "downloading…" chip; `failed` →
"retrying"; `ready` → nothing at all, because success should be silent; `skipped` →
nothing.

## 12. Deletion

`removeItem` must delete the GCS object as well, or an archived video outlives its row.
`removeObject(urlOrPath)` and `parsePathFromUrl` already exist. The thumbnail has the same
latent leak today; this design fixes both together, since it is the same one-line call.

## 13. Feasibility — settled

All three provider questions that blocked this design are answered in **§1**, against live
endpoints and real clipped URLs. Nothing here now rests on an undocumented assumption:

* Instagram returns a fetchable `videoUrl` for a single permalink. ✓
* YouTube Shorts are supported and expose a progressive mp4 at `downloadedFileUrl`. ✓
* Pinterest needs no provider, and can be upgraded to full resolution for free. ✓

The two spike scripts stay in `scripts/` as executable documentation — they are the way to
find out quickly when a provider moves, which is the failure mode this whole feature
exists to survive.

## 14. Testing

Following `src/lib/market/{ingest,snapshot}.test.ts`: mock `@/lib/storage`, inject
`fetchImpl`, assert on DB-layer calls.

- `classify.test.ts` — pinterest URLs classify as `pinterest`; **the regional host
  `in.pinterest.com` must pass** (§1.3 — this is the case an equality check silently
  breaks, and every real clipped pin uses it); non-pin pinterest.com pages stay `link`.
- `media.test.ts` — each kind resolves to the expected source; the Pinterest
  `/736x/`→`/originals/` probe falls back to the sized URL when all extensions 403; an
  Apify row carrying an `error` key is treated as a failure, not as a missing field;
  `tiktok`/`link` return null; oversized responses reject.
- `archive.test.ts` — happy path writes `media_url` + `ready`; a throw writes `failed` +
  `archive_error` and increments attempts; an already-`ready` row is a no-op; **a row with
  a null `thumbnail_url` also gets one written** (D272).
- `ingest.test.ts` — **regression: a thrown enqueue must not fail the ingest**, and the
  row must still be returned.
- Manual end-to-end on staging: clip a reel, confirm 201 returns without waiting, confirm
  the tile renders from the thumbnail immediately, confirm the row flips to `ready` and
  the lightbox then plays from `storage.googleapis.com`.

## 15. Decisions for the ADR log (§7)

| # | Decision | Rejected |
|---|---|---|
| **D264** | Media archiving is a background Trigger.dev task; the capture path keeps its current shape, speed and D185 contract. | Archiving inline in the POST (stalls the pill, risks the serverless duration ceiling). |
| **D265** | Archive state lives on `moodboard_items` as `media_url` + `archive_status` + error/attempt columns. | A separate jobs table; reusing `generations` (node-scoped, unusable). |
| **D266** | Playback is archive-first with **no embed fallback**. | Embed-first with fallback — undetectable, since a cross-origin iframe reports no error. |
| **D267** | `pinterest` becomes a first-class `ReferenceKind`. | Leaving pins as `link`, which the extension already contradicts. |
| **D268** | One per-kind media ladder; free rungs (image/gif/video/pinterest) before paid ones; `tiktok`/`link` are `skipped`. | A provider call for every kind. |
| **D269** | No realtime and no polling in Market; state appears on the refetch that collecting already triggers. | Supabase Realtime — needs the first-ever RLS policy on `moodboard_items` plus a publication change. |
| **D270** | We download and upload the bytes ourselves; the provider's direct-to-GCS option is declined. | Giving Apify write credentials to the client-asset bucket and bypassing `paths.ts`/`ownership.ts`. |
| **D271** | One nightly sweep serves as backfill, retry and enqueue-loss recovery. | A one-off backfill script plus a separate retry mechanism. |
| **D272** | The archive task also backfills `thumbnail_url` when it is null, from the still already present in the resolver's payload. | Treating the 0/62 broken Instagram thumbnails (§1.0) as a separate fix — the provider call that gets the video already carries the cover frame. |

## 15.1 Verified on staging, 2026-09-15

Migration 0039 applied and checked (`scripts/verify-0039.mjs`): 8 columns present, all
120 existing rows defaulted to `pending`, `kind='pinterest'` accepted — confirming the
`DO` block replaced the old CHECK rather than leaving two — and an invalid
`archive_status` correctly rejected.

A real end-to-end archive ran against staging
(`npx vitest run --config vitest.integration.config.ts`), and the bytes landed in our
bucket:

| kind | stored | type |
|---|---|---|
| `youtube` | 0.17 MB | `video/mp4` |
| `instagram` | 0.23 MB | `image/jpeg` (a still post, so `displayUrl` — the correct fallback) |
| `link` | — | `skipped`, as designed |

**Environment trap found while doing it.** `.env.local` and `.env` pointed at *different*
Supabase projects, and the two runtimes disagree about which wins:

* **Next.js** — `.env.local` overrides `.env`, so the app used the dev project.
* **Trigger.dev** — `trigger.config.ts` loads `.env` first and `process.loadEnvFile`
  never overwrites an already-set key, so tasks used staging.

The result would be a clip written to one database and an archive task looking for it in
another, failing with `item not found` and no hint why. The worktree's `.env.local` is
renamed to `.env.local.disabled-points-at-dev` so both runtimes resolve to staging.
Anyone reproducing this setup must do the same, or point both files at one project.

## 16. Out of scope for v1

- **TikTok media** — no chosen provider, and not what the team clips most.
- **Pinterest video pins** — still pins only.
- **Reclassifying existing rows.** `classifyUrl` runs at insert time, so every pin
  clipped before D267 stays `kind = 'link'` and archives as `skipped` forever. New
  clips are correct. A one-off script that re-runs `classifyUrl` over existing
  `image_url`s and updates `kind` would fix them, and is worth doing — but it rewrites
  historical rows, which deserves its own decision rather than riding along here.
- **Canvas hand-off.** Owning the bytes satisfies "available for later AI processing".
  Exposing an archived reel as a File node or a generation input is a separate feature.
- **Transcoding / thumbnail regeneration from the archived video.** Tempting (the archive
  is a better thumbnail source than the scraping ladder) but a second concern; note it as
  a follow-up rather than widening this.
- **Storage quotas or retention policy.** At ~5 MB/clip and ~$0.002/clip, neither binds
  yet; revisit if a client's board passes ~10k items.
