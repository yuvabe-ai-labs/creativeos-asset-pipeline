# Handle Performance Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth Market tab, **Performance**, showing the client's Instagram account metrics from a daily Apify snapshot pipeline we own (D205–D208).

**Architecture:** A Trigger.dev scheduled task calls `apify/instagram-scraper` (`resultsType: "details"`, sync endpoint) daily per client handle, normalizes the payload through a pure module, and writes `account_snapshots` (time series + raw payload) and `tracked_posts` (latest metrics, upserted by shortcode, GCS-re-hosted thumbnails). A `withClient` GET route serves the tab; a POST refresh route runs the same orchestrator on demand with a 1-hour guard.

**Tech Stack:** Next.js (this repo's version — read `node_modules/next/dist/docs/` before route work), Supabase (service-role via `createServerSupabase`), Trigger.dev v3 (`schedules.task`), Vitest, shadcn/Base UI primitives, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-03-handle-performance-design.md` (decisions D205–D208 in `2026-05-30-creativeos-staging-roadmap.md` §7).

## Global Constraints

- Execute in a worktree created from `main` (superpowers:using-git-worktrees). **Run `npm install` in the worktree — never junction/symlink `node_modules`** (Turbopack rejects the symlink).
- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI — `render` prop, not `asChild`). Never a raw `<button>`/`<input>`/`<select>`.
- API routes use `apiError(message, status)` / `apiOk(data)` / `withClient(req, params, handler)` / `withTryCatch(fallbackMessage, handler)` from `src/lib/api/route-helpers.ts` — never `NextResponse.json` directly.
- Design system: purple `#5829c7` scarce, drive colors through the shadcn CSS variables in `globals.css`, `shadow-card` for resting cards, Lucide icons at 1.5 stroke, easing `cubic-bezier(0.22,1,0.36,1)`.
- One component per file, named exports, split at ~200 lines, no prop drilling (`docs/component-structure.md`).
- Import, don't redefine: `getBrandDetails` from `@/lib/db/brand-kit`, `uploadMarketThumbnail` from `@/lib/storage`, `THUMBNAIL_SIZE_LIMIT` from `@/lib/market/constants`, `authFetch` from `@/lib/supabase/session-ready`.
- Trigger task files: `@/lib` imports must be **dynamic** (`await import(...)`) because those modules carry `import "server-only"` (see `trigger/reconcile-stuck-generations.ts` header comment).
- `APIFY_TOKEN` env var: never commit it; it goes in `.env.local` (dev) and the Trigger.dev project env (deployed).
- Vitest timeouts on first cold run can be flakes (see kling-test-flake memory) — re-run before investigating.
- Commit after every green test cycle. End commit messages with the Claude Code trailer.

---

### Task 1: Migration `0035_handle_performance.sql`

**Files:**
- Create: `supabase/migrations/0035_handle_performance.sql`

**Interfaces:**
- Consumes: existing `clients(id)` table; RLS convention from `0027_brand_kit.sql` (enable RLS, zero policies — service-role bypasses).
- Produces: tables `account_snapshots`, `tracked_posts` used by Task 4's db module.

- [ ] **Step 1: Write the migration**

```sql
-- Handle Performance (D205, D207): daily Apify snapshots of the client's Instagram
-- account. account_snapshots is the time series (one row per scrape, full provider
-- payload kept in raw — normalize-at-boundary, D207); tracked_posts holds the LATEST
-- metrics per post, upserted by shortcode. platform is check-constrained single-value
-- today so competitor/TikTok expansion (V1.x) is a constraint change, not a reshape.

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
  likes_count      int,            -- null = provider hid the count (-1 sentinel dies at ingest)
  comments_count   int not null default 0,
  video_view_count int,            -- videos only
  posted_at        timestamptz not null,
  thumbnail_url    text,           -- GCS re-hosted; the provider displayUrl expires
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (client_id, platform, short_code)
);

create index tracked_posts_client_idx on tracked_posts (client_id, posted_at desc);

-- Default-deny RLS, matching 0017/0027: enable with zero policies. App access goes
-- through the service-role client (createServerSupabase), which bypasses RLS; this
-- only closes the direct-REST path.
alter table account_snapshots enable row level security;
alter table tracked_posts enable row level security;
```

- [ ] **Step 2: Apply to the dev database**

Run: `npx supabase db push` (or paste into the Supabase SQL editor for the dev project if the CLI isn't linked). Note: memory records migration 0034 as possibly unapplied on some environments — `db push` applies pending migrations in filename order, which is correct; do not reorder.

- [ ] **Step 3: Verify tables exist**

Run in SQL editor or psql: `select count(*) from account_snapshots; select count(*) from tracked_posts;`
Expected: both return 0 rows, no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0035_handle_performance.sql
git commit -m "feat(db): account_snapshots + tracked_posts for handle performance (D205)"
```

---

### Task 2: Pure module — parser, normalizer, stats

**Files:**
- Create: `src/lib/market/performance.ts`
- Test: `src/lib/market/performance.test.ts`

**Interfaces:**
- Consumes: nothing from this repo (pure).
- Produces (exact signatures later tasks rely on):
  - `parseInstagramHandle(raw: string | null | undefined): string | null`
  - `type NormalizedPost = { shortCode: string; postType: "image" | "video" | "carousel"; caption: string; postUrl: string; likesCount: number | null; commentsCount: number; videoViewCount: number | null; postedAt: string; displayUrl: string | null }`
  - `type NormalizedSnapshot = { handle: string; followersCount: number; followsCount: number; postsCount: number; raw: unknown }`
  - `normalizeProfileItem(item: ApifyProfileItem): { snapshot: NormalizedSnapshot; posts: NormalizedPost[] }`
  - `type PerformanceStats = { engagementRate: number | null; medianLikes: number | null; cadencePerMonth: number | null; followerDelta7d: number | null }`
  - `computeStats(input: { posts: { likesCount: number | null; commentsCount: number; postedAt: string }[]; followers: number | null; series: { capturedAt: string; followers: number }[] }): PerformanceStats`
  - `postMultiplier(likesCount: number | null, medianLikes: number | null): number | null`
  - `type ApifyProfileItem` (the subset of the actor payload we read)

- [ ] **Step 1: Write the failing tests** (fixture values are the real 2026-09-03 spike payload)

```ts
import { describe, it, expect } from "vitest";
import {
  parseInstagramHandle,
  normalizeProfileItem,
  computeStats,
  postMultiplier,
  type ApifyProfileItem,
} from "./performance";

const FIXTURE: ApifyProfileItem = {
  username: "prakritisattva",
  fullName: "Prakriti Sattva - The Essence of Nature",
  biography: "Holistic health/Natural beauty",
  externalUrl: "https://prakritisattva.etsy.com",
  businessCategoryName: "Health/beauty",
  followersCount: 144,
  followsCount: 62,
  postsCount: 57,
  profilePicUrlHD: "https://cdn.example/avatar.jpg",
  latestPosts: [
    { shortCode: "AAA", type: "Video", caption: "Honor the work your body does",
      url: "https://www.instagram.com/p/AAA/", likesCount: 1, commentsCount: 0,
      videoViewCount: 9, timestamp: "2026-08-28T10:00:00.000Z",
      displayUrl: "https://cdn.example/aaa.jpg" },
    { shortCode: "BBB", type: "Sidecar", caption: "Elevate your hair care ritual",
      url: "https://www.instagram.com/p/BBB/", likesCount: 3, commentsCount: 0,
      timestamp: "2026-06-18T10:00:00.000Z", displayUrl: "https://cdn.example/bbb.jpg" },
    { shortCode: "CCC", type: "Image", caption: "Honor Her Nature",
      url: "https://www.instagram.com/p/CCC/", likesCount: -1, commentsCount: 0,
      timestamp: "2026-04-28T10:00:00.000Z", displayUrl: "https://cdn.example/ccc.jpg" },
    { shortCode: "DDD", type: "Image", caption: "CAAM Ayurveda Mela",
      url: "https://www.instagram.com/p/DDD/", likesCount: 7, commentsCount: 0,
      timestamp: "2026-03-11T10:00:00.000Z", displayUrl: "https://cdn.example/ddd.jpg" },
  ],
};

describe("parseInstagramHandle", () => {
  it("strips @ and whitespace", () => {
    expect(parseInstagramHandle(" @PrakritiSattva ")).toBe("prakritisattva");
  });
  it("extracts the handle from a profile URL", () => {
    expect(parseInstagramHandle("https://www.instagram.com/prakritisattva/")).toBe("prakritisattva");
  });
  it("extracts from a URL with query junk", () => {
    expect(parseInstagramHandle("https://instagram.com/prakritisattva?igsh=abc")).toBe("prakritisattva");
  });
  it("returns null for empty, absent, or invalid input", () => {
    expect(parseInstagramHandle(undefined)).toBeNull();
    expect(parseInstagramHandle("")).toBeNull();
    expect(parseInstagramHandle("not a handle!!")).toBeNull();
    expect(parseInstagramHandle("https://instagram.com/")).toBeNull();
  });
});

describe("normalizeProfileItem", () => {
  const { snapshot, posts } = normalizeProfileItem(FIXTURE);
  it("maps account counts and keeps raw", () => {
    expect(snapshot.handle).toBe("prakritisattva");
    expect(snapshot.followersCount).toBe(144);
    expect(snapshot.followsCount).toBe(62);
    expect(snapshot.postsCount).toBe(57);
    expect(snapshot.raw).toBe(FIXTURE);
  });
  it("converts the -1 hidden-likes sentinel to null", () => {
    expect(posts.find((p) => p.shortCode === "CCC")?.likesCount).toBeNull();
  });
  it("maps provider types to image/video/carousel", () => {
    expect(posts.find((p) => p.shortCode === "AAA")?.postType).toBe("video");
    expect(posts.find((p) => p.shortCode === "BBB")?.postType).toBe("carousel");
    expect(posts.find((p) => p.shortCode === "DDD")?.postType).toBe("image");
  });
  it("keeps video views only for videos", () => {
    expect(posts.find((p) => p.shortCode === "AAA")?.videoViewCount).toBe(9);
    expect(posts.find((p) => p.shortCode === "DDD")?.videoViewCount).toBeNull();
  });
});

describe("computeStats", () => {
  const posts = [
    { likesCount: 1, commentsCount: 0, postedAt: "2026-08-28T10:00:00.000Z" },
    { likesCount: 3, commentsCount: 0, postedAt: "2026-06-18T10:00:00.000Z" },
    { likesCount: null, commentsCount: 0, postedAt: "2026-04-28T10:00:00.000Z" }, // hidden — excluded
    { likesCount: 7, commentsCount: 0, postedAt: "2026-03-11T10:00:00.000Z" },
  ];
  it("computes median likes excluding hidden and engagement rate", () => {
    const s = computeStats({ posts, followers: 144, series: [] });
    expect(s.medianLikes).toBe(3); // median of [1,3,7]
    expect(s.engagementRate).toBeCloseTo(3 / 144, 5); // median comments = 0
  });
  it("computes cadence from the posted_at spread", () => {
    const s = computeStats({ posts, followers: 144, series: [] });
    // 4 posts over ~170 days ≈ 0.7/mo
    expect(s.cadencePerMonth).toBeGreaterThan(0.5);
    expect(s.cadencePerMonth).toBeLessThan(1.0);
  });
  it("computes follower delta from a snapshot ≥7d older, else null", () => {
    const now = new Date("2026-09-03T09:00:00.000Z").toISOString();
    const old = new Date("2026-08-25T09:00:00.000Z").toISOString();
    const s = computeStats({
      posts: [], followers: 144,
      series: [{ capturedAt: old, followers: 141 }, { capturedAt: now, followers: 144 }],
    });
    expect(s.followerDelta7d).toBe(3);
    const s2 = computeStats({ posts: [], followers: 144, series: [{ capturedAt: now, followers: 144 }] });
    expect(s2.followerDelta7d).toBeNull();
  });
  it("returns nulls when there is nothing to compute from", () => {
    const s = computeStats({ posts: [], followers: null, series: [] });
    expect(s).toEqual({ engagementRate: null, medianLikes: null, cadencePerMonth: null, followerDelta7d: null });
  });
});

describe("postMultiplier", () => {
  it("is likes / median", () => expect(postMultiplier(7, 2)).toBe(3.5));
  it("null when likes hidden or median unusable", () => {
    expect(postMultiplier(null, 2)).toBeNull();
    expect(postMultiplier(7, null)).toBeNull();
    expect(postMultiplier(7, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/market/performance.test.ts`
Expected: FAIL — module `./performance` not found.

- [ ] **Step 3: Implement `src/lib/market/performance.ts`**

```ts
// Pure normalization + derivation for the Performance tab (D205, D207). No I/O here:
// the Apify payload comes in, nulls and numbers come out, so every rule (the -1
// hidden-likes sentinel, median-vs-hidden exclusion, engagement math) is unit-testable
// against the real spike fixture.

export type ApifyPost = {
  shortCode: string;
  type: string; // "Image" | "Video" | "Sidecar" (provider vocabulary)
  caption?: string;
  url: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  timestamp: string;
  displayUrl?: string;
};

export type ApifyProfileItem = {
  username: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  businessCategoryName?: string;
  profilePicUrlHD?: string;
  followersCount: number;
  followsCount?: number;
  postsCount?: number;
  latestPosts?: ApifyPost[];
};

export type NormalizedSnapshot = {
  handle: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  raw: unknown;
};

export type NormalizedPost = {
  shortCode: string;
  postType: "image" | "video" | "carousel";
  caption: string;
  postUrl: string;
  likesCount: number | null;
  commentsCount: number;
  videoViewCount: number | null;
  postedAt: string;
  displayUrl: string | null;
};

export type PerformanceStats = {
  engagementRate: number | null;
  medianLikes: number | null;
  cadencePerMonth: number | null;
  followerDelta7d: number | null;
};

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function parseInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (candidate.includes("instagram.com")) {
    try {
      const url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  candidate = candidate.replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(candidate) ? candidate : null;
}

const TYPE_MAP: Record<string, NormalizedPost["postType"]> = {
  Image: "image",
  Video: "video",
  Sidecar: "carousel",
};

export function normalizeProfileItem(item: ApifyProfileItem): {
  snapshot: NormalizedSnapshot;
  posts: NormalizedPost[];
} {
  const snapshot: NormalizedSnapshot = {
    handle: item.username.toLowerCase(),
    followersCount: item.followersCount,
    followsCount: item.followsCount ?? 0,
    postsCount: item.postsCount ?? 0,
    raw: item,
  };
  const posts: NormalizedPost[] = (item.latestPosts ?? []).map((p) => {
    const postType = TYPE_MAP[p.type] ?? "image";
    return {
      shortCode: p.shortCode,
      postType,
      caption: p.caption ?? "",
      postUrl: p.url,
      // -1 is the provider's in-band "the platform hid this count" sentinel (D207);
      // it must become null HERE so it can never poison a median downstream.
      likesCount: p.likesCount == null || p.likesCount < 0 ? null : p.likesCount,
      commentsCount: p.commentsCount ?? 0,
      videoViewCount: postType === "video" ? (p.videoViewCount ?? null) : null,
      postedAt: p.timestamp,
      displayUrl: p.displayUrl ?? null,
    };
  });
  return { snapshot, posts };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MS_PER_DAY = 86_400_000;

export function computeStats(input: {
  posts: { likesCount: number | null; commentsCount: number; postedAt: string }[];
  followers: number | null;
  series: { capturedAt: string; followers: number }[];
}): PerformanceStats {
  const visible = input.posts.filter((p) => p.likesCount !== null);
  const medianLikes = median(visible.map((p) => p.likesCount as number));
  const medianComments = median(input.posts.map((p) => p.commentsCount));

  const engagementRate =
    medianLikes !== null && medianComments !== null && input.followers
      ? (medianLikes + medianComments) / input.followers
      : null;

  let cadencePerMonth: number | null = null;
  if (input.posts.length >= 2) {
    const times = input.posts.map((p) => new Date(p.postedAt).getTime());
    const spreadDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;
    if (spreadDays > 0) cadencePerMonth = input.posts.length / (spreadDays / 30.44);
  }

  let followerDelta7d: number | null = null;
  if (input.series.length >= 2) {
    const sorted = [...input.series].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );
    const latest = sorted[sorted.length - 1];
    const cutoff = new Date(latest.capturedAt).getTime() - 7 * MS_PER_DAY;
    // Most recent snapshot at least 7 days older than the latest one.
    const baseline = [...sorted]
      .reverse()
      .find((s) => new Date(s.capturedAt).getTime() <= cutoff);
    if (baseline) followerDelta7d = latest.followers - baseline.followers;
  }

  return { engagementRate, medianLikes, cadencePerMonth, followerDelta7d };
}

export function postMultiplier(
  likesCount: number | null,
  medianLikes: number | null,
): number | null {
  if (likesCount === null || medianLikes === null || medianLikes <= 0) return null;
  return likesCount / medianLikes;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/market/performance.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/performance.ts src/lib/market/performance.test.ts
git commit -m "feat(market): pure handle-performance normalizer + stats (D207)"
```

---

### Task 3: Apify client

**Files:**
- Create: `src/lib/market/apify.ts`
- Test: `src/lib/market/apify.test.ts`

**Interfaces:**
- Consumes: `ApifyProfileItem` type from Task 2.
- Produces: `fetchProfileDetails(handle: string, opts: { token: string; fetchImpl?: typeof fetch }): Promise<ApifyProfileItem | null>` — `null` when the actor returns an empty dataset (unknown/private handle); throws on HTTP failure.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchProfileDetails } from "./apify";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchProfileDetails", () => {
  it("POSTs the profile URL to the sync dataset endpoint with a bearer token", async () => {
    const fetchImpl = mockFetch(201, [{ username: "prakritisattva", followersCount: 144 }]);
    const item = await fetchProfileDetails("prakritisattva", { token: "tok", fetchImpl });
    expect(item?.username).toBe("prakritisattva");
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("apify~instagram-scraper/run-sync-get-dataset-items");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.directUrls).toEqual(["https://www.instagram.com/prakritisattva/"]);
    expect(body.resultsType).toBe("details");
  });
  it("returns null for an empty dataset", async () => {
    const item = await fetchProfileDetails("nobody", { token: "tok", fetchImpl: mockFetch(201, []) });
    expect(item).toBeNull();
  });
  it("throws on an HTTP error", async () => {
    await expect(
      fetchProfileDetails("x", { token: "tok", fetchImpl: mockFetch(402, { error: "quota" }) }),
    ).rejects.toThrow(/402/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/market/apify.test.ts`
Expected: FAIL — module `./apify` not found.

- [ ] **Step 3: Implement `src/lib/market/apify.ts`**

```ts
// Thin client for the one Apify call the performance pipeline makes (D205).
// run-sync-get-dataset-items runs the actor and returns dataset items in one request
// (~9s for a profile in the 2026-09-03 spike; server-side cap via ?timeout=).
import type { ApifyProfileItem } from "./performance";

const ENDPOINT =
  "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=280";

export async function fetchProfileDetails(
  handle: string,
  opts: { token: string; fetchImpl?: typeof fetch },
): Promise<ApifyProfileItem | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      addParentData: false,
    }),
  });
  if (!res.ok) throw new Error(`Apify request failed: HTTP ${res.status}`);
  const items = (await res.json()) as ApifyProfileItem[];
  return items[0] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/market/apify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/apify.ts src/lib/market/apify.test.ts
git commit -m "feat(market): apify instagram-scraper client"
```

---

### Task 4: DB module

**Files:**
- Create: `src/lib/db/performance.ts`

**Interfaces:**
- Consumes: `createServerSupabase` from `@/lib/supabase/server`; `NormalizedSnapshot`, `NormalizedPost` from Task 2; `parseInstagramHandle` from Task 2; `BrandDetails` from `@/lib/brand-kit/types`.
- Produces (later tasks import these exact names):
  - `type AccountSnapshotRow = { id: string; client_id: string; platform: string; handle: string; followers_count: number; follows_count: number; posts_count: number; captured_at: string }` (raw omitted from reads — it's write-only in V1)
  - `type TrackedPostRow = { id: string; client_id: string; platform: string; handle: string; short_code: string; post_type: "image" | "video" | "carousel"; caption: string; post_url: string; likes_count: number | null; comments_count: number; video_view_count: number | null; posted_at: string; thumbnail_url: string | null; first_seen_at: string; last_seen_at: string }`
  - `insertAccountSnapshot(clientId: string, snap: NormalizedSnapshot): Promise<AccountSnapshotRow>`
  - `upsertTrackedPost(clientId: string, handle: string, post: NormalizedPost): Promise<TrackedPostRow>`
  - `updateTrackedPostThumbnail(id: string, url: string): Promise<void>`
  - `getLatestSnapshot(clientId: string): Promise<AccountSnapshotRow | null>`
  - `listFollowerSeries(clientId: string): Promise<{ captured_at: string; followers_count: number }[]>`
  - `listTrackedPosts(clientId: string): Promise<TrackedPostRow[]>` (newest `posted_at` first)
  - `listClientsWithInstagramHandle(): Promise<{ id: string; handle: string }[]>`

No unit test — thin Supabase wrappers, matching `src/lib/db/moodboards.ts` convention; route/orchestrator tests mock this module.

- [ ] **Step 1: Implement `src/lib/db/performance.ts`**

```ts
// DB access for the Performance tab (D205). Thin wrappers over the service-role
// client, like the other src/lib/db modules — derivation lives in
// src/lib/market/performance.ts, not here.
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  parseInstagramHandle,
  type NormalizedPost,
  type NormalizedSnapshot,
} from "@/lib/market/performance";
import type { BrandDetails } from "@/lib/brand-kit/types";

export type AccountSnapshotRow = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  followers_count: number;
  follows_count: number;
  posts_count: number;
  captured_at: string;
};

export type TrackedPostRow = {
  id: string;
  client_id: string;
  platform: string;
  handle: string;
  short_code: string;
  post_type: "image" | "video" | "carousel";
  caption: string;
  post_url: string;
  likes_count: number | null;
  comments_count: number;
  video_view_count: number | null;
  posted_at: string;
  thumbnail_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

const SNAPSHOT_COLS =
  "id, client_id, platform, handle, followers_count, follows_count, posts_count, captured_at";

export async function insertAccountSnapshot(
  clientId: string,
  snap: NormalizedSnapshot,
): Promise<AccountSnapshotRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .insert({
      client_id: clientId,
      handle: snap.handle,
      followers_count: snap.followersCount,
      follows_count: snap.followsCount,
      posts_count: snap.postsCount,
      raw: snap.raw,
    })
    .select(SNAPSHOT_COLS)
    .single();
  if (error) throw error;
  return data as AccountSnapshotRow;
}

export async function upsertTrackedPost(
  clientId: string,
  handle: string,
  post: NormalizedPost,
): Promise<TrackedPostRow> {
  const supabase = createServerSupabase();
  // thumbnail_url and first_seen_at are deliberately ABSENT from the payload: on
  // conflict, Supabase updates only the provided columns, so both survive re-scrapes.
  const { data, error } = await supabase
    .from("tracked_posts")
    .upsert(
      {
        client_id: clientId,
        handle,
        short_code: post.shortCode,
        post_type: post.postType,
        caption: post.caption,
        post_url: post.postUrl,
        likes_count: post.likesCount,
        comments_count: post.commentsCount,
        video_view_count: post.videoViewCount,
        posted_at: post.postedAt,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "client_id,platform,short_code" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as TrackedPostRow;
}

export async function updateTrackedPostThumbnail(id: string, url: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("tracked_posts")
    .update({ thumbnail_url: url })
    .eq("id", id);
  if (error) throw error;
}

export async function getLatestSnapshot(clientId: string): Promise<AccountSnapshotRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .select(SNAPSHOT_COLS)
    .eq("client_id", clientId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountSnapshotRow | null) ?? null;
}

export async function listFollowerSeries(
  clientId: string,
): Promise<{ captured_at: string; followers_count: number }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("account_snapshots")
    .select("captured_at, followers_count")
    .eq("client_id", clientId)
    .order("captured_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as { captured_at: string; followers_count: number }[];
}

export async function listTrackedPosts(clientId: string): Promise<TrackedPostRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("tracked_posts")
    .select("*")
    .eq("client_id", clientId)
    .order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TrackedPostRow[];
}

/** Every client the daily sweep should scrape: has a parseable brand_details.instagram. */
export async function listClientsWithInstagramHandle(): Promise<{ id: string; handle: string }[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("clients").select("id, brand_details");
  if (error) throw error;
  const rows = (data ?? []) as { id: string; brand_details: BrandDetails | null }[];
  return rows.flatMap((row) => {
    const handle = parseInstagramHandle(row.brand_details?.instagram);
    return handle ? [{ id: row.id, handle }] : [];
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing failures noted in project memory are unrelated).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/performance.ts
git commit -m "feat(db): performance snapshot + tracked-post accessors"
```

---

### Task 5: Snapshot orchestrator

**Files:**
- Create: `src/lib/market/snapshot.ts`
- Test: `src/lib/market/snapshot.test.ts`

**Interfaces:**
- Consumes: `getBrandDetails` (`@/lib/db/brand-kit`), `fetchProfileDetails` (Task 3), `normalizeProfileItem`/`parseInstagramHandle` (Task 2), db functions (Task 4), `uploadMarketThumbnail` (`@/lib/storage`), `THUMBNAIL_SIZE_LIMIT` (`@/lib/market/constants`), `process.env.APIFY_TOKEN`.
- Produces: `snapshotClientHandle(clientId: string, opts?: { fetchImpl?: typeof fetch }): Promise<{ ok: true; handle: string; postCount: number } | { ok: false; reason: "no-handle" | "no-data" }>` — used verbatim by the trigger task (Task 8) and the refresh route (Task 7).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn() }));
vi.mock("@/lib/db/performance", () => ({
  insertAccountSnapshot: vi.fn(async () => ({ id: "snap-1" })),
  upsertTrackedPost: vi.fn(async () => ({ id: "post-1", thumbnail_url: null })),
  updateTrackedPostThumbnail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/market/apify", () => ({ fetchProfileDetails: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  uploadMarketThumbnail: vi.fn(async () => ({ url: "https://gcs/thumb.jpg" })),
}));

import { getBrandDetails } from "@/lib/db/brand-kit";
import { fetchProfileDetails } from "@/lib/market/apify";
import {
  insertAccountSnapshot,
  upsertTrackedPost,
  updateTrackedPostThumbnail,
} from "@/lib/db/performance";
import { uploadMarketThumbnail } from "@/lib/storage";
import { snapshotClientHandle } from "./snapshot";

const PROFILE = {
  username: "prakritisattva",
  followersCount: 144,
  followsCount: 62,
  postsCount: 57,
  latestPosts: [
    { shortCode: "AAA", type: "Image", url: "https://instagram.com/p/AAA/",
      likesCount: 7, commentsCount: 0, timestamp: "2026-03-11T10:00:00.000Z",
      displayUrl: "https://cdn.example/aaa.jpg" },
  ],
};

// Serves the thumbnail image fetch inside the orchestrator.
const imageFetch = vi.fn(async () => ({
  ok: true,
  headers: new Headers({ "content-type": "image/jpeg" }),
  arrayBuffer: async () => new ArrayBuffer(10),
})) as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APIFY_TOKEN = "test-token";
});

describe("snapshotClientHandle", () => {
  it("returns no-handle when brand_details has no parseable handle", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({});
    const r = await snapshotClientHandle("client-1");
    expect(r).toEqual({ ok: false, reason: "no-handle" });
    expect(vi.mocked(fetchProfileDetails)).not.toHaveBeenCalled();
  });

  it("returns no-data when the actor finds nothing", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(null);
    const r = await snapshotClientHandle("client-1");
    expect(r).toEqual({ ok: false, reason: "no-data" });
  });

  it("inserts a snapshot, upserts posts, re-hosts missing thumbnails", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(PROFILE as never);
    const r = await snapshotClientHandle("client-1", { fetchImpl: imageFetch });
    expect(r).toEqual({ ok: true, handle: "prakritisattva", postCount: 1 });
    expect(vi.mocked(insertAccountSnapshot)).toHaveBeenCalledWith(
      "client-1",
      expect.objectContaining({ followersCount: 144 }),
    );
    expect(vi.mocked(upsertTrackedPost)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(uploadMarketThumbnail)).toHaveBeenCalled();
    expect(vi.mocked(updateTrackedPostThumbnail)).toHaveBeenCalledWith("post-1", "https://gcs/thumb.jpg");
  });

  it("keeps the snapshot even when the thumbnail step throws", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(PROFILE as never);
    const failingFetch = vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch;
    const r = await snapshotClientHandle("client-1", { fetchImpl: failingFetch });
    expect(r).toEqual({ ok: true, handle: "prakritisattva", postCount: 1 });
    expect(vi.mocked(updateTrackedPostThumbnail)).not.toHaveBeenCalled();
  });

  it("skips re-hosting when the row already has a thumbnail", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(fetchProfileDetails).mockResolvedValue(PROFILE as never);
    vi.mocked(upsertTrackedPost).mockResolvedValue({ id: "post-1", thumbnail_url: "https://gcs/old.jpg" } as never);
    await snapshotClientHandle("client-1", { fetchImpl: imageFetch });
    expect(vi.mocked(uploadMarketThumbnail)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/market/snapshot.test.ts`
Expected: FAIL — module `./snapshot` not found.

- [ ] **Step 3: Implement `src/lib/market/snapshot.ts`**

```ts
// The one snapshot path both callers use (daily trigger sweep + manual refresh route),
// mirroring ingestReference's contract: the SNAPSHOT always saves; thumbnails are
// best-effort decoration (D185's spirit). Only a DB/provider failure propagates.
import "server-only";
import { getBrandDetails } from "@/lib/db/brand-kit";
import {
  insertAccountSnapshot,
  upsertTrackedPost,
  updateTrackedPostThumbnail,
} from "@/lib/db/performance";
import { uploadMarketThumbnail } from "@/lib/storage";
import { THUMBNAIL_SIZE_LIMIT } from "./constants";
import { fetchProfileDetails } from "./apify";
import { parseInstagramHandle, normalizeProfileItem } from "./performance";

export type SnapshotResult =
  | { ok: true; handle: string; postCount: number }
  | { ok: false; reason: "no-handle" | "no-data" };

export async function snapshotClientHandle(
  clientId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<SnapshotResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;

  const details = await getBrandDetails(clientId);
  const handle = parseInstagramHandle(details.instagram);
  if (!handle) return { ok: false, reason: "no-handle" };

  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Missing APIFY_TOKEN env var");

  const item = await fetchProfileDetails(handle, { token, fetchImpl });
  if (!item) return { ok: false, reason: "no-data" };

  const { snapshot, posts } = normalizeProfileItem(item);
  await insertAccountSnapshot(clientId, snapshot);

  for (const post of posts) {
    const row = await upsertTrackedPost(clientId, handle, post);
    // Re-host once per post ever: displayUrl is a short-lived CDN link, GCS is not.
    if (row.thumbnail_url || !post.displayUrl) continue;
    try {
      const res = await fetchImpl(post.displayUrl);
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) continue;
      const { url } = await uploadMarketThumbnail({
        clientId,
        itemId: row.id,
        body: buffer,
        contentType,
      });
      await updateTrackedPostThumbnail(row.id, url);
    } catch {
      // Degraded tile by design — never fail the snapshot on preview problems.
    }
  }

  return { ok: true, handle, postCount: posts.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/market/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/snapshot.ts src/lib/market/snapshot.test.ts
git commit -m "feat(market): snapshotClientHandle orchestrator (D205)"
```

---

### Task 6: GET performance route

**Files:**
- Create: `src/app/api/clients/[id]/performance/route.ts`
- Test: `src/app/api/clients/[id]/performance/route.test.ts`

**Interfaces:**
- Consumes: `getLatestSnapshot`, `listFollowerSeries`, `listTrackedPosts` (Task 4); `getBrandDetails`; `parseInstagramHandle`, `computeStats` (Task 2); route helpers.
- Produces the response shape the hook (Task 9) reads:

```ts
type PerformancePayload = {
  handle: string | null;
  latest: { followersCount: number; followsCount: number; postsCount: number; capturedAt: string } | null;
  series: { capturedAt: string; followers: number }[];
  posts: TrackedPostRow[]; // snake_case rows, newest first
  stats: PerformanceStats;
};
```

- [ ] **Step 1: Write the failing test** (copy the mock preamble style from `src/app/api/clients/[id]/market/route.test.ts` — it is the house harness for `withClient` routes)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1", platformRole: "member", orgId: "org-1", orgRole: "designer",
    mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({
  logImpersonationEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1", slug: "acme", name: "Acme" })),
}));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn() }));
vi.mock("@/lib/db/performance", () => ({
  getLatestSnapshot: vi.fn(),
  listFollowerSeries: vi.fn(),
  listTrackedPosts: vi.fn(),
}));

import { getBrandDetails } from "@/lib/db/brand-kit";
import { getLatestSnapshot, listFollowerSeries, listTrackedPosts } from "@/lib/db/performance";

const params = Promise.resolve({ id: "client-1" });
const req = () => new Request("http://test/api/clients/client-1/performance");

describe("GET /api/clients/[id]/performance", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns null handle when brand_details has none", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({});
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(listFollowerSeries).mockResolvedValue([]);
    vi.mocked(listTrackedPosts).mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBeNull();
    expect(body.latest).toBeNull();
  });

  it("returns snapshot, series, posts, and computed stats", async () => {
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "@prakritisattva" });
    vi.mocked(getLatestSnapshot).mockResolvedValue({
      id: "s1", client_id: "client-1", platform: "instagram", handle: "prakritisattva",
      followers_count: 144, follows_count: 62, posts_count: 57,
      captured_at: "2026-09-03T05:00:00.000Z",
    });
    vi.mocked(listFollowerSeries).mockResolvedValue([
      { captured_at: "2026-08-25T05:00:00.000Z", followers_count: 141 },
      { captured_at: "2026-09-03T05:00:00.000Z", followers_count: 144 },
    ]);
    vi.mocked(listTrackedPosts).mockResolvedValue([
      { id: "p1", client_id: "client-1", platform: "instagram", handle: "prakritisattva",
        short_code: "DDD", post_type: "image", caption: "Mela", post_url: "u",
        likes_count: 7, comments_count: 0, video_view_count: null,
        posted_at: "2026-03-11T10:00:00.000Z", thumbnail_url: null,
        first_seen_at: "t", last_seen_at: "t" },
    ] as never);
    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handle).toBe("prakritisattva");
    expect(body.latest.followersCount).toBe(144);
    expect(body.series).toHaveLength(2);
    expect(body.posts[0].short_code).toBe("DDD");
    expect(body.stats.medianLikes).toBe(7);
    expect(body.stats.followerDelta7d).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/performance/route.test.ts"`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement `route.ts`**

```ts
import { NextRequest } from "next/server";
import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getBrandDetails } from "@/lib/db/brand-kit";
import {
  getLatestSnapshot,
  listFollowerSeries,
  listTrackedPosts,
} from "@/lib/db/performance";
import { computeStats, parseInstagramHandle } from "@/lib/market/performance";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load performance data.", async () => {
      const [details, latest, seriesRows, posts] = await Promise.all([
        getBrandDetails(clientId),
        getLatestSnapshot(clientId),
        listFollowerSeries(clientId),
        listTrackedPosts(clientId),
      ]);
      const series = seriesRows.map((r) => ({
        capturedAt: r.captured_at,
        followers: r.followers_count,
      }));
      const stats = computeStats({
        posts: posts.map((p) => ({
          likesCount: p.likes_count,
          commentsCount: p.comments_count,
          postedAt: p.posted_at,
        })),
        followers: latest?.followers_count ?? null,
        series,
      });
      return apiOk({
        handle: parseInstagramHandle(details.instagram),
        latest: latest
          ? {
              followersCount: latest.followers_count,
              followsCount: latest.follows_count,
              postsCount: latest.posts_count,
              capturedAt: latest.captured_at,
            }
          : null,
        series,
        posts,
        stats,
      });
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/clients/[id]/performance/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[id]/performance/route.ts" "src/app/api/clients/[id]/performance/route.test.ts"
git commit -m "feat(api): GET client performance payload"
```

---

### Task 7: POST refresh route (1-hour guard)

**Files:**
- Create: `src/app/api/clients/[id]/performance/refresh/route.ts`
- Test: `src/app/api/clients/[id]/performance/refresh/route.test.ts`

**Interfaces:**
- Consumes: `getLatestSnapshot` (Task 4), `snapshotClientHandle` (Task 5), route helpers.
- Produces: `POST /api/clients/[id]/performance/refresh` → `200 {ok: true}` | `409` (no handle) | `429` (too soon). The hook (Task 9) calls it.

- [ ] **Step 1: Write the failing test** (same mock preamble as Task 6 for dal/impersonation/clients; then)

```ts
vi.mock("@/lib/db/performance", () => ({ getLatestSnapshot: vi.fn() }));
vi.mock("@/lib/market/snapshot", () => ({ snapshotClientHandle: vi.fn() }));

import { getLatestSnapshot } from "@/lib/db/performance";
import { snapshotClientHandle } from "@/lib/market/snapshot";

const params = Promise.resolve({ id: "client-1" });
const req = () =>
  new Request("http://test/api/clients/client-1/performance/refresh", { method: "POST" });

describe("POST /api/clients/[id]/performance/refresh", () => {
  beforeEach(() => vi.resetAllMocks());

  it("refuses when the latest snapshot is under an hour old", async () => {
    vi.mocked(getLatestSnapshot).mockResolvedValue({
      captured_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    } as never);
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(429);
    expect(vi.mocked(snapshotClientHandle)).not.toHaveBeenCalled();
  });

  it("runs the snapshot when the latest is old enough", async () => {
    vi.mocked(getLatestSnapshot).mockResolvedValue({
      captured_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    } as never);
    vi.mocked(snapshotClientHandle).mockResolvedValue({ ok: true, handle: "h", postCount: 12 });
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(200);
  });

  it("maps no-handle to 409", async () => {
    vi.mocked(getLatestSnapshot).mockResolvedValue(null);
    vi.mocked(snapshotClientHandle).mockResolvedValue({ ok: false, reason: "no-handle" });
    const { POST } = await import("./route");
    const res = await POST(req() as never, { params });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/performance/refresh/route.test.ts"`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement `route.ts`**

```ts
import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getLatestSnapshot } from "@/lib/db/performance";
import { snapshotClientHandle } from "@/lib/market/snapshot";

const MIN_INTERVAL_MS = 60 * 60 * 1000; // Apify is pay-per-result — no free spamming.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not refresh performance data.", async () => {
      const latest = await getLatestSnapshot(clientId);
      if (latest && Date.now() - new Date(latest.captured_at).getTime() < MIN_INTERVAL_MS) {
        return apiError("A snapshot was taken within the last hour — try again later.", 429);
      }
      const result = await snapshotClientHandle(clientId);
      if (!result.ok) {
        return result.reason === "no-handle"
          ? apiError("No Instagram handle on the Brand Kit yet.", 409)
          : apiError("Instagram returned no data for this handle.", 409);
      }
      return apiOk({ ok: true, postCount: result.postCount });
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/clients/[id]/performance/refresh/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[id]/performance/refresh/route.ts" "src/app/api/clients/[id]/performance/refresh/route.test.ts"
git commit -m "feat(api): manual performance refresh with 1h guard"
```

---

### Task 8: Trigger.dev daily sweep

**Files:**
- Create: `trigger/snapshot-handles.ts`

**Interfaces:**
- Consumes: `listClientsWithInstagramHandle` (Task 4), `snapshotClientHandle` (Task 5) — both via **dynamic** import (they carry `server-only`).
- Produces: scheduled task id `snapshot-handles`, daily at 05:00 UTC.

No unit test — matches the convention of the other three trigger tasks (thin shells; the logic they call is tested in Tasks 2–5).

- [ ] **Step 1: Implement `trigger/snapshot-handles.ts`**

```ts
// trigger/snapshot-handles.ts
// Daily Instagram performance sweep (D205). Every @/lib import is dynamic — those
// modules carry `import "server-only"`, a Next.js sentinel Trigger.dev's separate
// build must not evaluate statically (see reconcile-stuck-generations.ts).
import { schedules, logger } from "@trigger.dev/sdk/v3";

export const snapshotHandlesTask = schedules.task({
  id: "snapshot-handles",
  cron: "0 5 * * *",
  run: async () => {
    const { listClientsWithInstagramHandle } = await import("@/lib/db/performance");
    const { snapshotClientHandle } = await import("@/lib/market/snapshot");

    const clients = await listClientsWithInstagramHandle();
    logger.info("Handle sweep starting", { count: clients.length });

    for (const client of clients) {
      try {
        const result = await snapshotClientHandle(client.id);
        logger.info("Snapshot done", { clientId: client.id, ...result });
      } catch (e) {
        // One bad handle must not starve the rest — log and continue (spec §3).
        logger.error("Snapshot failed", {
          clientId: client.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  },
});
```

- [ ] **Step 2: Set the env var in both places** (manual)

- Add `APIFY_TOKEN=<the key>` to `.env.local` (never commit it).
- Add `APIFY_TOKEN` to the Trigger.dev project's environment variables (dashboard → project `proj_mlnaizhphqpdqwzctaag` → Env vars) so deployed runs have it.

- [ ] **Step 3: Verify the task registers**

Run: `npx trigger.dev@latest dev` briefly — expected: `snapshot-handles` appears in the task list without build errors (the dynamic imports keep `server-only` out of the bundle). Ctrl+C after confirming. Optionally trigger a test run from the dashboard against the dev environment and confirm a row lands in `account_snapshots`.

- [ ] **Step 4: Commit**

```bash
git add trigger/snapshot-handles.ts
git commit -m "feat(trigger): daily snapshot-handles sweep (D205)"
```

---

### Task 9: Hook + Performance tab UI

**Files:**
- Create: `src/hooks/use-performance.ts`
- Create: `src/components/market/performance-view.tsx`
- Create: `src/components/market/performance-chart.tsx`
- Create: `src/components/market/performance-post-tile.tsx`
- Modify: `src/components/market/market-view.tsx` (tab union at line 26, `TabsList`/`TabsContent` in the JSX)

**Interfaces:**
- Consumes: GET payload (Task 6), refresh POST (Task 7), `authFetch`, shadcn `Tabs`/`Button`, `postMultiplier` + `PerformanceStats` types (Task 2), `TrackedPostRow` (Task 4).
- Produces: `usePerformance(clientId)` → `{ data: PerformancePayload | null; loading: boolean; refreshing: boolean; refresh: () => Promise<string | null> }` (refresh resolves to an error message or null); `<PerformanceView clientId={...} />`.

Design reference: the published artifact mockup (Layout A + multiplier pill — "Market Performance Tab") and the visual-brainstorm decisions. Follow it for hierarchy, not pixel-for-pixel.

- [ ] **Step 1: Implement `src/hooks/use-performance.ts`**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase/session-ready";
import type { TrackedPostRow } from "@/lib/db/performance";
import type { PerformanceStats } from "@/lib/market/performance";

export type PerformancePayload = {
  handle: string | null;
  latest: {
    followersCount: number;
    followsCount: number;
    postsCount: number;
    capturedAt: string;
  } | null;
  series: { capturedAt: string; followers: number }[];
  posts: TrackedPostRow[];
  stats: PerformanceStats;
};

export function usePerformance(clientId: string) {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/performance`);
    if (res.ok) setData((await res.json()) as PerformancePayload);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    // Initial fetch lands after the awaited response (same shape as use-market).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /** Returns an error message to show, or null on success. */
  const refresh = useCallback(async (): Promise<string | null> => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/performance/refresh`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? "Could not refresh right now.";
      }
      await load();
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [clientId, load]);

  return { data, loading, refreshing, refresh };
}
```

- [ ] **Step 2: Implement `src/components/market/performance-chart.tsx`** (single-series SVG line — one series, so no legend; the card title names it)

```tsx
"use client";

// One-series follower trend. Inline SVG on purpose (D208): a charting dependency
// for a single line would be the heaviest thing on the page.
export function PerformanceChart({
  series,
}: {
  series: { capturedAt: string; followers: number }[];
}) {
  const W = 720;
  const H = 150;
  const PAD = { l: 36, r: 40, t: 12, b: 20 };

  if (series.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        The follower trend appears after a couple of daily snapshots.
      </p>
    );
  }

  const values = series.map((s) => s.followers);
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;
  const x = (i: number) => PAD.l + (i / (series.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const line = series
    .map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s.followers).toFixed(1)}`)
    .join(" ");
  const last = series[series.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full text-primary"
      role="img"
      aria-label={`Follower count, ${series[0].followers} to ${last.followers}`}
    >
      <path d={`${line} L${x(series.length - 1)} ${H - PAD.b} L${PAD.l} ${H - PAD.b} Z`} fill="currentColor" opacity={0.06} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(series.length - 1)} cy={y(last.followers)} r={4} fill="currentColor" stroke="var(--card)" strokeWidth={2} />
      <text
        x={x(series.length - 1) + 8}
        y={y(last.followers) + 4}
        className="fill-current text-[11px] font-semibold tabular-nums"
      >
        {last.followers}
      </text>
    </svg>
  );
}
```

- [ ] **Step 3: Implement `src/components/market/performance-post-tile.tsx`**

```tsx
"use client";

import { Heart, MessageCircle, Play } from "lucide-react";
import type { TrackedPostRow } from "@/lib/db/performance";
import { postMultiplier } from "@/lib/market/performance";

const TYPE_LABEL: Record<TrackedPostRow["post_type"], string> = {
  image: "Image",
  video: "Reel",
  carousel: "Carousel",
};

function MultiplierPill({ likes, medianLikes }: { likes: number | null; medianLikes: number | null }) {
  if (likes === null) {
    return (
      <span className="rounded-full border border-dashed border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        likes hidden
      </span>
    );
  }
  const m = postMultiplier(likes, medianLikes);
  if (m === null) return null;
  if (m < 1) {
    return (
      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        below median
      </span>
    );
  }
  if (m < 2) return null; // near-median posts stay unmarked — the grid must not shout
  return (
    <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
      {Number.isInteger(m) ? m : m.toFixed(1)}× median
    </span>
  );
}

export function PerformancePostTile({
  post,
  medianLikes,
}: {
  post: TrackedPostRow;
  medianLikes: number | null;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5">
      <a href={post.post_url} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] bg-muted">
        {post.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <Play strokeWidth={1.5} className="size-6" />
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
          {TYPE_LABEL[post.post_type]}
        </span>
      </a>
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap items-center gap-2.5 text-sm tabular-nums">
          <span className="inline-flex items-center gap-1 text-foreground/80">
            <Heart strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
            {post.likes_count ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1 text-foreground/80">
            <MessageCircle strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
            {post.comments_count}
          </span>
          {post.video_view_count !== null && (
            <span className="inline-flex items-center gap-1 text-foreground/80">
              <Play strokeWidth={1.5} className="size-3.5 text-muted-foreground" />
              {post.video_view_count}
            </span>
          )}
          <MultiplierPill likes={post.likes_count} medianLikes={medianLikes} />
        </div>
        {post.caption && (
          <p className="truncate text-xs text-muted-foreground">{post.caption}</p>
        )}
        <p className="text-[11px] text-muted-foreground/70">
          {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
            new Date(post.posted_at),
          )}
        </p>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Implement `src/components/market/performance-view.tsx`**

```tsx
"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePerformance } from "@/hooks/use-performance";
import { PerformanceChart } from "./performance-chart";
import { PerformancePostTile } from "./performance-post-tile";

function StatCard({ label, value, hint, delta }: {
  label: string;
  value: string;
  hint?: string;
  delta?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <p className="text-eyebrow">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 font-display text-2xl font-semibold tabular-nums">
        {value}
        {delta && <span className="text-xs font-semibold text-green-700 dark:text-green-400">{delta}</span>}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function PerformanceView({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const { data, loading, refreshing, refresh } = usePerformance(clientId);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  if (loading) return <p className="py-10 text-sm text-muted-foreground">Loading performance…</p>;

  // Empty state 1: no handle registered (D206 — the Brand Kit owns the field).
  if (!data?.handle) {
    return (
      <div className="py-10">
        <p className="mb-4 text-sm text-muted-foreground">
          No Instagram handle yet. Performance tracks the client&apos;s own account first.
        </p>
        <Button
          variant="outline"
          className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
          render={<Link href={`/clients/${clientSlug}/brand`} />}
        >
          Connect the client&apos;s Instagram in Brand Kit
        </Button>
      </div>
    );
  }

  const stats = data.stats;
  const pct = stats.engagementRate !== null ? `${(stats.engagementRate * 100).toFixed(1)}%` : "—";
  const cadence = stats.cadencePerMonth !== null ? `~${Math.round(stats.cadencePerMonth)}/mo` : "—";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Followers"
          value={data.latest ? String(data.latest.followersCount) : "—"}
          delta={stats.followerDelta7d !== null && stats.followerDelta7d !== 0
            ? `${stats.followerDelta7d > 0 ? "+" : ""}${stats.followerDelta7d} this week`
            : null}
          hint={data.latest ? `${data.latest.followsCount} following` : undefined}
        />
        <StatCard label="Engagement" value={pct} hint="median likes + comments ÷ followers" />
        <StatCard label="Posts" value={data.latest ? String(data.latest.postsCount) : "—"} hint="all time" />
        <StatCard label="Cadence" value={cadence} hint="recent posts" />
      </div>

      {/* Empty state 2: handle registered, pipeline hasn't run yet. */}
      {!data.latest ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            First snapshot pending for <span className="font-medium text-foreground">@{data.handle}</span>.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-eyebrow">Followers · since tracking began</p>
          <PerformanceChart series={data.series} />
        </div>
      )}

      {data.posts.length > 0 && (
        <>
          <div className="flex items-baseline justify-between">
            <p className="text-eyebrow">Recent posts</p>
            {stats.medianLikes !== null && (
              <p className="text-xs text-muted-foreground/70">
                multiplier vs account median ({stats.medianLikes} likes)
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {data.posts.map((post) => (
              <PerformancePostTile key={post.id} post={post} medianLikes={stats.medianLikes} />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground/70">
        <span>
          {data.latest
            ? `Last updated ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.latest.capturedAt))}`
            : "No snapshots yet"}
          {refreshError && <span className="ml-2 text-destructive">{refreshError}</span>}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
          onClick={async () => setRefreshError(await refresh())}
        >
          <RefreshCw strokeWidth={1.5} className={refreshing ? "animate-spin" : undefined} />
          {refreshing ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the tab into `market-view.tsx`**

At line 26, widen the union:

```ts
type MarketTab = MarketBucket | "signals" | "performance";
```

In the `TabsList`, after the Signals trigger, add:

```tsx
<TabsTrigger value="performance">Performance</TabsTrigger>
```

Alongside the existing `TabsContent` blocks, add (note `MarketView` already receives `clientSlug` in its props type — it becomes used now):

```tsx
<TabsContent value="performance">
  <PerformanceView clientId={clientId} clientSlug={clientSlug} />
</TabsContent>
```

with the import `import { PerformanceView } from "./performance-view";` and `clientSlug` destructured from props. Check the actual Brand panel route first (`src/app/clients/[id]/` — the brand kit page's real path segment) and fix the `href` in the empty state if it isn't `/clients/${clientSlug}/brand`.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`. Open the Market page of a dev client. Verify: (1) fourth tab renders; (2) with no handle in Brand Kit → the dashed connect CTA appears; (3) add `@prakritisattva` in Brand Kit → tab shows "First snapshot pending"; (4) hit Refresh now → after ~10s the stats, chart placeholder, and post tiles fill with real data and re-hosted thumbnails; (5) hit Refresh again → the 1-hour-guard message renders. Compare hierarchy against the artifact mockup.

- [ ] **Step 7: Lint + typecheck + full test run**

Run: `npm run lint && npx tsc --noEmit && npx vitest run`
Expected: no NEW failures (pre-existing registry-test/trigger.dev/lint failures are recorded in memory as unrelated; vitest timeout bursts → re-run once before investigating).

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-performance.ts src/components/market/performance-view.tsx src/components/market/performance-chart.tsx src/components/market/performance-post-tile.tsx src/components/market/market-view.tsx
git commit -m "feat(market): Performance tab — stats, trend, post grid (D208)"
```

---

### Task 10: Docs + finish

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-handle-performance-design.md` (status line only)

- [ ] **Step 1: Mark the spec implemented** — change the `**Status:**` line to `Implemented (this branch, 2026-09-XX).`

- [ ] **Step 2: Run the full verification once more** (`npm run lint && npx tsc --noEmit && npx vitest run`) and confirm output before claiming done — evidence before assertions.

- [ ] **Step 3: Commit, then use superpowers:finishing-a-development-branch** to decide merge/PR.

```bash
git add docs/superpowers/specs/2026-09-03-handle-performance-design.md
git commit -m "docs(specs): mark handle-performance design implemented"
```

---

## Self-review notes

- **Spec coverage:** §1 evidence → Task 2 fixture; §2.1/2.2 → Task 1; §2.3 → Tasks 2/4 (parser + `listClientsWithInstagramHandle`) and Task 9 empty state; §3 → Tasks 5/8 (+ manual refresh Task 7); §4 → Task 6; §5 → Task 9; §7 testing → Tasks 2, 3, 5, 6, 7. No gaps found.
- **Types:** `NormalizedPost`/`NormalizedSnapshot`/`PerformanceStats` defined once (Task 2), consumed by name in 4–9; `TrackedPostRow` defined in Task 4, consumed in 6/9; `SnapshotResult` shape matches Task 7's discrimination and Task 8's spread-into-logger.
- **Known checks for the executor:** the Brand panel `href` in Task 9 Step 5 must be verified against the real route; `uploadMarketThumbnail`'s GCS path uses `itemId` — passing a `tracked_posts` uuid is namespace-safe (uuids can't collide with moodboard item uuids in practice, and the bucket path is per-client).
