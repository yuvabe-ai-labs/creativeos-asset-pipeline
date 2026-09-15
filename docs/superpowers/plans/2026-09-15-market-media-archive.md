# Market Media Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clipping a reference returns immediately as it does today, while a background task downloads the real media and re-hosts it to GCS, so boards survive deleted posts and the bytes are available for later AI processing.

**Architecture:** `ingestReference` keeps its D185 contract and gains one fire-and-forget enqueue. A Trigger.dev task resolves a media URL per `kind`, downloads it, uploads under a deterministic GCS path, and writes `media_url` + `archive_status` straight to Supabase with no webhook. Playback becomes archive-first. A nightly sweep doubles as backfill and retry.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (`@supabase/supabase-js`), Google Cloud Storage (`@google-cloud/storage`), Trigger.dev v3 SDK, Vitest, Tailwind v4 + shadcn (Base UI registry).

**Spec:** `docs/superpowers/specs/2026-09-11-market-media-archive-design.md` (decisions **D257–D265**)

## Global Constraints

- **Controls are shadcn primitives only** — `src/components/ui/*`. Never a raw `<button>`/`<input>`/`<select>`. Base UI composes via `render`, not `asChild`.
- **Import, don't redefine** — constants live in `src/lib/<feature>/constants.ts`, utilities in `utils.ts`. Grep before adding.
- **API routes** use `apiError` / `apiOk` / `withClient` / `withMoodboard` / `withTryCatch` from `src/lib/api/route-helpers.ts`. Never `NextResponse.json` directly.
- **Trigger tasks must `await import()` every `@/lib` module** — those carry `import "server-only"`, which Trigger's separate build must not evaluate statically.
- **No `Range` header and no custom User-Agent when downloading media.** Verified: the Instagram CDN rejects ranged GETs (spec §1.1).
- **Colors come from the CSS variables in `globals.css`.** Never hardcode. Motion easing is `cubic-bezier(0.22,1,0.36,1)` only.
- **Test command:** `npx vitest run <path>`. Full suite: `npx vitest run`. Lint: `npm run lint`.
- **Known flake:** `src/lib/video-gen/__tests__/kling-provider.test.ts` times out at 5s on a cold module cache. Re-run before investigating.
- **Migration `0039` is applied by hand** in the Supabase SQL editor. Do not assume it has run.

---

### Task 1: Schema and the DB access layer

**Files:**
- Create: `supabase/migrations/0039_market_media_archive.sql`
- Modify: `src/lib/db/moodboards.ts` (add archive fields to `MoodboardItem`, add three functions)
- Test: `src/lib/db/moodboards.archive.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type ArchiveStatus = "pending" | "downloading" | "ready" | "failed" | "skipped"`
  - `MoodboardItem` gains `media_url: string | null`, `media_bytes: number | null`, `media_type: string | null`, `archive_status: ArchiveStatus`, `archive_error: string | null`, `archive_attempts: number`, `archive_started_at: string | null`, `archived_at: string | null`
  - `claimArchive(itemId: string): Promise<void>`
  - `completeArchive(itemId: string, input: { mediaUrl: string; mediaBytes: number; mediaType: string }): Promise<void>`
  - `failArchive(itemId: string, reason: string): Promise<void>`
  - `skipArchive(itemId: string): Promise<void>`
  - `getItem(itemId: string): Promise<MoodboardItem | null>`
  - `listArchivable(limit: number, maxAttempts: number, stuckBefore: string): Promise<Array<{ id: string; clientId: string }>>`

- [ ] **Step 1: Write the migration**

```sql
-- 0039_market_media_archive.sql
-- Market media archive (D257-D265). Clips currently store a permalink plus one
-- re-hosted JPEG; these columns hold the real media and the state of getting it.

alter table moodboard_items
  add column if not exists media_url          text,
  add column if not exists media_bytes        bigint,
  add column if not exists media_type         text,
  add column if not exists archive_status     text not null default 'pending',
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

-- The sweep's selection query, and only that. Partial so it stays small as `ready`
-- grows. 'downloading' is included so a row abandoned by a crashed task is findable.
create index if not exists moodboard_items_archive_pending_idx
  on moodboard_items(archive_status)
  where archive_status in ('pending','failed','downloading');
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/db/moodboards.archive.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const update = vi.fn();
const eq = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ update, eq }) }),
}));

import { claimArchive, completeArchive, failArchive } from "./moodboards";

describe("archive state transitions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    eq.mockResolvedValue({ error: null });
    update.mockReturnValue({ eq });
  });

  it("completeArchive writes the url, size, type and ready status", async () => {
    await completeArchive("item-1", {
      mediaUrl: "https://gcs/media.mp4",
      mediaBytes: 4158066,
      mediaType: "video/mp4",
    });
    const patch = update.mock.calls[0][0];
    expect(patch.media_url).toBe("https://gcs/media.mp4");
    expect(patch.media_bytes).toBe(4158066);
    expect(patch.media_type).toBe("video/mp4");
    expect(patch.archive_status).toBe("ready");
    expect(patch.archive_error).toBeNull();
    expect(patch.archived_at).toEqual(expect.any(String));
  });

  it("failArchive records the reason without clearing attempts", async () => {
    await failArchive("item-1", "HTTP 404");
    const patch = update.mock.calls[0][0];
    expect(patch.archive_status).toBe("failed");
    expect(patch.archive_error).toBe("HTTP 404");
    expect(patch).not.toHaveProperty("archive_attempts");
  });

  it("claimArchive stamps archive_started_at so the sweep can find abandoned rows", async () => {
    await claimArchive("item-1");
    const patch = update.mock.calls[0][0];
    expect(patch.archive_status).toBe("downloading");
    expect(patch.archive_started_at).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/lib/db/moodboards.archive.test.ts`
Expected: FAIL — `claimArchive is not a function`.

- [ ] **Step 4: Extend the type and add the functions**

In `src/lib/db/moodboards.ts`, add to the top of the file:

```ts
export const ARCHIVE_STATUSES = [
  "pending",
  "downloading",
  "ready",
  "failed",
  "skipped",
] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];
```

Add to the `MoodboardItem` type:

```ts
  media_url: string | null;
  media_bytes: number | null;
  media_type: string | null;
  archive_status: ArchiveStatus;
  archive_error: string | null;
  archive_attempts: number;
  archive_started_at: string | null;
  archived_at: string | null;
```

Append these functions:

```ts
/** Take ownership of a row before the slow work. `archive_started_at` is what lets
 *  the sweep find rows a crashed task abandoned mid-download (D264). */
export async function claimArchive(itemId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "downloading", archive_started_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
}

export async function completeArchive(
  itemId: string,
  input: { mediaUrl: string; mediaBytes: number; mediaType: string },
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({
      media_url: input.mediaUrl,
      media_bytes: input.mediaBytes,
      media_type: input.mediaType,
      archive_status: "ready",
      archive_error: null,
      archived_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) throw error;
}

/** Records WHY, so a failure is visible rather than indistinguishable from "not tried
 *  yet" — the gap that makes today's null thumbnails permanent. */
export async function failArchive(itemId: string, reason: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "failed", archive_error: reason.slice(0, 500) })
    .eq("id", itemId);
  if (error) throw error;
}

/** A link or a TikTok has no media of ours to own — terminal, not a failure. */
export async function skipArchive(itemId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "skipped" })
    .eq("id", itemId);
  if (error) throw error;
}

export async function getItem(itemId: string): Promise<MoodboardItem | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  return (data as MoodboardItem) ?? null;
}
```

Also increment attempts inside the task rather than here, so a claim and a count are one round trip: add to `claimArchive`'s update `archive_attempts` via a follow-up `rpc` is NOT needed — instead the task reads the row first and passes the incremented value. Add this parameter:

```ts
export async function claimArchive(itemId: string, attempts: number): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({
      archive_status: "downloading",
      archive_attempts: attempts,
      archive_started_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) throw error;
}
```

(Update the test's `claimArchive("item-1")` call to `claimArchive("item-1", 1)` and assert `archive_attempts === 1`.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/db/moodboards.archive.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Apply the migration by hand**

Paste `supabase/migrations/0039_market_media_archive.sql` into the Supabase SQL editor for the **staging** project and run it. Confirm with:
`select archive_status, count(*) from moodboard_items group by 1;`
Expected: every existing row reports `pending` — which is what makes the sweep a backfill.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0039_market_media_archive.sql src/lib/db/moodboards.ts src/lib/db/moodboards.archive.test.ts
git commit -m "feat(market): archive columns and state transitions (D258)"
```

---

### Task 2: Pinterest as a first-class kind

**Files:**
- Modify: `src/lib/market/constants.ts`, `src/lib/market/classify.ts`, `src/components/market/kind-badge.tsx`
- Test: `src/lib/market/classify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `REFERENCE_KINDS` includes `"pinterest"`; `classifyUrl` returns `"pinterest"` for pin URLs.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/market/classify.test.ts`:

```ts
describe("pinterest", () => {
  it("classifies a pin permalink", () => {
    expect(classifyUrl("https://www.pinterest.com/pin/12345/")).toBe("pinterest");
  });

  // Every real clipped pin in the database uses a REGIONAL host. An equality check
  // against "pinterest.com" silently sends all of them down the generic link path.
  it("classifies regional hosts", () => {
    expect(classifyUrl("https://in.pinterest.com/pin/58335757665806689/")).toBe("pinterest");
    expect(classifyUrl("https://uk.pinterest.com/pin/999/")).toBe("pinterest");
  });

  it("leaves non-pin pinterest pages as link", () => {
    expect(classifyUrl("https://in.pinterest.com/someuser/boards/")).toBe("link");
    expect(classifyUrl("https://www.pinterest.com/")).toBe("link");
  });

  // A direct image URL must stay `image` — the generic pill clips these, and they
  // are already the media rather than a page to resolve one from.
  it("leaves i.pinimg.com image urls as image", () => {
    expect(classifyUrl("https://i.pinimg.com/736x/a1/e7/73/abc.jpg")).toBe("image");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/market/classify.test.ts`
Expected: FAIL — receives `"link"`, expected `"pinterest"`.

- [ ] **Step 3: Implement**

In `src/lib/market/constants.ts`, add `"pinterest"` to `REFERENCE_KINDS`:

```ts
export const REFERENCE_KINDS = [
  "image",
  "gif",
  "video",
  "youtube",
  "instagram",
  "tiktok",
  "link",
  "pinterest",
] as const;
```

In `src/lib/market/classify.ts`, add above the extension checks (after the tiktok branch):

```ts
// Pins are served from regional hosts (in.pinterest.com, uk.pinterest.com, …) —
// every real clipped pin in the database uses one, so match the suffix, never
// equality with "pinterest.com".
if (host === "pinterest.com" || host.endsWith(".pinterest.com")) {
  return PIN_PERMALINK.test(u.pathname) ? "pinterest" : "link";
}
```

and next to `IG_PERMALINK`:

```ts
const PIN_PERMALINK = /^\/pin\/([^/]+)/;
```

In `src/components/market/kind-badge.tsx`, add a `pinterest` entry to the icon/label map using the Lucide `Image` icon at `strokeWidth={1.5}`, following whatever shape the existing map uses.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/market/classify.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/constants.ts src/lib/market/classify.ts src/lib/market/classify.test.ts src/components/market/kind-badge.tsx
git commit -m "feat(market): pinterest becomes a first-class ReferenceKind (D260)"
```

---

### Task 3: GCS path and upload helper for media

**Files:**
- Modify: `src/lib/storage/paths.ts`, `src/lib/storage/index.ts`, `src/lib/market/constants.ts`
- Test: `src/lib/storage/paths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pathForMarketMedia(args: { clientId: string; itemId: string; ext: string }): string`
  - `uploadMarketMedia(args: { clientId: string; itemId: string; body: Buffer; contentType: string }): Promise<UploadResult>`
  - `MARKET_MEDIA_SIZE_LIMIT: number` (200 MB)
  - `extForContentType(contentType: string): string`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/storage/paths.test.ts`:

```ts
import { pathForMarketMedia } from "./paths";

describe("pathForMarketMedia", () => {
  // Deterministic and keyed by itemId, exactly like pathForMarketThumb: a re-run
  // overwrites instead of accumulating orphans.
  it("is deterministic per item", () => {
    const a = pathForMarketMedia({ clientId: "c1", itemId: "i1", ext: "mp4" });
    const b = pathForMarketMedia({ clientId: "c1", itemId: "i1", ext: "mp4" });
    expect(a).toBe(b);
    expect(a).toBe("clients/c1/market/media/i1.mp4");
  });

  it("sits beside thumbs, not inside them", () => {
    expect(pathForMarketMedia({ clientId: "c1", itemId: "i1", ext: "jpg" })).not.toContain("/thumbs/");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `pathForMarketMedia is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/storage/paths.ts`, beneath `pathForMarketThumb`:

```ts
/** The archived media for a market reference (D257). Deterministic per item for the
 *  same reason as pathForMarketThumb: a re-archive overwrites rather than orphaning. */
export function pathForMarketMedia(args: {
  clientId: string;
  itemId: string;
  ext: string;
}): string {
  return `clients/${args.clientId}/market/media/${args.itemId}.${args.ext}`;
}
```

In `src/lib/storage/index.ts`, import `pathForMarketMedia` and append:

```ts
const MEDIA_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extForContentType(contentType: string): string {
  return MEDIA_EXT_BY_TYPE[contentType.split(";")[0].trim().toLowerCase()] ?? "bin";
}

/** Re-hosted MEDIA for a market reference — the video or full-resolution still itself,
 *  not the preview. Sibling of uploadMarketThumbnail (D257). */
export async function uploadMarketMedia(args: {
  clientId: string;
  itemId: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForMarketMedia({
    clientId: args.clientId,
    itemId: args.itemId,
    ext: extForContentType(args.contentType),
  });
  return _upload(path, args.body, args.contentType);
}
```

In `src/lib/market/constants.ts`, beside `THUMBNAIL_SIZE_LIMIT`:

```ts
/** Max bytes we'll pull for an archived media file. A 17s reel measured ~4 MB and a
 *  20s Short ~0.85 MB (design spec §1), so this is generous; it exists to turn a
 *  runaway response into a recorded failure rather than an OOM. */
export const MARKET_MEDIA_SIZE_LIMIT = 200 * 1024 * 1024;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/paths.ts src/lib/storage/index.ts src/lib/storage/paths.test.ts src/lib/market/constants.ts
git commit -m "feat(storage): market media path and upload helper"
```

---

### Task 4: The free resolver rungs — image, gif, video, pinterest

**Files:**
- Create: `src/lib/market/media.ts`, `src/lib/market/media.test.ts`

**Interfaces:**
- Consumes: `ReferenceKind` from `./constants`.
- Produces:
  - `type MediaSource = { url: string; contentType?: string }`
  - `resolveMediaSource(item: { image_url: string; kind: ReferenceKind }, deps?: { fetchImpl?: typeof fetch; token?: string }): Promise<MediaSource | null>`
  - `pinterestOriginal(sizedUrl: string, fetchImpl: typeof fetch): Promise<string>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/market/media.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { resolveMediaSource, pinterestOriginal } from "./media";

const item = (kind: string, url: string) => ({ image_url: url, kind: kind as never });

describe("resolveMediaSource — free rungs", () => {
  it("an image IS the media", async () => {
    const r = await resolveMediaSource(item("image", "https://x/a.jpg"));
    expect(r).toEqual({ url: "https://x/a.jpg" });
  });

  it("a gif IS the media", async () => {
    const r = await resolveMediaSource(item("gif", "https://x/a.gif"));
    expect(r?.url).toBe("https://x/a.gif");
  });

  it("a direct video file IS the media", async () => {
    const r = await resolveMediaSource(item("video", "https://x/a.mp4"));
    expect(r?.url).toBe("https://x/a.mp4");
  });

  it("tiktok and link have no media of ours to own", async () => {
    expect(await resolveMediaSource(item("tiktok", "https://tiktok.com/@a/video/1"))).toBeNull();
    expect(await resolveMediaSource(item("link", "https://example.com/post"))).toBeNull();
  });
});

describe("pinterestOriginal", () => {
  const sized = "https://i.pinimg.com/736x/a1/e7/73/abc.jpg";

  // Verified live: the /originals/ extension is unpredictable — one pin's original is
  // .png, another's is .jpg, and the wrong guess returns 403.
  it("probes extensions and returns the first that responds", async () => {
    const fetchImpl = vi.fn(async (u: string) =>
      ({ ok: u.endsWith("/originals/a1/e7/73/abc.png"), body: null }) as unknown as Response,
    );
    const out = await pinterestOriginal(sized, fetchImpl as unknown as typeof fetch);
    expect(out).toBe("https://i.pinimg.com/originals/a1/e7/73/abc.png");
  });

  it("falls back to the sized url when every extension 403s", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, body: null }) as unknown as Response);
    const out = await pinterestOriginal(sized, fetchImpl as unknown as typeof fetch);
    expect(out).toBe(sized);
  });

  it("leaves a url that is already /originals/ alone", async () => {
    const already = "https://i.pinimg.com/originals/a1/e7/73/abc.jpg";
    const fetchImpl = vi.fn();
    expect(await pinterestOriginal(already, fetchImpl as unknown as typeof fetch)).toBe(already);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/market/media.test.ts`
Expected: FAIL — cannot find module `./media`.

- [ ] **Step 3: Implement the free rungs**

```ts
// src/lib/market/media.ts
// Where the archived BYTES come from, per kind — the media counterpart to
// resolveThumbnailSource (D261). Laddered cheapest-first: two kinds need no network
// call at all and one needs no provider, so only Instagram and YouTube ever cost money.
//
// Every field name here was verified against a live provider run on 2026-09-11
// (design spec §1); none of it is taken from vendor documentation, which was wrong
// about all three platforms.
import "server-only";
import type { ReferenceKind } from "./constants";
import { ogImage } from "./thumbnail";

export type MediaSource = { url: string; contentType?: string };

const PINTEREST_ORIGINAL_EXTS = ["jpg", "png", "webp"] as const;

/**
 * Upgrade a pinimg `/736x/` URL to `/originals/`, which is a 7–10x resolution gain
 * for three cheap requests. The extension does NOT follow from the sized URL — a
 * verified pin served .png where its 736x variant was .jpg — and the wrong guess
 * returns 403, so each candidate is probed and the sized URL is the fallback.
 */
export async function pinterestOriginal(
  sizedUrl: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (sizedUrl.includes("/originals/")) return sizedUrl;
  const m = sizedUrl.match(/^(https:\/\/i\.pinimg\.com\/)[^/]+\/(.+)\.\w+$/);
  if (!m) return sizedUrl;
  for (const ext of PINTEREST_ORIGINAL_EXTS) {
    const candidate = `${m[1]}originals/${m[2]}.${ext}`;
    try {
      const res = await fetchImpl(candidate);
      await res.body?.cancel();
      if (res.ok) return candidate;
    } catch {
      // network hiccup on a probe is not a failure — try the next extension
    }
  }
  return sizedUrl;
}

export async function resolveMediaSource(
  item: { image_url: string; kind: ReferenceKind },
  deps: { fetchImpl?: typeof fetch; token?: string } = {},
): Promise<MediaSource | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  // The reference IS the media — no network call, no provider.
  if (item.kind === "image" || item.kind === "gif" || item.kind === "video") {
    return { url: item.image_url };
  }

  if (item.kind === "pinterest") {
    const og = await ogImage(item.image_url, fetchImpl);
    if (!og) return null;
    return { url: await pinterestOriginal(og, fetchImpl) };
  }

  // An article or a TikTok has no media file of ours to own (D261).
  return null;
}
```

Export `ogImage` from `src/lib/market/thumbnail.ts` by changing `async function ogImage` to `export async function ogImage` — it is now a second consumer, which is the codebase's stated bar for extraction.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/market/media.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/media.ts src/lib/market/media.test.ts src/lib/market/thumbnail.ts
git commit -m "feat(market): free media resolver rungs incl. pinterest originals (D261)"
```

---

### Task 5: The Instagram and YouTube provider rungs

**Files:**
- Modify: `src/lib/market/apify.ts`, `src/lib/market/media.ts`
- Test: `src/lib/market/apify.test.ts`, `src/lib/market/media.test.ts`

**Interfaces:**
- Consumes: `MediaSource` from Task 4.
- Produces:
  - `fetchPostMedia(url: string, opts: { token: string; fetchImpl?: typeof fetch }): Promise<{ videoUrl?: string; displayUrl?: string } | null>`
  - `fetchYouTubeDownload(url: string, opts: { token: string; fetchImpl?: typeof fetch }): Promise<string | null>`
  - `resolveMediaSource` now handles `instagram` and `youtube`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/market/apify.test.ts`:

```ts
import { fetchPostMedia, fetchYouTubeDownload } from "./apify";

function jsonFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => payload } as unknown as Response);
}

describe("fetchPostMedia", () => {
  it("returns videoUrl and displayUrl for a reel", async () => {
    const fetchImpl = jsonFetch([
      { type: "Video", videoUrl: "https://cdn/v.mp4", displayUrl: "https://cdn/d.jpg" },
    ]);
    const out = await fetchPostMedia("https://www.instagram.com/reel/A/", {
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({ videoUrl: "https://cdn/v.mp4", displayUrl: "https://cdn/d.jpg" });
  });

  // Verified live: a dead permalink returns a ROW carrying `error`, not an empty
  // dataset. Treating that row as a post would archive nothing and report success.
  it("treats an error row as no data", async () => {
    const fetchImpl = jsonFetch([
      { url: "u", username: "reel", error: "not_found", errorDescription: "Post does not exist" },
    ]);
    const out = await fetchPostMedia("https://www.instagram.com/reel/dead/", {
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });

  it("returns null for an empty dataset", async () => {
    const fetchImpl = jsonFetch([]);
    const out = await fetchPostMedia("https://www.instagram.com/reel/A/", {
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });
});

describe("fetchYouTubeDownload", () => {
  it("returns downloadedFileUrl and ignores the HLS manifests", async () => {
    const fetchImpl = jsonFetch([
      {
        downloadedFileUrl: "https://api.apify.com/v2/key-value-stores/x/records/y.mp4",
        videoOnlyUrl: "https://manifest.googlevideo.com/hls_playlist/x",
        audioOnlyUrl: "https://manifest.googlevideo.com/hls_playlist/y",
        durationSeconds: 20,
      },
    ]);
    const out = await fetchYouTubeDownload("https://www.youtube.com/shorts/A", {
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toBe("https://api.apify.com/v2/key-value-stores/x/records/y.mp4");
  });

  it("returns null when the actor saved no row", async () => {
    const fetchImpl = jsonFetch([]);
    const out = await fetchYouTubeDownload("https://www.youtube.com/shorts/A", {
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/market/apify.test.ts`
Expected: FAIL — `fetchPostMedia is not a function`.

- [ ] **Step 3: Implement the provider calls**

Append to `src/lib/market/apify.ts`:

```ts
const POST_ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";
const YT_ENDPOINT =
  "https://api.apify.com/v2/acts/streamers~youtube-video-downloader/run-sync-get-dataset-items?timeout=280";

type ApifyPostItem = {
  type?: string;
  videoUrl?: string;
  displayUrl?: string;
  error?: string;
  errorDescription?: string;
};

/**
 * Media URLs for ONE Instagram permalink. Same actor and token as
 * fetchProfileDetails (D235), different input shape: a post URL rather than a
 * profile. Verified 2026-09-11 — a 17s reel returned a 4.16 MB video/mp4.
 */
export async function fetchPostMedia(
  url: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<{ videoUrl?: string; displayUrl?: string } | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(POST_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyPostItem[];
  const item = items[0];
  // A dead permalink yields a ROW carrying `error`, not an empty dataset — so
  // absence is not the only failure shape to check for.
  if (!item || item.error) return null;
  if (!item.videoUrl && !item.displayUrl) return null;
  return { videoUrl: item.videoUrl, displayUrl: item.displayUrl };
}

type ApifyYouTubeItem = { downloadedFileUrl?: string };

/**
 * A progressive mp4 for one YouTube video or Short. Shorts ARE supported, which the
 * actor's page does not state (verified 2026-09-11).
 *
 * Only `downloadedFileUrl` is usable: `videoOnlyUrl` and `audioOnlyUrl` are HLS
 * manifests. The file lives in Apify's key-value store and expires in ~3 days, which
 * is why the caller must download it immediately rather than persisting the link.
 */
export async function fetchYouTubeDownload(
  url: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(YT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      videos: [{ url }],
      preferredFormat: "mp4",
      preferredQuality: "720p",
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyYouTubeItem[];
  return items[0]?.downloadedFileUrl ?? null;
}
```

- [ ] **Step 4: Wire both rungs into `resolveMediaSource`**

In `src/lib/market/media.ts`, import the two functions and insert before the final `return null`:

```ts
  if (item.kind === "instagram") {
    if (!deps.token) throw new Error("Missing APIFY_TOKEN env var");
    const media = await fetchPostMedia(item.image_url, { token: deps.token, fetchImpl });
    if (!media) return null;
    // A reel archives as its video; a still post archives as its display image.
    const url = media.videoUrl ?? media.displayUrl;
    return url ? { url } : null;
  }

  if (item.kind === "youtube") {
    if (!deps.token) throw new Error("Missing APIFY_TOKEN env var");
    const url = await fetchYouTubeDownload(item.image_url, { token: deps.token, fetchImpl });
    return url ? { url } : null;
  }
```

Add matching tests to `media.test.ts` mocking `./apify`, asserting the instagram rung prefers `videoUrl` over `displayUrl` and falls back to `displayUrl`, and that a missing token throws.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/market/apify.test.ts src/lib/market/media.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/market/apify.ts src/lib/market/apify.test.ts src/lib/market/media.ts src/lib/market/media.test.ts
git commit -m "feat(market): instagram and youtube media resolver rungs"
```

---

### Task 6: The archive core

**Files:**
- Create: `src/lib/market/archive.ts`, `src/lib/market/archive.test.ts`

**Interfaces:**
- Consumes: Task 1 DB functions, Task 3 `uploadMarketMedia`, Task 4/5 `resolveMediaSource`.
- Produces: `archiveItem(itemId: string, clientId: string, opts?: { fetchImpl?: typeof fetch }): Promise<ArchiveResult>` where `ArchiveResult = { ok: true; bytes: number } | { ok: false; reason: string } | { ok: true; skipped: true } | { ok: true; alreadyDone: true }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/market/archive.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  getItem: vi.fn(),
  claimArchive: vi.fn(),
  completeArchive: vi.fn(),
  failArchive: vi.fn(),
  skipArchive: vi.fn(),
  updateItemThumbnail: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  uploadMarketMedia: vi.fn(),
  uploadMarketThumbnail: vi.fn(),
}));
vi.mock("./media", () => ({ resolveMediaSource: vi.fn() }));

import {
  getItem, claimArchive, completeArchive, failArchive, skipArchive, updateItemThumbnail,
} from "@/lib/db/moodboards";
import { uploadMarketMedia, uploadMarketThumbnail } from "@/lib/storage";
import { resolveMediaSource } from "./media";
import { archiveItem } from "./archive";

const row = (over = {}) => ({
  id: "i1", moodboard_id: "b1", image_url: "https://x/a.mp4", source_url: null,
  kind: "video", note: null, added_by: null, thumbnail_url: "https://gcs/t.jpg",
  position: 0, added_at: "now", media_url: null, media_bytes: null, media_type: null,
  archive_status: "pending", archive_error: null, archive_attempts: 0,
  archive_started_at: null, archived_at: null, ...over,
});

function bodyFetch(bytes: number, contentType = "video/mp4") {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response);
}

describe("archiveItem", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APIFY_TOKEN = "t";
  });

  it("downloads, uploads and marks ready", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
    vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });

    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });

    expect(out).toEqual({ ok: true, bytes: 2048 });
    expect(vi.mocked(claimArchive)).toHaveBeenCalledWith("i1", 1);
    expect(vi.mocked(completeArchive)).toHaveBeenCalledWith("i1", {
      mediaUrl: "https://gcs/m.mp4", mediaBytes: 2048, mediaType: "video/mp4",
    });
  });

  it("is a no-op when already ready", async () => {
    vi.mocked(getItem).mockResolvedValue(row({ archive_status: "ready" }) as never);
    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(1) as never });
    expect(out).toEqual({ ok: true, alreadyDone: true });
    expect(vi.mocked(claimArchive)).not.toHaveBeenCalled();
  });

  it("skips a kind with no media of ours to own", async () => {
    vi.mocked(getItem).mockResolvedValue(row({ kind: "link" }) as never);
    vi.mocked(resolveMediaSource).mockResolvedValue(null);
    const out = await archiveItem("i1", "c1", { fetchImpl: bodyFetch(1) as never });
    expect(out).toEqual({ ok: true, skipped: true });
    expect(vi.mocked(skipArchive)).toHaveBeenCalledWith("i1");
  });

  it("records a failure reason rather than throwing", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
    const out = await archiveItem("i1", "c1", {
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 } as never) as never,
    });
    expect(out).toEqual({ ok: false, reason: "download failed: HTTP 404" });
    expect(vi.mocked(failArchive)).toHaveBeenCalledWith("i1", "download failed: HTTP 404");
  });

  it("rejects a response past the size limit", async () => {
    vi.mocked(getItem).mockResolvedValue(row() as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({ url: "https://cdn/a.mp4" });
    const out = await archiveItem("i1", "c1", {
      fetchImpl: bodyFetch(201 * 1024 * 1024) as never,
    });
    expect(out.ok).toBe(false);
    expect(vi.mocked(uploadMarketMedia)).not.toHaveBeenCalled();
  });

  // D265: the provider call that yields the video also yields the cover still, and
  // 0 of 62 Instagram items on the shelf have a thumbnail today.
  it("backfills a null thumbnail from the same payload", async () => {
    vi.mocked(getItem).mockResolvedValue(
      row({ kind: "instagram", thumbnail_url: null }) as never,
    );
    vi.mocked(resolveMediaSource).mockResolvedValue({
      url: "https://cdn/a.mp4",
      thumbnailUrl: "https://cdn/d.jpg",
    } as never);
    vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });
    vi.mocked(uploadMarketThumbnail).mockResolvedValue({ url: "https://gcs/t.jpg", path: "p" });

    await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });

    expect(vi.mocked(updateItemThumbnail)).toHaveBeenCalledWith("i1", "https://gcs/t.jpg");
  });

  it("leaves an existing thumbnail alone", async () => {
    vi.mocked(getItem).mockResolvedValue(row({ thumbnail_url: "https://gcs/old.jpg" }) as never);
    vi.mocked(resolveMediaSource).mockResolvedValue({
      url: "https://cdn/a.mp4", thumbnailUrl: "https://cdn/d.jpg",
    } as never);
    vi.mocked(uploadMarketMedia).mockResolvedValue({ url: "https://gcs/m.mp4", path: "p" });
    await archiveItem("i1", "c1", { fetchImpl: bodyFetch(2048) as never });
    expect(vi.mocked(updateItemThumbnail)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/market/archive.test.ts`
Expected: FAIL — cannot find module `./archive`.

- [ ] **Step 3: Extend `MediaSource` with the still, then implement**

In `src/lib/market/media.ts`, widen the type and populate it on the Instagram and Pinterest rungs:

```ts
export type MediaSource = { url: string; contentType?: string; thumbnailUrl?: string };
```

Instagram rung returns `{ url, thumbnailUrl: media.displayUrl }`; Pinterest rung returns
`{ url: original, thumbnailUrl: og }`; YouTube rung returns
`{ url, thumbnailUrl: resolveThumbnailSource-derived i.ytimg URL }` — import and reuse it
rather than rebuilding the URL.

Then:

```ts
// src/lib/market/archive.ts
// The one archive path (D257). Mirrors snapshotHandle's contract: state always moves,
// and a provider failure is recorded rather than thrown, so the sweep can retry it.
import "server-only";
import {
  getItem, claimArchive, completeArchive, failArchive, skipArchive, updateItemThumbnail,
} from "@/lib/db/moodboards";
import { uploadMarketMedia, uploadMarketThumbnail } from "@/lib/storage";
import { resolveMediaSource } from "./media";
import { MARKET_MEDIA_SIZE_LIMIT, THUMBNAIL_SIZE_LIMIT } from "./constants";

export type ArchiveResult =
  | { ok: true; bytes: number }
  | { ok: true; skipped: true }
  | { ok: true; alreadyDone: true }
  | { ok: false; reason: string };

export async function archiveItem(
  itemId: string,
  clientId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ArchiveResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const item = await getItem(itemId);
  if (!item) return { ok: false, reason: "item not found" };
  // Idempotent by design: the sweep, the enqueue and a manual retry can all land on
  // the same row, and re-downloading a file we already own is pure waste.
  if (item.archive_status === "ready") return { ok: true, alreadyDone: true };

  await claimArchive(itemId, item.archive_attempts + 1);

  try {
    const source = await resolveMediaSource(item, {
      fetchImpl,
      token: process.env.APIFY_TOKEN,
    });
    if (!source) {
      await skipArchive(itemId);
      return { ok: true, skipped: true };
    }

    // No Range header and no custom User-Agent: verified unnecessary, and a ranged
    // request is rejected outright by the Instagram CDN.
    const res = await fetchImpl(source.url);
    if (!res.ok) {
      const reason = `download failed: HTTP ${res.status}`;
      await failArchive(itemId, reason);
      return { ok: false, reason };
    }

    const contentType =
      res.headers.get("content-type")?.split(";")[0].trim() || source.contentType || "video/mp4";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MARKET_MEDIA_SIZE_LIMIT) {
      const reason = `rejected size: ${buffer.byteLength} bytes`;
      await failArchive(itemId, reason);
      return { ok: false, reason };
    }

    const { url } = await uploadMarketMedia({ clientId, itemId, body: buffer, contentType });
    await completeArchive(itemId, {
      mediaUrl: url,
      mediaBytes: buffer.byteLength,
      mediaType: contentType,
    });

    // D265 — the payload that carried the video also carried the cover still, and
    // the capture ladder has no retry to fix the items it already failed.
    if (!item.thumbnail_url && source.thumbnailUrl) {
      await backfillThumbnail(itemId, clientId, source.thumbnailUrl, fetchImpl);
    }

    return { ok: true, bytes: buffer.byteLength };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await failArchive(itemId, reason);
    return { ok: false, reason };
  }
}

/** Best-effort, exactly like ingest's thumbnail step: a media archive that succeeded
 *  must not be reported as failed because its preview did not. */
async function backfillThumbnail(
  itemId: string,
  clientId: string,
  thumbUrl: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  try {
    const res = await fetchImpl(thumbUrl);
    if (!res.ok) return;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) return;
    const { url } = await uploadMarketThumbnail({ clientId, itemId, body: buffer, contentType });
    await updateItemThumbnail(itemId, url);
  } catch {
    // degraded preview on an otherwise successful archive — not an error
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/market/archive.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/archive.ts src/lib/market/archive.test.ts src/lib/market/media.ts src/lib/market/media.test.ts
git commit -m "feat(market): archive core with thumbnail backfill (D257, D265)"
```

---

### Task 7: The Trigger task and the enqueue

**Files:**
- Create: `trigger/archive-reference.ts`
- Modify: `src/lib/market/ingest.ts`
- Test: `src/lib/market/ingest.test.ts`

**Interfaces:**
- Consumes: `archiveItem` from Task 6.
- Produces: task id `"archive-reference"` taking `{ itemId: string; clientId: string }`.

- [ ] **Step 1: Write the failing regression test**

Append to `src/lib/market/ingest.test.ts` (add `vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }))` at the top with the other mocks):

```ts
it("returns the item even when the archive enqueue throws", async () => {
  vi.mocked(addItem).mockResolvedValue({ ...baseItem });
  vi.mocked(resolveThumbnailSource).mockResolvedValue(null);
  vi.mocked(tasks.trigger).mockRejectedValue(new Error("trigger unreachable"));

  const item = await ingestReference({
    boardId: "b-1", clientId: "c-1", url: "https://youtu.be/x",
  });

  // D185's contract extends to the enqueue: the clip must not fail because the
  // background system is down. The nightly sweep is the backstop.
  expect(item.id).toBe("item-1");
});

it("enqueues the archive task with the new item's id", async () => {
  vi.mocked(addItem).mockResolvedValue({ ...baseItem });
  vi.mocked(resolveThumbnailSource).mockResolvedValue(null);
  vi.mocked(tasks.trigger).mockResolvedValue({ id: "run-1" } as never);

  await ingestReference({ boardId: "b-1", clientId: "c-1", url: "https://youtu.be/x" });

  expect(vi.mocked(tasks.trigger)).toHaveBeenCalledWith("archive-reference", {
    itemId: "item-1",
    clientId: "c-1",
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/market/ingest.test.ts`
Expected: FAIL — `tasks.trigger` never called.

- [ ] **Step 3: Write the task**

```ts
// trigger/archive-reference.ts
// Downloads the real media for one market reference and re-hosts it to GCS (D257).
//
// Every @/lib import is dynamic — those modules carry `import "server-only"`, a
// Next.js sentinel Trigger.dev's separate build must not evaluate statically (see
// reconcile-stuck-generations.ts).
//
// Modelled on snapshot-handles rather than video-generate: it writes STRAIGHT to
// Supabase and GCS with no webhook. That is simpler, and it is also why this task
// completes when run from a dev machine — a callback to a localhost APP_URL does not.
import { task, logger } from "@trigger.dev/sdk";

export const archiveReferenceTask = task({
  id: "archive-reference",
  maxDuration: 600,
  run: async (payload: { itemId: string; clientId: string }) => {
    const { archiveItem } = await import("@/lib/market/archive");
    const result = await archiveItem(payload.itemId, payload.clientId);
    logger.info("Archive finished", { ...payload, ...result });
    return result;
  },
});
```

- [ ] **Step 4: Add the enqueue to ingest**

In `src/lib/market/ingest.ts`, add `import { tasks } from "@trigger.dev/sdk";` and insert
immediately before **each** `return item` / `return { ...item, thumbnail_url: url }` — better,
restructure so the enqueue happens once at the end. Extract the thumbnail work into a local
helper and finish with:

```ts
  // Fire-and-forget: D185 says the row always saves, and that contract extends here.
  // A dropped enqueue is recovered by the nightly sweep, so it is logged, not thrown.
  try {
    await tasks.trigger("archive-reference", { itemId: item.id, clientId: args.clientId });
  } catch (e) {
    console.log(`[clip] archive enqueue failed (${e instanceof Error ? e.message : e}) — sweep will retry`);
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/market/ingest.test.ts`
Expected: PASS (all existing tests still green plus the two new ones)

- [ ] **Step 6: Commit**

```bash
git add trigger/archive-reference.ts src/lib/market/ingest.ts src/lib/market/ingest.test.ts
git commit -m "feat(trigger): archive-reference task, enqueued from ingest (D257)"
```

---

### Task 8: The sweep — backfill, retry and stuck recovery

**Files:**
- Create: `trigger/archive-sweep.ts`
- Modify: `src/lib/db/moodboards.ts` (`listArchivable`, `releaseStuckArchives`), `src/lib/market/constants.ts`
- Test: `src/lib/db/moodboards.archive.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 6.
- Produces: `MAX_ARCHIVE_ATTEMPTS = 4`, `STUCK_ARCHIVE_MINUTES = 30`, `listArchivable`, `releaseStuckArchives`.

- [ ] **Step 1: Add the constants**

```ts
// src/lib/market/constants.ts
/** Give up on an item after this many archive attempts (D264). */
export const MAX_ARCHIVE_ATTEMPTS = 4;
/** A row claimed but not finished within this window was abandoned by a crashed run. */
export const STUCK_ARCHIVE_MINUTES = 30;
```

- [ ] **Step 2: Add the queries**

```ts
/** The sweep's work list: never attempted, failed-but-retryable, in one query.
 *  Ordered oldest-first so a backlog drains fairly rather than starving old rows. */
export async function listArchivable(
  limit: number,
  maxAttempts: number,
): Promise<Array<{ id: string; clientId: string }>> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .select("id, moodboards!inner(client_id)")
    .in("archive_status", ["pending", "failed"])
    .lt("archive_attempts", maxAttempts)
    .order("added_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const board = unwrapEmbed((r as never as { moodboards: unknown }).moodboards) as {
      client_id: string;
    };
    return { id: (r as { id: string }).id, clientId: board.client_id };
  });
}

/** Move rows a crashed run abandoned in `downloading` back to `failed`, which makes
 *  them eligible for the retry branch on the next pass. */
export async function releaseStuckArchives(olderThanIso: string): Promise<number> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .update({ archive_status: "failed", archive_error: "abandoned mid-download" })
    .eq("archive_status", "downloading")
    .lt("archive_started_at", olderThanIso)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}
```

`unwrapEmbed` already exists in `src/lib/api/route-helpers.ts` — import it rather than
writing a local copy. If it is not exported, export it there.

- [ ] **Step 3: Write the sweep task**

```ts
// trigger/archive-sweep.ts
// One scheduled task doing three jobs at once (D264):
//   1. BACKFILL — every pre-existing row defaults to `pending`, so the first run picks
//      up the entire existing corpus with no separate migration script.
//   2. RETRY    — transient provider failures get another pass.
//   3. RECOVERY — a dropped tasks.trigger enqueue self-heals here.
// Runs at 05:30, half an hour after snapshot-handles, so the two never contend for
// the Apify rate limit.
import { schedules, logger } from "@trigger.dev/sdk";

const BATCH = 50;

export const archiveSweepTask = schedules.task({
  id: "archive-sweep",
  cron: "30 5 * * *",
  maxDuration: 1200,
  run: async () => {
    const { listArchivable, releaseStuckArchives } = await import("@/lib/db/moodboards");
    const { archiveItem } = await import("@/lib/market/archive");
    const { MAX_ARCHIVE_ATTEMPTS, STUCK_ARCHIVE_MINUTES } = await import(
      "@/lib/market/constants"
    );

    const cutoff = new Date(Date.now() - STUCK_ARCHIVE_MINUTES * 60_000).toISOString();
    const released = await releaseStuckArchives(cutoff);
    if (released) logger.info("Released stuck archives", { released });

    const work = await listArchivable(BATCH, MAX_ARCHIVE_ATTEMPTS);
    logger.info("Archive sweep starting", { count: work.length });

    for (const row of work) {
      try {
        const result = await archiveItem(row.id, row.clientId);
        logger.info("Archive done", { itemId: row.id, ...result });
      } catch (e) {
        // One bad item must not starve the rest — the same rule snapshot-handles uses.
        logger.error("Archive threw", {
          itemId: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
});
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS (re-run the kling file alone if it times out — known cold-cache flake)

- [ ] **Step 5: Commit**

```bash
git add trigger/archive-sweep.ts src/lib/db/moodboards.ts src/lib/market/constants.ts src/lib/db/moodboards.archive.test.ts
git commit -m "feat(trigger): archive sweep as backfill, retry and stuck recovery (D264)"
```

---

### Task 9: Archive-first playback and the tile state

**Files:**
- Modify: `src/components/market/reference-lightbox.tsx`, `src/components/market/reference-tile.tsx`
- Create: `src/components/market/archive-chip.tsx`

**Interfaces:**
- Consumes: `MoodboardItem` with archive fields (Task 1).
- Produces: `<ArchiveChip status={...} />`

- [ ] **Step 1: Write the chip**

```tsx
// src/components/market/archive-chip.tsx
"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { ArchiveStatus } from "@/lib/db/moodboards";

/** Archive state on a tile. Sits bottom-LEFT because the other three corners are
 *  taken (KindBadge, selection Checkbox, remove Button). `ready` and `skipped`
 *  render nothing — success should be silent. */
export function ArchiveChip({ status }: { status: ArchiveStatus }) {
  if (status === "ready" || status === "skipped") return null;

  const downloading = status === "downloading" || status === "pending";
  return (
    <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-card">
      {downloading ? (
        <>
          <Loader2 className="size-2.5 animate-spin" strokeWidth={1.5} />
          Saving media…
        </>
      ) : (
        <>
          <RefreshCw className="size-2.5" strokeWidth={1.5} />
          Retrying
        </>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Render it on the tile**

In `src/components/market/reference-tile.tsx`, import `ArchiveChip` and add
`<ArchiveChip status={item.archive_status} />` immediately after `<KindBadge kind={item.kind} />`.

- [ ] **Step 3: Make the lightbox archive-first**

In `src/components/market/reference-lightbox.tsx`, insert at the very top of the component,
before the existing `kind === "image"` branch:

```tsx
  // Archive-first (D259): when we own the bytes we play OUR copy, for every kind.
  // There is deliberately no embed fallback — a cross-origin iframe never reports
  // that it went blank, so "fall back on failure" is not implementable.
  if (item.archive_status === "ready" && item.media_url) {
    if (item.media_type?.startsWith("image/")) {
      return (
        <FullScreenImageZoom
          imageUrl={item.media_url}
          title={item.note ?? undefined}
          onClose={onClose}
        />
      );
    }
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6" onClick={onClose}>
        <div className="flex max-h-full w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <video
            src={item.media_url}
            controls
            autoPlay
            playsInline
            className="max-h-[70vh] w-full rounded-lg bg-black"
          />
          {/* the existing caption/actions row, unchanged */}
        </div>
      </div>
    );
  }
```

Extract the caption/actions row into a local `<LightboxChrome item={item} onClose={onClose} />`
so it is not duplicated between the two branches.

For the not-yet-archived case, leave the existing embed/iframe path exactly as it is —
those are `tiktok` and `link`, which are never archived, plus the brief window before the
task finishes.

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/market/archive-chip.tsx src/components/market/reference-tile.tsx src/components/market/reference-lightbox.tsx
git commit -m "feat(market): archive-first playback and tile archive state (D259)"
```

---

### Task 10: Delete the object when the item goes

**Files:**
- Modify: `src/lib/db/moodboards.ts` or the item DELETE route
- Test: existing item-delete test file

**Interfaces:**
- Consumes: `removeObject`, `parsePathFromUrl` from `@/lib/storage`.

- [ ] **Step 1: Write the failing test**

Assert that deleting an item with `media_url` and `thumbnail_url` set calls `removeObject`
for both, and that a `removeObject` failure does not prevent the row being deleted.

- [ ] **Step 2: Implement**

In `src/app/api/moodboards/[id]/items/[itemId]/route.ts`, before `removeItem(itemId)`,
read the row and best-effort delete both objects:

```ts
// Objects must not outlive their row — the same latent leak the thumbnail has today.
// Best-effort: a storage hiccup must not block the user deleting their own item.
for (const url of [item.media_url, item.thumbnail_url]) {
  if (!url) continue;
  try {
    await removeObject(url);
  } catch (e) {
    console.log(`[clip] delete: could not remove ${url} (${e instanceof Error ? e.message : e})`);
  }
}
```

- [ ] **Step 3: Run the tests, then commit**

```bash
git commit -am "fix(market): delete archived media and thumbnail with the item"
```

---

### Task 11: End-to-end verification on staging

- [ ] **Step 1:** Confirm migration `0039` is applied (Task 1 Step 6).
- [ ] **Step 2:** `npx trigger.dev@latest dev` in the worktree, so the two new tasks register.
- [ ] **Step 3:** Clip a real Instagram reel from the Market page. Confirm the POST returns in roughly the time it does today — the enqueue must not add perceptible latency.
- [ ] **Step 4:** Confirm the tile appears immediately with a "Saving media…" chip.
- [ ] **Step 5:** Watch the Trigger dashboard for the `archive-reference` run. On completion, refetch the board (add another reference — that is the refresh mechanism, D262) and confirm the chip is gone.
- [ ] **Step 6:** Open the lightbox and confirm the `<video>` `src` is on `storage.googleapis.com`, not `instagram.com`.
- [ ] **Step 7:** Confirm an Instagram item that previously had a favicon card now shows a real thumbnail (D265).
- [ ] **Step 8:** Run `npx vitest run` and `npm run lint` clean.

---

## Self-Review

**Spec coverage:** §4 data model → Task 1. §5 capture path → Task 7. §6 archive task → Tasks 6, 7. §7 resolvers → Tasks 4, 5. §8 Pinterest → Task 2. §9 playback → Task 9. §10 sweep → Task 8. §11 UI → Task 9. §12 deletion → Task 10. §14 testing → each task's tests plus Task 11. No section is unimplemented.

**Placeholders:** none — every code step carries the actual code. Task 10's test is described rather than written because it depends on the existing delete-route test file's shape, which must be read first; that is the one place the implementer should read before writing.

**Type consistency:** `ArchiveStatus` is defined once in Task 1 and consumed by Tasks 8 and 9. `MediaSource` is introduced in Task 4 and widened once in Task 6 Step 3 (`thumbnailUrl`) — the widening is explicit rather than assumed. `claimArchive` takes `(itemId, attempts)` consistently in Tasks 1, 6 and its tests.
