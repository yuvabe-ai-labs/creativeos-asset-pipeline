# Brand KB — social & website asset import (D302–D305)

**Date:** 2026-10-05 · **Branch:** `feat/brand-kb-social-import` · **Status:** approved, implementing

## 1. What and why

While setting up a client's Brand KB we already collect the brand website. We now also collect the
brand's **Instagram** and **Facebook**, and pull the brand's recent images and videos from all three
into the client's **Brand Images** automatically, so the team does not screenshot and upload them by
hand.

Product answers (Cyril, 2026-10-03, "Brand KB: Social Asset Import — Open Questions"):

| Question | Answer |
|---|---|
| Sources | Website, Instagram, Facebook (other handles later) |
| Limit | Last 50 posts / 3 months — implemented as **up to 50 posts from the last 3 months**, whichever limit is hit first |
| Asset types | Images **and** videos |
| AI insights | **Assets only for now** — imported assets are not analysed |
| Refresh | Import on setup, then a **manual refresh** (no schedule) |

Operator constraints: each source scrapes as its **own parallel job** on **Apify**; the whole thing is
**non-blocking** — nothing waits on it, including the KB build.

## 2. Actor research (benchmarked 2026-10-05)

Benchmarked live against Blue Tokai Coffee (bluetokaicoffee.com, Shopify) and **chupps.com** (the
operator's benchmark brand), plus yuvabe.com for a non-Shopify site. Prices are our STARTER plan's
BRONZE tier.

### Instagram — `apify/instagram-scraper` (already used, D235/D264) ✅

`resultsType: "posts"`, `resultsLimit: 50`, `onlyPostsNewerThan: "3 months"`. Full-resolution
`displayUrl`, a direct mp4 `videoUrl` for reels, and `childPosts[]` with per-slide image/video for
carousels. Chupps: 25 posts in the window → 53 images + 18 videos, 34 s. ~$0.0023 / post.
**Gotcha:** pinned posts are returned even when older than the window (2 on Chupps, from Dec 2025
and May 2026) — we filter on `timestamp` ourselves.

### Facebook — `apify/facebook-posts-scraper` ✅

The official actor (14.8k users / 30 d, 4.66★). Has post `time` (needed for the 3-month rule) and a
direct HD mp4 for reels (`media[].videoDeliveryLegacyFields.browser_native_hd_url`). ~$0.004 / post.

- **Photos come back as a 590 px preview** (`ctp=s590x590` in the URL, ~24 KB). Removing the `ctp`
  query parameter keeps the signed URL valid and returns the original (~635 KB). We do that.
- Videos inside multi-media (album) posts carry only a poster frame, no playable URL — skipped.
- A page that is not public to logged-out visitors returns one row
  `{ error: "not_available" }` (Chupps' `facebook.com/thechuppslife` does). That is a per-source
  failure with a readable message, not a crash.
- Brands cross-post Instagram to Facebook: on Blue Tokai 20 of 26 FB media were **the same files**
  as IG ones — same Meta CDN filename (`<id>_<id>_<id>_n.jpg`). We dedupe on that filename.

Rejected: `apify/facebook-photos-scraper` — full-resolution images but no dates and no videos, so the
3-month rule cannot be applied.

### Website — `logiover/website-image-media-extractor` ✅

Built for exactly this: `dedupeAcrossPages` and `mergeResponsiveVariants` collapse every srcset width
and CDN rendition (`?width=`) into **one asset at the largest size**; finds `<img>`, `<picture>`,
`og:image`, favicons, CSS backgrounds and `<video>`. Chupps: 4 pages → 1080×1440 product shots and
the SVG logo, 26 s. Blue Tokai: 110 assets incl. a Shopify mp4, 13 s. ~$0.006 / asset, so runs are
capped with Apify's `maxItems` run option.
Noise it lets through (we filter): tracking pixels (1×1, `.htm`), tiny icons.

Rejected, all on the same two sites:

| Actor | Why not |
|---|---|
| `apify/playwright-scraper` (own page function) | 166–249 s; timed out on both Shopify sites (`networkidle`) |
| `apify/cheerio-scraper`, `apify/web-scraper` | require full Apify-account permission |
| `crawlerbros/website-image-scraper` | one row per srcset size (300 rows, mostly 120–160 px), no video |
| `hlymrk/html-web-media-scraper` | 0 items on yuvabe.com, timed out on Blue Tokai |

**Cost per client import** ≈ IG $0.12 + FB $0.20 + website ≤ $0.48 ≈ **$0.80**, against the plan's
$19/month credit. Recorded so the operator can decide on the plan before this sees volume.

## 3. Data model (migration `0044_brand_image_sources.sql`)

Imported assets go into the **existing** `client_brand_images` (operator decision), tagged by source:

```
client_brand_images
  + source        text not null default 'upload'  check in (upload, website, instagram, facebook)
  + media_type    text not null default 'image'   check in (image, video)
  + thumbnail_url text            -- a video's poster still (re-hosted)
  + source_url    text            -- the post permalink / page the asset came from
  + posted_at     timestamptz     -- when the brand posted it (social only)
  + source_ref    text            -- dedupe key; unique per client when set
```

Existing rows are untouched (`upload`, `image`). Imported rows do **not** count toward the upload
size limit.

`client_asset_imports` — one row per source per run:

```
id, client_id, org_id, source (website|instagram|facebook), target (url/handle),
status (queued|running|succeeded|failed), asset_count, error, trigger_run_id,
created_at, finished_at
unique (client_id, source) where status in (queued, running)   -- one live import per source
```

RLS default-deny, as 0041/0043.

**Brand Images stays the KB's vision corpus (D129) — for uploads only.** Everything that feeds the
KB analysis (`startKBBuildJob`, the re-extract route) passes only `source = 'upload'` image ids.
Imported assets are listed, shown and deletable, but never analysed — "assets only for now". Turning
insights on later is one filter.

## 4. Pipeline

```
startAssetImport(clientId, sources?)            server action
  └ for each source with a configured target:  insert client_asset_imports (queued)
  └ tasks.batchTrigger("asset-import", [...])    one run per source → parallel
        asset-import task (trigger/asset-import.ts)
          1. mark running
          2. run the Apify actor: start run, poll until finished (no 300 s sync cap)
          3. normalize → ScrapedAsset[]          pure, per source (src/lib/asset-import/*)
          4. window + filter + dedupe            pure
          5. skip source_refs the client already has
          6. download → GCS, 4 at a time        brand-images path, per asset; a bad asset is skipped
          7. insert rows; mark succeeded (count) or failed (readable error)
```

- **Non-blocking:** "Extract & Build KB" fires the import and the KB build independently; neither
  waits on the other. The upload step does not wait for imports either.
- Writes go straight to Supabase and GCS from the task (the `archive-reference` pattern), no webhook.
- A source with no target (no handle entered) is simply not triggered.
- **Refresh** re-runs one source; dedupe by `source_ref` means it adds only what is new. (An imported
  asset someone deleted can come back on refresh — accepted for v1.)

`ScrapedAsset` = `{ source, mediaType, url, thumbnailUrl?, sourceUrl?, postedAt?, ref, alt? }`.

Filters: images < 200 px on a known side, non-media extensions, `data:` URIs and tracking pixels
are dropped; at most 80 website assets. Size caps reuse the market archive limits.

## 5. UI

- **Upload step:** under "Brand website", two `InputGroup` fields — **Instagram** (`instagram.com/`
  prefix) and **Facebook** (`facebook.com/` prefix). Saved to the existing `brand_details.instagram`
  / `.facebook` (one owner), then the import starts alongside the KB build. The helper text says the
  import runs in the background.
- **Source panel → Images tab:** a status row per source — spinner "Importing from Instagram…",
  "42 imported · Refresh", or the error with Retry — plus the thumbnails grouped by source with a
  small source label; videos show a play badge. Uploads keep their current section and behaviour.
- Status reads through TanStack Query (`assetImportKeys`), polling with `refetchInterval` only while
  an import is queued/running; when one finishes the page's image list is refreshed.

## 6. Testing

- Unit: each normalizer against trimmed real fixtures from the benchmark (IG carousel + reel +
  pinned-old post; FB reel + album with `ctp` URL + `not_available` row; website pixel/icon/variant
  rows); window, filter, dedupe and `ctp` stripping.
- Route test for the status/start endpoint.
- Live: an end-to-end import on Chupps (website + Instagram; Facebook shows the not-public error).
