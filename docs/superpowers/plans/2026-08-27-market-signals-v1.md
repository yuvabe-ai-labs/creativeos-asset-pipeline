# Market Signals V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the moodboards system into Market Signals V1 — Direct/Adjacent evidence boards per client, watchable references, and designer-created Signals — per D184–D189.

**Architecture:** The evidence layer is the existing moodboards tables with new columns (system board types; item kind/note/added_by/thumbnail); Signals are a `signals` + `signal_items` link-set over items. One ingest module (classify URL → fetch thumbnail → re-host to GCS → never reject) feeds every capture path. One shared tile + lightbox renders everywhere: the new `/clients/[id]/market` page, the canvas gallery drawer, and (via the same POST route) the clipper extension.

**Tech Stack:** Next.js (App Router), Supabase (service-role via `createServerSupabase`), GCS via `src/lib/storage`, vitest, shadcn/Base UI components, react-photo-album masonry.

**Spec:** `docs/superpowers/specs/2026-08-27-market-signals-v1-design.md` (decisions D184–D189; PRD alongside as `...-v1-prd.md`)

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI — `render` prop, not `asChild`). Never native `<button>/<input>/<select>/<textarea>`. Composed field internals use `InputGroup` from `src/components/ui/input-group.tsx`.
- API routes: `apiError`/`apiOk` only (never `NextResponse.json`), `withClient` for `/api/clients/[id]/*`, `withTryCatch` around multi-step handlers (`src/lib/api/route-helpers.ts`).
- Import, don't redefine: constants in `src/lib/market/constants.ts`, utilities in `src/lib/market/`; check before creating.
- Design system: Lucide icons (1.5 stroke), `shadow-card`, easing `cubic-bezier(0.22,1,0.36,1)`, purple only for primary CTA/focus, hierarchy by weight not size.
- TDD: failing test → minimal code → pass → commit. Test command: `npx vitest run <path>`.
- User FKs reference `auth.users(id) on delete set null` (house pattern, D181).
- Baseline: suite green at branch point (the lone Kling failure is a known cold-cache flake — re-run warm before treating any failure there as real).

---

### Task 1: Migration 0034 — board types, richer items, signals

**Files:**
- Create: `supabase/migrations/0034_market_signals.sql`

**Interfaces:**
- Produces: columns `moodboards.board_type`, `moodboard_items.{kind,note,added_by,thumbnail_url}`; tables `signals`, `signal_items`. Later tasks' db helpers select these exact names.

- [ ] **Step 1: Write the migration**

```sql
-- Market Signals V1 (D184–D189): the evidence layer extends moodboards; Signals are a
-- link-set over items. Additive only — every existing row is already valid
-- (board_type defaults 'custom', kind defaults 'image').

alter table moodboards
  add column board_type text not null default 'custom'
    check (board_type in ('custom', 'direct', 'adjacent'));

-- One Direct and one Adjacent board per client, no duplicates. Partial index so
-- 'custom' boards stay unlimited.
create unique index moodboards_client_system_board_uq
  on moodboards(client_id, board_type)
  where board_type <> 'custom';

alter table moodboard_items
  add column kind text not null default 'image'
    check (kind in ('image', 'gif', 'video', 'youtube', 'instagram', 'tiktok', 'link')),
  add column note          text,
  add column added_by      uuid references auth.users(id) on delete set null,
  add column thumbnail_url text;

-- A Signal is a designer-authored interpretation over evidence (D187). It LINKS items —
-- an item stays in its bucket and can back many signals. Deleting an item cascades it
-- out of every signal; a signal with zero items survives (deleting it is a human act).
create table signals (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  tags        text[] not null default '{}',
  description text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table signal_items (
  signal_id uuid not null references signals(id) on delete cascade,
  item_id   uuid not null references moodboard_items(id) on delete cascade,
  position  int not null default 0,
  primary key (signal_id, item_id)
);

create index signals_client_id_idx    on signals(client_id);
create index signal_items_item_id_idx on signal_items(item_id);

-- Default-deny RLS, same rationale as 0026: app access uses the service-role client;
-- zero policies closes the anon-key direct-REST path.
alter table signals      enable row level security;
alter table signal_items enable row level security;
```

- [ ] **Step 2: Sanity-check the SQL is self-consistent**

Read it back checking: every column referenced later exists here; check-constraint value lists match the design spec §1 exactly (`custom|direct|adjacent`; `image|gif|video|youtube|instagram|tiktok|link`).

- [ ] **Step 3: Flag for hand-apply — do NOT auto-apply**

House practice (see 0026's header) is hand-applying via the Supabase SQL editor. Tell the user the migration is ready to apply; **the user applies it** (or explicitly says to run it). Code in later tasks is testable without a live DB (db calls are mocked), so implementation continues either way.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0034_market_signals.sql
git commit -m "feat(market): migration 0034 — board types, richer items, signals (D184-D189)"
```

---

### Task 2: URL classification + embed URLs (pure, TDD)

**Files:**
- Create: `src/lib/market/constants.ts`
- Create: `src/lib/market/classify.ts`
- Test: `src/lib/market/classify.test.ts`

**Interfaces:**
- Produces:
  - `type ReferenceKind = "image" | "gif" | "video" | "youtube" | "instagram" | "tiktok" | "link"` (exported from `constants.ts` alongside `REFERENCE_KINDS`)
  - `classifyUrl(url: string): ReferenceKind`
  - `youtubeVideoId(url: string): string | null`
  - `embedUrlFor(kind: ReferenceKind, url: string): string | null` — lightbox iframe src, or null when playback isn't derivable (caller falls back to open-in-new-tab)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/market/classify.test.ts
import { describe, it, expect } from "vitest";
import { classifyUrl, youtubeVideoId, embedUrlFor } from "./classify";

describe("classifyUrl", () => {
  it("classifies YouTube watch, shorts and youtu.be URLs", () => {
    expect(classifyUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(classifyUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(classifyUrl("https://www.youtube.com/shorts/abc123DEF45")).toBe("youtube");
  });

  it("classifies Instagram post/reel/tv URLs", () => {
    expect(classifyUrl("https://www.instagram.com/reel/C8xyz123/")).toBe("instagram");
    expect(classifyUrl("https://www.instagram.com/p/C8xyz123/")).toBe("instagram");
    expect(classifyUrl("https://instagram.com/tv/C8xyz123/")).toBe("instagram");
  });

  it("classifies TikTok URLs, including short links", () => {
    expect(classifyUrl("https://www.tiktok.com/@user/video/7301234567890123456")).toBe("tiktok");
    expect(classifyUrl("https://vm.tiktok.com/ZMabcdef/")).toBe("tiktok");
  });

  it("classifies direct media by extension, ignoring query strings", () => {
    expect(classifyUrl("https://cdn.example.com/a.jpg?w=800")).toBe("image");
    expect(classifyUrl("https://cdn.example.com/a.PNG")).toBe("image");
    expect(classifyUrl("https://cdn.example.com/a.webp")).toBe("image");
    expect(classifyUrl("https://media.example.com/a.gif")).toBe("gif");
    expect(classifyUrl("https://media.example.com/a.mp4")).toBe("video");
    expect(classifyUrl("https://media.example.com/a.webm")).toBe("video");
  });

  it("falls back to link for everything else, including garbage", () => {
    expect(classifyUrl("https://someblog.com/article")).toBe("link");
    expect(classifyUrl("not a url at all")).toBe("link");
  });

  // An Instagram *profile* URL is not a post — link, not instagram.
  it("does not classify instagram profile pages as instagram posts", () => {
    expect(classifyUrl("https://www.instagram.com/nike/")).toBe("link");
  });
});

describe("youtubeVideoId", () => {
  it("extracts the id from watch, shorts and youtu.be forms", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/shorts/abc123DEF45")).toBe("abc123DEF45");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(youtubeVideoId("https://vimeo.com/123")).toBeNull();
  });
});

describe("embedUrlFor", () => {
  it("builds a youtube-nocookie iframe URL", () => {
    expect(embedUrlFor("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });
  it("builds an Instagram /embed URL from the post path", () => {
    expect(embedUrlFor("instagram", "https://www.instagram.com/reel/C8xyz123/")).toBe(
      "https://www.instagram.com/reel/C8xyz123/embed",
    );
  });
  it("builds a TikTok v2 embed URL from a full video URL", () => {
    expect(
      embedUrlFor("tiktok", "https://www.tiktok.com/@user/video/7301234567890123456"),
    ).toBe("https://www.tiktok.com/embed/v2/7301234567890123456");
  });
  it("returns null when playback is not derivable (short links, plain links)", () => {
    expect(embedUrlFor("tiktok", "https://vm.tiktok.com/ZMabcdef/")).toBeNull();
    expect(embedUrlFor("link", "https://someblog.com/article")).toBeNull();
    expect(embedUrlFor("image", "https://cdn.example.com/a.jpg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/market/classify.test.ts`
Expected: FAIL — cannot resolve `./classify`.

- [ ] **Step 3: Implement**

```ts
// src/lib/market/constants.ts
export const REFERENCE_KINDS = [
  "image", "gif", "video", "youtube", "instagram", "tiktok", "link",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const MARKET_BUCKETS = ["direct", "adjacent"] as const;
export type MarketBucket = (typeof MARKET_BUCKETS)[number];

/** Max bytes we'll pull for a re-hosted thumbnail (grid preview, not the media). */
export const THUMBNAIL_SIZE_LIMIT = 5 * 1024 * 1024;
```

```ts
// src/lib/market/classify.ts
// Pure URL classification for market references. No fetches here — everything
// derivable from the string alone, so it runs identically in routes and tests.
import type { ReferenceKind } from "./constants";

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);

function ext(pathname: string): string {
  return pathname.split(".").pop()?.toLowerCase() ?? "";
}

export function classifyUrl(url: string): ReferenceKind {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "link";
  }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    return youtubeVideoId(url) ? "youtube" : "link";
  }
  if (host === "instagram.com" && /^\/(p|reel|tv)\/[^/]+/.test(u.pathname)) {
    return "instagram";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";

  const e = ext(u.pathname);
  if (e === "gif") return "gif";
  if (IMAGE_EXTS.has(e)) return "image";
  if (VIDEO_EXTS.has(e)) return "video";
  return "link";
}

export function youtubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "m.youtube.com") return null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
  return shorts ? shorts[1] : null;
}

/**
 * Iframe src for the lightbox player, or null when playback isn't derivable —
 * the caller then falls back to "open source in a new tab" (D185's degraded path).
 * Direct iframe endpoints, not the platforms' embed.js, so no third-party script
 * runs in the app (design spec §8 Q2).
 */
export function embedUrlFor(kind: ReferenceKind, url: string): string | null {
  if (kind === "youtube") {
    const id = youtubeVideoId(url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (kind === "instagram") {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/^\/(p|reel|tv)\/([^/]+)/);
      return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
    } catch {
      return null;
    }
  }
  if (kind === "tiktok") {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/video\/(\d+)/);
      return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : null;
    } catch {
      return null;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/market/classify.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/constants.ts src/lib/market/classify.ts src/lib/market/classify.test.ts
git commit -m "feat(market): URL classification and embed URL derivation"
```

---

### Task 3: Thumbnail source resolution (oEmbed / derived, TDD)

**Files:**
- Create: `src/lib/market/thumbnail.ts`
- Test: `src/lib/market/thumbnail.test.ts`

**Interfaces:**
- Consumes: `ReferenceKind`, `youtubeVideoId` from Task 2.
- Produces: `resolveThumbnailSource(url: string, kind: ReferenceKind, fetchImpl?: typeof fetch): Promise<string | null>` — URL of a thumbnail image to re-host, or null (degraded tile). Never throws.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/market/thumbnail.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveThumbnailSource } from "./thumbnail";

const okJson = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

describe("resolveThumbnailSource", () => {
  it("derives YouTube thumbnails without any fetch", async () => {
    const fetchImpl = vi.fn();
    const out = await resolveThumbnailSource(
      "https://youtu.be/dQw4w9WgXcQ", "youtube", fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the image URL itself for image/gif kinds", async () => {
    expect(await resolveThumbnailSource("https://c.dn/a.jpg", "image")).toBe("https://c.dn/a.jpg");
    expect(await resolveThumbnailSource("https://c.dn/a.gif", "gif")).toBe("https://c.dn/a.gif");
  });

  it("reads thumbnail_url from the TikTok oEmbed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ thumbnail_url: "https://p16.tiktokcdn.com/thumb.jpg" }));
    const out = await resolveThumbnailSource(
      "https://www.tiktok.com/@u/video/123", "tiktok", fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://p16.tiktokcdn.com/thumb.jpg");
    expect(fetchImpl.mock.calls[0][0]).toContain("tiktok.com/oembed");
  });

  it("reads thumbnail_url from the Instagram oEmbed response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ thumbnail_url: "https://scontent.cdninstagram.com/t.jpg" }));
    const out = await resolveThumbnailSource(
      "https://www.instagram.com/reel/C8xyz/", "instagram", fetchImpl as unknown as typeof fetch,
    );
    expect(out).toBe("https://scontent.cdninstagram.com/t.jpg");
  });

  it("returns null (never throws) when oEmbed fails — the degraded-tile path", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network"));
    expect(
      await resolveThumbnailSource("https://www.tiktok.com/@u/video/1", "tiktok", fetchImpl as unknown as typeof fetch),
    ).toBeNull();
    const notOk = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(
      await resolveThumbnailSource("https://www.instagram.com/reel/x/", "instagram", notOk as unknown as typeof fetch),
    ).toBeNull();
  });

  it("returns null for video and link kinds (no derivable thumbnail)", async () => {
    expect(await resolveThumbnailSource("https://c.dn/a.mp4", "video")).toBeNull();
    expect(await resolveThumbnailSource("https://blog.example/x", "link")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/market/thumbnail.test.ts`
Expected: FAIL — cannot resolve `./thumbnail`.

- [ ] **Step 3: Implement**

```ts
// src/lib/market/thumbnail.ts
// Best-effort thumbnail source per kind. Every failure path returns null — capture
// must never fail on preview problems (D185); a null thumbnail renders as a link tile.
import { youtubeVideoId } from "./classify";
import type { ReferenceKind } from "./constants";

// Tokenless oEmbed endpoints. TikTok's is long-stable; Meta re-opened tokenless
// oEmbed for single public posts/reels on 2026-06-15 (design spec §2 — verified
// 2026-08-27). If Meta's tokenless route needs an adjustment at runtime, the
// failure mode is already the degraded tile, not an error.
const TIKTOK_OEMBED = "https://www.tiktok.com/oembed?url=";
const INSTAGRAM_OEMBED = "https://graph.facebook.com/v23.0/instagram_oembed?omit_script=true&url=";

async function oembedThumbnail(endpoint: string, url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(endpoint + encodeURIComponent(url));
    if (!res.ok) return null;
    const json = (await res.json()) as { thumbnail_url?: string };
    return json.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

export async function resolveThumbnailSource(
  url: string,
  kind: ReferenceKind,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (kind === "image" || kind === "gif") return url;
  if (kind === "youtube") {
    const id = youtubeVideoId(url);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }
  if (kind === "tiktok") return oembedThumbnail(TIKTOK_OEMBED, url, fetchImpl);
  if (kind === "instagram") return oembedThumbnail(INSTAGRAM_OEMBED, url, fetchImpl);
  return null; // video, link — no derivable preview
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/market/thumbnail.test.ts`
Expected: PASS.

- [ ] **Step 5: Manual endpoint check (5 min, no code)**

Curl both oEmbed endpoints with one real public URL each and note the results in the commit message (works / needs adjusting). If Instagram's tokenless route differs from the constant, fix the constant now — behavior is identical either way (null → degraded tile), so this is calibration, not correctness.

- [ ] **Step 6: Commit**

```bash
git add src/lib/market/thumbnail.ts src/lib/market/thumbnail.test.ts
git commit -m "feat(market): thumbnail source resolution (derived + oEmbed, never-throw)"
```

---

### Task 4: GCS re-host path + upload for market thumbnails

**Files:**
- Modify: `src/lib/storage/paths.ts` (add `pathForMarketThumb`)
- Modify: `src/lib/storage/index.ts` (add `uploadMarketThumbnail`)
- Test: `src/lib/storage/paths.test.ts` (extend)

**Interfaces:**
- Consumes: existing `_upload`, `buildStoredName`/`sanitizeSlug` patterns in `src/lib/storage`.
- Produces: `uploadMarketThumbnail(args: { clientId: string; itemId: string; body: Buffer | ArrayBuffer | Uint8Array; contentType: string }): Promise<UploadResult>` (`UploadResult = { url, path }`).

- [ ] **Step 1: Write the failing test** (match the existing style in `paths.test.ts` — read its neighbors first)

```ts
// append to src/lib/storage/paths.test.ts
import { pathForMarketThumb } from "./paths"; // merge into the existing import line

describe("pathForMarketThumb", () => {
  it("scopes thumbnails under the client's market folder by item id", () => {
    expect(pathForMarketThumb({ clientId: "c-1", itemId: "i-9", ext: "jpg" })).toBe(
      "clients/c-1/market/thumbs/i-9.jpg",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `pathForMarketThumb` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/storage/paths.ts — append
export function pathForMarketThumb(args: {
  clientId: string;
  itemId: string;
  ext: string;
}): string {
  return `clients/${args.clientId}/market/thumbs/${args.itemId}.${args.ext}`;
}
```

```ts
// src/lib/storage/index.ts — append (import pathForMarketThumb in the existing import block)
export async function uploadMarketThumbnail(args: {
  clientId: string;
  itemId: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const ext = args.contentType === "image/png" ? "png" : args.contentType === "image/webp" ? "webp" : "jpg";
  const path = pathForMarketThumb({ clientId: args.clientId, itemId: args.itemId, ext });
  return _upload(path, args.body, args.contentType);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/storage/paths.test.ts src/lib/storage/index.test.ts`
Expected: PASS (existing storage tests stay green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/paths.ts src/lib/storage/index.ts src/lib/storage/paths.test.ts
git commit -m "feat(storage): market thumbnail path + upload"
```

---

### Task 5: DB helpers — richer items, system boards, signals

**Files:**
- Modify: `src/lib/db/moodboards.ts` (extend `MoodboardItem`/`Moodboard` types, `addItem` fields, add `ensureSystemBoards`)
- Create: `src/lib/db/signals.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (house pattern), `ReferenceKind` from Task 2.
- Produces (exact — later tasks import these):
  - `Moodboard` gains `board_type: "custom" | "direct" | "adjacent"`
  - `MoodboardItem` gains `kind: ReferenceKind; note: string | null; added_by: string | null; thumbnail_url: string | null`
  - `addItem(moodboardId, input: { imageUrl: string; sourceUrl?: string; kind?: ReferenceKind; note?: string; addedBy?: string; thumbnailUrl?: string })`
  - `updateItemThumbnail(itemId: string, thumbnailUrl: string): Promise<void>`
  - `ensureSystemBoards(clientId: string): Promise<{ direct: Moodboard; adjacent: Moodboard }>`
  - `src/lib/db/signals.ts`: `Signal` type `{ id, client_id, name, tags: string[], description, created_by: string | null, created_at, updated_at }`; `SignalWithItems = Signal & { items: MoodboardItem[] }`; `listSignalsWithItems(clientId): Promise<SignalWithItems[]>`; `createSignal(clientId, input: { name: string; tags: string[]; description: string; createdBy?: string; itemIds: string[] }): Promise<Signal>`; `updateSignal(id, patch: { name?: string; tags?: string[]; description?: string }): Promise<void>`; `deleteSignal(id): Promise<void>`

These are thin service-role wrappers (the house style has no unit tests on `db/*` — logic lives upstream and gets tested there; keep it that way).

- [ ] **Step 1: Extend `src/lib/db/moodboards.ts`**

```ts
// Type changes:
export type Moodboard = {
  id: string;
  client_id: string;
  name: string;
  board_type: "custom" | "direct" | "adjacent";
  created_at: string;
};

export type MoodboardItem = {
  id: string;
  moodboard_id: string;
  image_url: string;
  source_url: string | null;
  kind: ReferenceKind;          // import type { ReferenceKind } from "@/lib/market/constants"
  note: string | null;
  added_by: string | null;
  thumbnail_url: string | null;
  position: number;
  added_at: string;
};

// addItem replacement:
export async function addItem(
  moodboardId: string,
  input: {
    imageUrl: string;
    sourceUrl?: string;
    kind?: ReferenceKind;
    note?: string;
    addedBy?: string;
    thumbnailUrl?: string;
  },
): Promise<MoodboardItem> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboard_items")
    .insert({
      moodboard_id: moodboardId,
      image_url: input.imageUrl,
      source_url: input.sourceUrl ?? null,
      kind: input.kind ?? "image",
      note: input.note ?? null,
      added_by: input.addedBy ?? null,
      thumbnail_url: input.thumbnailUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MoodboardItem;
}

export async function updateItemThumbnail(itemId: string, thumbnailUrl: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("moodboard_items")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", itemId);
  if (error) throw error;
}

// Lazily provision the two system boards (D186). Insert-then-reselect on conflict:
// the partial unique index makes the concurrent-create race safe.
export async function ensureSystemBoards(
  clientId: string,
): Promise<{ direct: Moodboard; adjacent: Moodboard }> {
  const supabase = createServerSupabase();

  async function ensure(boardType: "direct" | "adjacent", name: string): Promise<Moodboard> {
    const { data: existing } = await supabase
      .from("moodboards")
      .select("*")
      .eq("client_id", clientId)
      .eq("board_type", boardType)
      .maybeSingle();
    if (existing) return existing as Moodboard;

    const { data, error } = await supabase
      .from("moodboards")
      .insert({ client_id: clientId, name, board_type: boardType })
      .select()
      .single();
    if (!error) return data as Moodboard;

    // 23505 = unique violation: another request created it between our select and insert.
    if ((error as { code?: string }).code === "23505") {
      const { data: raced, error: reErr } = await supabase
        .from("moodboards")
        .select("*")
        .eq("client_id", clientId)
        .eq("board_type", boardType)
        .single();
      if (reErr) throw reErr;
      return raced as Moodboard;
    }
    throw error;
  }

  const [direct, adjacent] = await Promise.all([
    ensure("direct", "Direct"),
    ensure("adjacent", "Adjacent"),
  ]);
  return { direct, adjacent };
}
```

- [ ] **Step 2: Create `src/lib/db/signals.ts`**

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MoodboardItem } from "./moodboards";

export type Signal = {
  id: string;
  client_id: string;
  name: string;
  tags: string[];
  description: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SignalWithItems = Signal & { items: MoodboardItem[] };

export async function listSignalsWithItems(clientId: string): Promise<SignalWithItems[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("signals")
    .select("*, signal_items(position, moodboard_items(*))")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Row = Signal & {
    signal_items: { position: number; moodboard_items: MoodboardItem | null }[] | null;
  };
  return ((data ?? []) as Row[]).map((row) => {
    const { signal_items, ...signal } = row;
    const items = (signal_items ?? [])
      .filter((si): si is { position: number; moodboard_items: MoodboardItem } => si.moodboard_items != null)
      .sort((a, b) => a.position - b.position)
      .map((si) => si.moodboard_items);
    return { ...signal, items };
  });
}

export async function createSignal(
  clientId: string,
  input: { name: string; tags: string[]; description: string; createdBy?: string; itemIds: string[] },
): Promise<Signal> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("signals")
    .insert({
      client_id: clientId,
      name: input.name,
      tags: input.tags,
      description: input.description,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const signal = data as Signal;

  if (input.itemIds.length) {
    const links = input.itemIds.map((itemId, i) => ({
      signal_id: signal.id,
      item_id: itemId,
      position: i,
    }));
    const { error: linkError } = await supabase.from("signal_items").insert(links);
    if (linkError) throw linkError;
  }
  return signal;
}

export async function updateSignal(
  id: string,
  patch: { name?: string; tags?: string[]; description?: string },
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("signals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSignal(id: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("signals").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 3: Type-check and run neighbors**

Run: `npx tsc --noEmit && npx vitest run src/app/api/moodboards src/app/api/clients`
Expected: clean compile; existing moodboard route tests still PASS (addItem's new fields are all optional).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/moodboards.ts src/lib/db/signals.ts
git commit -m "feat(market): db helpers — system boards, richer items, signals"
```

---

### Task 6: Ingest orchestrator (TDD)

**Files:**
- Create: `src/lib/market/ingest.ts`
- Test: `src/lib/market/ingest.test.ts`

**Interfaces:**
- Consumes: `classifyUrl` (Task 2), `resolveThumbnailSource` (Task 3), `uploadMarketThumbnail` (Task 4), `addItem`/`updateItemThumbnail` (Task 5), `THUMBNAIL_SIZE_LIMIT` (Task 2).
- Produces: `ingestReference(args: { boardId: string; clientId: string; url: string; sourceUrl?: string; note?: string; addedBy?: string; fetchImpl?: typeof fetch }): Promise<MoodboardItem>` — classifies, saves the row immediately, then best-effort thumbnail (fetch → size-check → GCS → update row). **Never throws for preview reasons**; throws only if the DB insert itself fails.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/market/ingest.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({
  addItem: vi.fn(),
  updateItemThumbnail: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  uploadMarketThumbnail: vi.fn(),
}));
vi.mock("./thumbnail", () => ({
  resolveThumbnailSource: vi.fn(),
}));

import { addItem, updateItemThumbnail } from "@/lib/db/moodboards";
import { uploadMarketThumbnail } from "@/lib/storage";
import { resolveThumbnailSource } from "./thumbnail";
import { ingestReference } from "./ingest";

const baseItem = {
  id: "item-1", moodboard_id: "b-1", image_url: "u", source_url: null,
  kind: "youtube" as const, note: null, added_by: null, thumbnail_url: null,
  position: 0, added_at: "now",
};

function mockThumbFetch(bytes: number, contentType = "image/jpeg") {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response);
}

describe("ingestReference", () => {
  beforeEach(() => vi.resetAllMocks());

  it("classifies, inserts, re-hosts the thumbnail, and updates the row", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem });
    vi.mocked(resolveThumbnailSource).mockResolvedValue("https://img.youtube.com/vi/x/hqdefault.jpg");
    vi.mocked(uploadMarketThumbnail).mockResolvedValue({ url: "https://gcs/thumb.jpg", path: "p" });

    const item = await ingestReference({
      boardId: "b-1", clientId: "c-1",
      url: "https://youtu.be/dQw4w9WgXcQ", note: "nice hook", addedBy: "user-1",
      fetchImpl: mockThumbFetch(1000) as unknown as typeof fetch,
    });

    expect(vi.mocked(addItem)).toHaveBeenCalledWith("b-1", expect.objectContaining({
      imageUrl: "https://youtu.be/dQw4w9WgXcQ",
      kind: "youtube",
      note: "nice hook",
      addedBy: "user-1",
    }));
    expect(vi.mocked(uploadMarketThumbnail)).toHaveBeenCalledWith(expect.objectContaining({
      clientId: "c-1", itemId: "item-1", contentType: "image/jpeg",
    }));
    expect(vi.mocked(updateItemThumbnail)).toHaveBeenCalledWith("item-1", "https://gcs/thumb.jpg");
    expect(item.thumbnail_url).toBe("https://gcs/thumb.jpg");
  });

  it("still saves when no thumbnail source resolves (degraded tile)", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem, kind: "link" });
    vi.mocked(resolveThumbnailSource).mockResolvedValue(null);

    const item = await ingestReference({ boardId: "b-1", clientId: "c-1", url: "https://someblog.com/x" });

    expect(item.thumbnail_url).toBeNull();
    expect(vi.mocked(uploadMarketThumbnail)).not.toHaveBeenCalled();
    expect(vi.mocked(updateItemThumbnail)).not.toHaveBeenCalled();
  });

  it("still saves when the thumbnail download itself fails", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem });
    vi.mocked(resolveThumbnailSource).mockResolvedValue("https://img.example/t.jpg");
    const failingFetch = vi.fn().mockRejectedValue(new Error("network"));

    const item = await ingestReference({
      boardId: "b-1", clientId: "c-1", url: "https://youtu.be/abc",
      fetchImpl: failingFetch as unknown as typeof fetch,
    });
    expect(item.id).toBe("item-1");
    expect(item.thumbnail_url).toBeNull();
  });

  it("skips oversized thumbnails instead of failing", async () => {
    vi.mocked(addItem).mockResolvedValue({ ...baseItem });
    vi.mocked(resolveThumbnailSource).mockResolvedValue("https://img.example/huge.jpg");

    const item = await ingestReference({
      boardId: "b-1", clientId: "c-1", url: "https://youtu.be/abc",
      fetchImpl: mockThumbFetch(6 * 1024 * 1024) as unknown as typeof fetch,
    });
    expect(vi.mocked(uploadMarketThumbnail)).not.toHaveBeenCalled();
    expect(item.thumbnail_url).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/market/ingest.test.ts`
Expected: FAIL — cannot resolve `./ingest`.

- [ ] **Step 3: Implement**

```ts
// src/lib/market/ingest.ts
// The one ingest path every capture surface uses (Market page form, drawer add,
// extension POST). Contract (D185): the reference row ALWAYS saves; thumbnails are
// best-effort decoration. Only a DB failure propagates.
import "server-only";
import { addItem, updateItemThumbnail, type MoodboardItem } from "@/lib/db/moodboards";
import { uploadMarketThumbnail } from "@/lib/storage";
import { classifyUrl } from "./classify";
import { resolveThumbnailSource } from "./thumbnail";
import { THUMBNAIL_SIZE_LIMIT } from "./constants";

export async function ingestReference(args: {
  boardId: string;
  clientId: string;
  url: string;
  sourceUrl?: string;
  note?: string;
  addedBy?: string;
  fetchImpl?: typeof fetch;
}): Promise<MoodboardItem> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const kind = classifyUrl(args.url);

  // Save first — capture must not wait on (or fail with) preview work.
  const item = await addItem(args.boardId, {
    imageUrl: args.url,
    sourceUrl: args.sourceUrl,
    kind,
    note: args.note,
    addedBy: args.addedBy,
  });

  const thumbSource = await resolveThumbnailSource(args.url, kind, fetchImpl);
  if (!thumbSource) return item;

  try {
    const res = await fetchImpl(thumbSource);
    if (!res.ok) return item;
    const contentType = res.headers.get("content-type")?.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > THUMBNAIL_SIZE_LIMIT) return item;

    const { url } = await uploadMarketThumbnail({
      clientId: args.clientId,
      itemId: item.id,
      body: buffer,
      contentType,
    });
    await updateItemThumbnail(item.id, url);
    return { ...item, thumbnail_url: url };
  } catch {
    return item; // degraded tile — by design, not an error
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/market/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/ingest.ts src/lib/market/ingest.test.ts
git commit -m "feat(market): ingest orchestrator — save always, thumbnail best-effort"
```

---

### Task 7: Market API routes (TDD)

**Files:**
- Create: `src/app/api/clients/[id]/market/route.ts` (GET)
- Create: `src/app/api/clients/[id]/market/references/route.ts` (POST)
- Create: `src/app/api/clients/[id]/market/signals/route.ts` (POST)
- Create: `src/app/api/clients/[id]/market/signals/[signalId]/route.ts` (PATCH, DELETE)
- Test: `src/app/api/clients/[id]/market/route.test.ts`
- Test: `src/app/api/clients/[id]/market/references/route.test.ts`
- Test: `src/app/api/clients/[id]/market/signals/route.test.ts`

**Interfaces:**
- Consumes: `withClient`, `apiError`, `apiOk`, `withTryCatch` (route-helpers); `ensureSystemBoards`, `listItems` (db/moodboards); `listSignalsWithItems`, `createSignal`, `updateSignal`, `deleteSignal` (db/signals); `ingestReference` (Task 6); `resolveCallerContext` (`@/lib/dal`) for `added_by`/`created_by`.
- Produces (page + hook consume these response shapes):
  - `GET /api/clients/[id]/market` → `{ direct: { board, items }, adjacent: { board, items }, signals: SignalWithItems[] }`
  - `POST .../market/references` body `{ url, bucket: "direct"|"adjacent", note? }` → `{ item }` (201)
  - `POST .../market/signals` body `{ name, tags: string[], description, itemIds: string[] }` → `{ signal }` (201)
  - `PATCH .../market/signals/[signalId]` body `{ name?, tags?, description? }` → `{ ok: true }`; `DELETE` → `{ ok: true }`

- [ ] **Step 1: Write the failing tests** (mock style copied from `src/app/api/moodboards/route.test.ts` — same `vi.mock` blocks for `server-only`, `@/lib/dal`, impersonation)

```ts
// src/app/api/clients/[id]/market/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({
    userId: "user-1", platformRole: "member", orgId: "org-1", orgRole: "designer", mustChangePassword: false,
  })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/clients", () => ({
  getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1", slug: "acme", name: "Acme" })),
}));
vi.mock("@/lib/db/moodboards", () => ({
  ensureSystemBoards: vi.fn(),
  listItems: vi.fn(),
}));
vi.mock("@/lib/db/signals", () => ({ listSignalsWithItems: vi.fn() }));

import { ensureSystemBoards, listItems } from "@/lib/db/moodboards";
import { listSignalsWithItems } from "@/lib/db/signals";

const params = Promise.resolve({ id: "client-1" });
const req = (body?: unknown) =>
  new Request("http://test/api/clients/client-1/market", {
    method: body ? "POST" : "GET",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

describe("GET /api/clients/[id]/market", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns both system boards with items and the signals", async () => {
    vi.mocked(ensureSystemBoards).mockResolvedValue({
      direct: { id: "bd", client_id: "client-1", name: "Direct", board_type: "direct", created_at: "t" },
      adjacent: { id: "ba", client_id: "client-1", name: "Adjacent", board_type: "adjacent", created_at: "t" },
    });
    vi.mocked(listItems).mockResolvedValue([]);
    vi.mocked(listSignalsWithItems).mockResolvedValue([]);

    const { GET } = await import("./route");
    const res = await GET(req() as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.direct.board.id).toBe("bd");
    expect(body.adjacent.board.id).toBe("ba");
    expect(body.signals).toEqual([]);
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("bd");
    expect(vi.mocked(listItems)).toHaveBeenCalledWith("ba");
  });
});
```

```ts
// src/app/api/clients/[id]/market/references/route.test.ts — same mock preamble, plus:
vi.mock("@/lib/market/ingest", () => ({ ingestReference: vi.fn() }));
import { ingestReference } from "@/lib/market/ingest";
import { ensureSystemBoards } from "@/lib/db/moodboards";

describe("POST /api/clients/[id]/market/references", () => {
  beforeEach(() => vi.resetAllMocks());

  it("ingests into the requested bucket with the caller as added_by", async () => {
    vi.mocked(ensureSystemBoards).mockResolvedValue({
      direct: { id: "bd", client_id: "client-1", name: "Direct", board_type: "direct", created_at: "t" },
      adjacent: { id: "ba", client_id: "client-1", name: "Adjacent", board_type: "adjacent", created_at: "t" },
    });
    vi.mocked(ingestReference).mockResolvedValue({ id: "item-1" } as never);

    const { POST } = await import("./route");
    const res = await POST(
      req({ url: "https://youtu.be/x", bucket: "adjacent", note: "n" }) as never,
      { params },
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(ingestReference)).toHaveBeenCalledWith(expect.objectContaining({
      boardId: "ba", clientId: "client-1", url: "https://youtu.be/x", note: "n", addedBy: "user-1",
    }));
  });

  it("rejects a missing url or bad bucket", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ bucket: "direct" }) as never, { params })).status).toBe(400);
    expect((await POST(req({ url: "https://x.com", bucket: "weird" }) as never, { params })).status).toBe(400);
  });
});
```

```ts
// src/app/api/clients/[id]/market/signals/route.test.ts — same mock preamble, plus:
vi.mock("@/lib/db/signals", () => ({ createSignal: vi.fn() }));
import { createSignal } from "@/lib/db/signals";

describe("POST /api/clients/[id]/market/signals", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a signal with the caller as created_by", async () => {
    vi.mocked(createSignal).mockResolvedValue({ id: "sig-1" } as never);
    const { POST } = await import("./route");
    const res = await POST(
      req({ name: "Tactile product opening", tags: ["Hook"], description: "d", itemIds: ["i1", "i2"] }) as never,
      { params },
    );
    expect(res.status).toBe(201);
    expect(vi.mocked(createSignal)).toHaveBeenCalledWith("client-1", expect.objectContaining({
      name: "Tactile product opening", itemIds: ["i1", "i2"], createdBy: "user-1",
    }));
  });

  it("rejects an empty name or missing itemIds array", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ name: " ", tags: [], description: "", itemIds: [] }) as never, { params })).status).toBe(400);
    expect((await POST(req({ name: "x", tags: [], description: "" }) as never, { params })).status).toBe(400);
  });
});
```

Note the signals POST rejects an **empty `itemIds`** at creation (a signal is born from selected evidence — PRD Flow C); only later deletions may empty it (D187).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/clients/[id]/market"`
Expected: FAIL — routes don't exist.

- [ ] **Step 3: Implement the routes**

```ts
// src/app/api/clients/[id]/market/route.ts
import { NextRequest } from "next/server";
import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { ensureSystemBoards, listItems } from "@/lib/db/moodboards";
import { listSignalsWithItems } from "@/lib/db/signals";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch(async () => {
      const { direct, adjacent } = await ensureSystemBoards(clientId);
      const [directItems, adjacentItems, signals] = await Promise.all([
        listItems(direct.id),
        listItems(adjacent.id),
        listSignalsWithItems(clientId),
      ]);
      return apiOk({
        direct: { board: direct, items: directItems },
        adjacent: { board: adjacent, items: adjacentItems },
        signals,
      });
    }),
  );
}
```

```ts
// src/app/api/clients/[id]/market/references/route.ts
import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { ensureSystemBoards } from "@/lib/db/moodboards";
import { ingestReference } from "@/lib/market/ingest";
import { MARKET_BUCKETS, type MarketBucket } from "@/lib/market/constants";
import { resolveCallerContext } from "@/lib/dal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    let body: { url?: string; bucket?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const url = body.url?.trim();
    if (!url) return apiError("url is required", 400);
    if (!MARKET_BUCKETS.includes(body.bucket as MarketBucket)) {
      return apiError("bucket must be 'direct' or 'adjacent'", 400);
    }
    return withTryCatch(async () => {
      const boards = await ensureSystemBoards(clientId);
      const board = body.bucket === "direct" ? boards.direct : boards.adjacent;
      const { userId } = await resolveCallerContext();
      const item = await ingestReference({
        boardId: board.id,
        clientId,
        url,
        note: body.note?.trim() || undefined,
        addedBy: userId,
      });
      return apiOk({ item }, 201);
    });
  });
}
```

```ts
// src/app/api/clients/[id]/market/signals/route.ts
import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { createSignal } from "@/lib/db/signals";
import { resolveCallerContext } from "@/lib/dal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    let body: { name?: string; tags?: string[]; description?: string; itemIds?: string[] };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const name = body.name?.trim();
    if (!name) return apiError("name is required", 400);
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return apiError("itemIds must be a non-empty array", 400);
    }
    return withTryCatch(async () => {
      const { userId } = await resolveCallerContext();
      const signal = await createSignal(clientId, {
        name,
        tags: Array.isArray(body.tags) ? body.tags : [],
        description: body.description?.trim() ?? "",
        createdBy: userId,
        itemIds: body.itemIds!,
      });
      return apiOk({ signal }, 201);
    });
  });
}
```

```ts
// src/app/api/clients/[id]/market/signals/[signalId]/route.ts
import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { updateSignal, deleteSignal } from "@/lib/db/signals";

type Params = { params: Promise<{ id: string; signalId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, signalId } = await params;
  return withClient(req, Promise.resolve({ id }), async () => {
    let body: { name?: string; tags?: string[]; description?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    if (body.name !== undefined && !body.name.trim()) return apiError("name cannot be empty", 400);
    return withTryCatch(async () => {
      await updateSignal(signalId, {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      });
      return apiOk({ ok: true });
    });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, signalId } = await params;
  return withClient(req, Promise.resolve({ id }), async () =>
    withTryCatch(async () => {
      await deleteSignal(signalId);
      return apiOk({ ok: true });
    }),
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/clients/[id]/market"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[id]/market"
git commit -m "feat(market): market API — boards+items+signals GET, reference and signal writes"
```

---

### Task 8: Extension POST path — ingest + note on the existing items route

**Files:**
- Modify: `src/app/api/moodboards/[id]/items/route.ts` (POST)
- Test: `src/app/api/moodboards/[id]/items/route.test.ts` (extend)

**Interfaces:**
- Consumes: `ingestReference` (Task 6), `withMoodboard` (route-helpers — its handler receives `(moodboardId)`; the board's `client_id` is needed for the thumbnail path, so also `getMoodboardClientId` below).
- Produces: POST body grows to `{ imageUrl?: string; pageUrl?: string; sourceUrl?: string; note?: string }` — `pageUrl ?? imageUrl` is the reference URL. Existing extension payloads (`imageUrl` + `sourceUrl`) keep working unchanged.

- [ ] **Step 1: Add a `getMoodboardClientId` helper to `src/lib/db/moodboards.ts`**

```ts
export async function getMoodboardClientId(moodboardId: string): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("moodboards")
    .select("client_id")
    .eq("id", moodboardId)
    .maybeSingle();
  if (error) throw error;
  return (data as { client_id: string } | null)?.client_id ?? null;
}
```

- [ ] **Step 2: Write the failing tests** (extend the existing test file; keep its current tests green — they pin the backward-compat contract)

```ts
// add to src/app/api/moodboards/[id]/items/route.test.ts
vi.mock("@/lib/market/ingest", () => ({ ingestReference: vi.fn() }));
// (and add getMoodboardClientId: vi.fn() to the existing @/lib/db/moodboards mock)
import { ingestReference } from "@/lib/market/ingest";
import { getMoodboardClientId } from "@/lib/db/moodboards";

it("routes an imageUrl clip through ingest (backward-compatible extension payload)", async () => {
  vi.mocked(getMoodboardClientId).mockResolvedValue("client-1");
  vi.mocked(ingestReference).mockResolvedValue({ id: "item-1" } as never);
  const { POST } = await import("./route");
  const res = await POST(postReq({ imageUrl: "https://cdn/a.jpg", sourceUrl: "https://page" }), { params });
  expect(res.status).toBe(201);
  expect(vi.mocked(ingestReference)).toHaveBeenCalledWith(expect.objectContaining({
    url: "https://cdn/a.jpg", sourceUrl: "https://page", clientId: "client-1",
  }));
});

it("routes a pageUrl clip (new page-level context menu) through ingest with note", async () => {
  vi.mocked(getMoodboardClientId).mockResolvedValue("client-1");
  vi.mocked(ingestReference).mockResolvedValue({ id: "item-2" } as never);
  const { POST } = await import("./route");
  const res = await POST(postReq({ pageUrl: "https://www.instagram.com/reel/C8x/", note: "opening hook" }), { params });
  expect(res.status).toBe(201);
  expect(vi.mocked(ingestReference)).toHaveBeenCalledWith(expect.objectContaining({
    url: "https://www.instagram.com/reel/C8x/", sourceUrl: "https://www.instagram.com/reel/C8x/", note: "opening hook",
  }));
});
```

(`postReq` = whatever request-builder pattern the existing file uses — follow it.)

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run "src/app/api/moodboards/[id]/items/route.test.ts"`
Expected: new tests FAIL.

- [ ] **Step 4: Rewrite the POST handler**

```ts
// src/app/api/moodboards/[id]/items/route.ts — replace POST body handling
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withMoodboard(req, id, async (moodboardId) => {
    let body: { imageUrl?: string; pageUrl?: string; sourceUrl?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const url = (body.pageUrl ?? body.imageUrl)?.trim();
    if (!url) return apiError("imageUrl or pageUrl is required", 400);

    return withTryCatch(async () => {
      const clientId = await getMoodboardClientId(moodboardId);
      if (!clientId) return apiError("Moodboard not found.", 404);
      const { userId } = await resolveCallerContext();
      const item = await ingestReference({
        boardId: moodboardId,
        clientId,
        url,
        sourceUrl: body.sourceUrl?.trim() || (body.pageUrl ? url : undefined),
        note: body.note?.trim() || undefined,
        addedBy: userId,
      });
      return apiOk({ item }, 201);
    });
  });
}
```

(Imports to add: `withTryCatch`, `getMoodboardClientId`, `ingestReference`, `resolveCallerContext`. Remove the now-unused direct `addItem` import.)

- [ ] **Step 5: Run to verify pass — including the pre-existing tests**

Run: `npx vitest run "src/app/api/moodboards/[id]/items/route.test.ts"`
Expected: ALL pass — old tests prove the extension's current payload still works. If an old test asserted `addItem` was called directly, update it to assert `ingestReference` instead (the contract it pinned — item created from imageUrl — is unchanged).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/moodboards/[id]/items/route.ts" "src/app/api/moodboards/[id]/items/route.test.ts" src/lib/db/moodboards.ts
git commit -m "feat(market): items POST runs ingest — page clips, notes, attribution"
```

---

### Task 9: Shared reference tile + lightbox player

**Files:**
- Create: `src/components/market/reference-tile.tsx`
- Create: `src/components/market/reference-lightbox.tsx`
- Create: `src/components/market/kind-badge.tsx`

**Interfaces:**
- Consumes: `MoodboardItem` (Task 5), `embedUrlFor` (Task 2), shadcn `Button`, Lucide icons, `cn`.
- Produces:
  - `ReferenceTile({ item, selected, selectable, width?, height?, onToggle, onOpen }: { item: MoodboardItem; selected: boolean; selectable: boolean; width?: number; height?: number; onToggle: () => void; onOpen: () => void })`
  - `ReferenceLightbox({ item, onClose }: { item: MoodboardItem; onClose: () => void })`
  - `KindBadge({ kind }: { kind: ReferenceKind })`

No unit tests (presentational; repo convention keeps tests at lib/route level). Verified visually in Task 10.

- [ ] **Step 1: KindBadge**

```tsx
// src/components/market/kind-badge.tsx
import { Youtube, Instagram, Music2, Film, Link2, Image as ImageIcon } from "lucide-react";
import type { ReferenceKind } from "@/lib/market/constants";

const ICONS: Record<ReferenceKind, typeof Youtube> = {
  youtube: Youtube,
  instagram: Instagram,
  tiktok: Music2,
  video: Film,
  gif: Film,
  image: ImageIcon,
  link: Link2,
};

export function KindBadge({ kind }: { kind: ReferenceKind }) {
  if (kind === "image") return null; // images are the default — no badge noise
  const Icon = ICONS[kind];
  return (
    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white">
      <Icon className="size-3.5" strokeWidth={1.5} />
    </span>
  );
}
```

- [ ] **Step 2: ReferenceTile**

Model the interaction pattern on `src/components/canvas/reference-image-picker/image-tile.tsx` (read it first — selected ring, hover, keyboard handling). Differences: renders `item.thumbnail_url ?? item.image_url` when the kind has a visual, or a **link tile** (favicon via `https://www.google.com/s2/favicons?domain=<host>&sz=64`, domain text, clamped note) when it doesn't; overlays `KindBadge`; shows `item.note` as a bottom-gradient one-line clamp on hover (text over imagery must stay readable — dark scrim `from-black/60`, white text).

```tsx
// src/components/market/reference-tile.tsx
"use client";

import { Check, Expand } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { KindBadge } from "./kind-badge";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Props = {
  item: MoodboardItem;
  selected: boolean;
  selectable: boolean;
  width?: number;
  height?: number;
  onToggle: () => void;
  onOpen: () => void;
};

export function ReferenceTile({ item, selected, selectable, width, height, onToggle, onOpen }: Props) {
  const visual = item.thumbnail_url ?? (item.kind === "image" || item.kind === "gif" ? item.image_url : null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={selectable ? onToggle : onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (selectable ? onToggle : onOpen)();
        }
      }}
      title={item.note ?? item.image_url}
      style={width && height ? { width, height } : undefined}
      className={cn(
        "group relative block cursor-pointer overflow-hidden rounded-md bg-muted",
        "ring-1 ring-inset transition-[box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:scale-[1.01]",
        selected ? "ring-[3px] ring-primary" : "ring-black/10 hover:ring-black/30",
      )}
    >
      {visual ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={visual} alt={item.note ?? ""} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full min-h-24 flex-col items-start justify-between gap-2 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${hostOf(item.image_url)}&sz=64`}
            alt=""
            className="size-6 rounded"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{hostOf(item.image_url)}</p>
            {item.note && <p className="line-clamp-2 text-xs text-muted-foreground">{item.note}</p>}
          </div>
        </div>
      )}

      <KindBadge kind={item.kind} />

      {visual && item.note && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <p className="line-clamp-1 text-xs text-white">{item.note}</p>
        </div>
      )}

      {selected && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check className="size-3.5" strokeWidth={2} />
        </span>
      )}

      {selectable && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-1.5 right-1.5 size-6 opacity-0 shadow-card transition-opacity duration-200 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label="Open reference"
        >
          <Expand className="size-3.5" strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: ReferenceLightbox**

Model the shell on `src/components/shared/full-screen-image-zoom.tsx` (read it first; reuse it directly for image/gif kinds). Player selection:

```tsx
// src/components/market/reference-lightbox.tsx
"use client";

import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { embedUrlFor } from "@/lib/market/classify";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";

export function ReferenceLightbox({ item, onClose }: { item: MoodboardItem; onClose: () => void }) {
  if (item.kind === "image" || item.kind === "gif") {
    return <FullScreenImageZoom imageUrl={item.image_url} title={item.note ?? ""} onClose={onClose} />;
  }

  const embed = embedUrlFor(item.kind, item.image_url);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-3xl flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === "video" ? (
          <video src={item.image_url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
        ) : embed ? (
          <iframe
            src={embed}
            className="aspect-[9/16] max-h-[70vh] w-full rounded-lg border-0 bg-black sm:mx-auto sm:w-auto"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="rounded-lg bg-background p-6 text-center">
            <p className="text-sm text-muted-foreground">No in-app preview for this reference.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg bg-background/95 px-4 py-3 shadow-card">
          <p className="line-clamp-2 min-w-0 text-sm text-foreground">{item.note ?? ""}</p>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={item.source_url ?? item.image_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" strokeWidth={1.5} />
                  Open source
                </a>
              }
            />
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Check `FullScreenImageZoom`'s actual prop names before wiring (`imageUrl`/`title`/`onClose` per its usage in `gallery-drawer.tsx:522-525`); adjust to match reality. YouTube embeds prefer `aspect-video`; keep `aspect-[9/16]` for instagram/tiktok — branch on kind if it looks wrong in Step 4's visual check.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (Visual verification happens on the page in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add src/components/market
git commit -m "feat(market): shared reference tile, kind badge, lightbox player"
```

---

### Task 10: Market page — tabs, masonry, add form

**Files:**
- Create: `src/app/clients/[id]/market/page.tsx` (server component)
- Create: `src/components/market/market-view.tsx` (client)
- Create: `src/components/market/add-reference-form.tsx`
- Create: `src/hooks/use-market.ts`

**Interfaces:**
- Consumes: `getClientBySlug`, `resolveOrgId` (same guard as the KB page); GET/POST routes from Task 7; `ReferenceTile`, `ReferenceLightbox` (Task 9); shadcn `Tabs`, `Input`, `Textarea`, `Select`, `Button`, `InputGroup`; `authFetch` from `@/lib/supabase/session-ready`.
- Produces: `useMarket(clientId: string)` returning `{ data: MarketData | null, loading, refresh, addReference(input: { url: string; bucket: MarketBucket; note?: string }): Promise<boolean>, createSignal(input: { name: string; tags: string[]; description: string; itemIds: string[] }): Promise<boolean>, deleteSignal(id: string): Promise<void> }` where `MarketData = { direct: { board: Moodboard; items: MoodboardItem[] }; adjacent: {...}; signals: SignalWithItems[] }`. Task 11 consumes `createSignal`; the selection state lives in `MarketView`.

- [ ] **Step 1: `use-market.ts`**

```ts
// src/hooks/use-market.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase/session-ready";
import type { Moodboard, MoodboardItem } from "@/lib/db/moodboards";
import type { SignalWithItems } from "@/lib/db/signals";
import type { MarketBucket } from "@/lib/market/constants";

export type MarketData = {
  direct: { board: Moodboard; items: MoodboardItem[] };
  adjacent: { board: Moodboard; items: MoodboardItem[] };
  signals: SignalWithItems[];
};

export function useMarket(clientId: string) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authFetch(`/api/clients/${clientId}/market`);
    if (res.ok) setData((await res.json()) as MarketData);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const addReference = useCallback(
    async (input: { url: string; bucket: MarketBucket; note?: string }) => {
      const res = await fetch(`/api/clients/${clientId}/market/references`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [clientId, refresh],
  );

  const createSignal = useCallback(
    async (input: { name: string; tags: string[]; description: string; itemIds: string[] }) => {
      const res = await fetch(`/api/clients/${clientId}/market/signals`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (res.ok) await refresh();
      return res.ok;
    },
    [clientId, refresh],
  );

  const deleteSignal = useCallback(
    async (signalId: string) => {
      const res = await fetch(`/api/clients/${clientId}/market/signals/${signalId}`, { method: "DELETE" });
      if (res.ok) await refresh();
    },
    [clientId, refresh],
  );

  return { data, loading, refresh, addReference, createSignal, deleteSignal };
}
```

- [ ] **Step 2: Server page** — mirror the KB page's guard exactly ([kb/page.tsx](../../../src/app/clients/[id]/kb/page.tsx) lines 26–39):

```tsx
// src/app/clients/[id]/market/page.tsx
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { MarketView } from "@/components/market/market-view";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <MarketView clientId={client.id} clientName={client.name} clientSlug={client.slug} />
    </main>
  );
}
```

- [ ] **Step 3: Add-reference form** — shadcn only; bucket is a `Select`, note a `Textarea`:

```tsx
// src/components/market/add-reference-form.tsx
"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { MarketBucket } from "@/lib/market/constants";

type Props = {
  defaultBucket: MarketBucket;
  onAdd: (input: { url: string; bucket: MarketBucket; note?: string }) => Promise<boolean>;
};

export function AddReferenceForm({ defaultBucket, onAdd }: Props) {
  const [url, setUrl] = useState("");
  const [bucket, setBucket] = useState<MarketBucket>(defaultBucket);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!url.trim() || busy) return;
    setBusy(true);
    const ok = await onAdd({ url: url.trim(), bucket, note: note.trim() || undefined });
    setBusy(false);
    if (ok) {
      setUrl("");
      setNote("");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/40 p-3 hover:bg-primary/5">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Paste a link — reel, video, image, article…"
          className="flex-1"
        />
        <Select value={bucket} onValueChange={(v) => setBucket(v as MarketBucket)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="adjacent">Adjacent</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => void submit()} disabled={!url.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : <Plus className="size-4" strokeWidth={1.5} />}
          Add
        </Button>
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note — what caught your eye?"
        rows={1}
        className="resize-none"
      />
    </div>
  );
}
```

(Check `src/components/ui/select.tsx` for the vendored Select's exact subcomponent names before wiring — Base UI registry naming may differ from the radix names above; follow the vendored file.)

- [ ] **Step 4: MarketView** — tabs + masonry + selection + lightbox. Masonry via `MasonryPhotoAlbum` following `gallery-masonry.tsx`'s pattern but with `ReferenceTile`; simpler columns for a full page: `columns={(w) => (w < 640 ? 2 : w < 1024 ? 3 : 4)}`. State: `activeTab: "direct" | "adjacent" | "signals"`, `selectedIds: Set<string>` (persists across bucket tabs — selection may span both), `previewItem: MoodboardItem | null`, `signalDialogOpen: boolean`. Render:
  - Header: client name (`font-display`), `.text-eyebrow` "Market" label, `AddReferenceForm` (hidden on the signals tab).
  - shadcn `Tabs` with the three tabs; Direct/Adjacent each render the masonry of `ReferenceTile`s (`selectable` true, `onToggle` updates `selectedIds`, `onOpen` sets `previewItem`).
  - When `selectedIds.size > 0`: a floating action bar (bottom-center, `shadow-lg`, rounded-full) — "N selected · **Group as Signal**" `Button` (opens the Task 11 dialog) + a clear (`X`) `Button`.
  - `previewItem && <ReferenceLightbox item={previewItem} onClose={() => setPreviewItem(null)} />`.
  - Signals tab content is Task 11 (placeholder `null` for now — this task's commit ships with the tab present but empty).
  - Empty states: friendly one-liner per tab ("No direct references yet — paste a link above or clip one from the browser.").

- [ ] **Step 5: Verify in the app**

Run: `npm run dev:next`, open `/clients/<existing-client-slug>/market` (requires migration 0034 applied — if the user hasn't applied it yet, pause and say so rather than debugging phantom column errors).
Check: page loads; boards auto-provision (Direct/Adjacent rows appear in DB); adding a YouTube URL shows a thumbnail tile with badge; clicking it plays in the lightbox; a garbage URL yields a link tile; note shows on hover.

- [ ] **Step 6: Full test run + commit**

Run: `npx vitest run` — expected: green (modulo the known Kling cold-cache flake).

```bash
git add "src/app/clients/[id]/market" src/components/market src/hooks/use-market.ts
git commit -m "feat(market): market page — tabs, masonry, add form, watchable lightbox"
```

---

### Task 11: Signals UI — group dialog, cards, detail

**Files:**
- Create: `src/components/market/group-as-signal-dialog.tsx`
- Create: `src/components/market/signal-card.tsx`
- Create: `src/components/market/signal-detail.tsx`
- Modify: `src/components/market/market-view.tsx` (wire dialog + signals tab)

**Interfaces:**
- Consumes: `createSignal`/`deleteSignal` from `useMarket` (Task 10), `SignalWithItems` (Task 5), `ReferenceTile`/`ReferenceLightbox` (Task 9), shadcn `Dialog`, `Input`, `Textarea`, `Button`.
- Produces:
  - `GroupAsSignalDialog({ open, selectedItems, onClose, onCreate }: { open: boolean; selectedItems: MoodboardItem[]; onClose: () => void; onCreate: (input: { name: string; tags: string[]; description: string; itemIds: string[] }) => Promise<boolean> })`
  - `SignalCard({ signal, onOpen }: { signal: SignalWithItems; onOpen: () => void })`
  - `SignalDetail({ signal, onBack, onDelete }: { signal: SignalWithItems; onBack: () => void; onDelete: () => void })`

- [ ] **Step 1: GroupAsSignalDialog**

shadcn `Dialog`. Fields: name (`Input`, required), tags (`Input`, comma-separated — split on `,`, trim, drop empties; a chip input is V1.x polish), description (`Textarea`, 3 rows). Footer: thumbnails strip of `selectedItems` (small, `size-10 rounded object-cover`) so the designer sees what they're naming; Cancel (`variant="ghost"`) + "Save Signal" (primary, disabled while name empty or submitting). On save: `await onCreate({ name, tags, description, itemIds: selectedItems.map(i => i.id) })`; on success close and clear selection (parent owns that).

- [ ] **Step 2: SignalCard**

White card, `rounded-xl border shadow-card p-4`, hover per design system (`hover:-translate-y-0.5` with the house easing). Content: name (`font-medium`), tags as neutral pills (`rounded-full bg-muted px-2 py-0.5 text-xs`), description `line-clamp-2 text-sm text-muted-foreground`, then a row of up to 5 linked-item thumbnails (`size-14 rounded-md object-cover`; `+N` chip beyond 5; favicon fallback for thumbnail-less items), and a `created_at` date line in `text-xs text-neutral-500`. Whole card clickable → `onOpen`.

- [ ] **Step 3: SignalDetail**

Renders inside the Signals tab when a card is open (local `openSignalId` state in `MarketView`, not a route — V1). Layout: back `Button` (ghost, `ArrowLeft`), name as heading (`font-display`), tags row, full description paragraph, then the full masonry of its items using `ReferenceTile` (`selectable=false`, `onOpen` → lightbox), and a `Trash2` ghost `Button` → confirm via shadcn `AlertDialog` (check `src/components/ui/` for the vendored confirm pattern; if absent, a two-step inline confirm on the button) → `onDelete`. Empty-evidence state (D187): "This signal's references were removed. The interpretation remains — re-attach evidence or delete it."

- [ ] **Step 4: Wire into MarketView**

Signals tab: grid of `SignalCard`s (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`) or `SignalDetail` when one is open. Action bar's "Group as Signal" opens the dialog with `selectedItems` resolved from `selectedIds` across both buckets' item arrays; on successful create, clear selection and switch `activeTab` to `"signals"` so the designer sees the result land.

- [ ] **Step 5: Verify in the app**

Multi-select 3 tiles across Direct + Adjacent → Group as Signal → name/tags/description → Save. Check: card appears under Signals; opening it shows the evidence; the same items still sit in their buckets; deleting one reference from a bucket thins the signal card on refresh.

- [ ] **Step 6: Full test run + commit**

Run: `npx vitest run` — expected green.

```bash
git add src/components/market
git commit -m "feat(market): signals — group dialog, cards, detail view"
```

---

### Task 12: Gallery drawer renders the new item shapes

**Files:**
- Modify: `src/components/canvas/gallery-drawer/types.ts` (GalleryImage gains optional `kind`, `note`, `mediaUrl`)
- Modify: `src/components/canvas/gallery-drawer/gallery-drawer.tsx` (moodboard mapping + preview branching)
- Modify: `src/components/canvas/gallery-drawer/gallery-add-url.tsx` (note field)

**Interfaces:**
- Consumes: `MoodboardItem.kind/note/thumbnail_url` (Task 5), `ReferenceLightbox` (Task 9), `useMoodboards.addItemUrl` (extended below).
- Produces: drawer shows correct thumbnails for video/link references and plays them on preview; drawer add flow can attach a note.

- [ ] **Step 1: Extend the moodboard→GalleryImage mapping** in `gallery-drawer.tsx` (~line 208)

```ts
const moodboardImages: GalleryImage[] = useMemo(
  () =>
    moodboards.items.map((it) => ({
      id: it.id,
      imageUrl: it.thumbnail_url ?? it.image_url, // grid always gets a renderable image
      previewUrl: it.image_url,
      filename: filenameFromUrl(it.image_url),
      subtitle: it.note ?? "",
      source: "moodboard" as const,
      sourceUrl: it.source_url ?? undefined,
      kind: it.kind,
      note: it.note ?? undefined,
      mediaUrl: it.image_url,
    })),
  [moodboards.items],
);
```

And in `types.ts` add to `GalleryImage`:

```ts
  /** Reference kind — set when source === "moodboard"; absent elsewhere. */
  kind?: import("@/lib/market/constants").ReferenceKind;
  note?: string;
  /** The original reference URL (image_url) — what the lightbox plays. */
  mediaUrl?: string;
```

(Preserve the existing mapping's exact current fields — read the block before replacing; the shape above adds, it doesn't remove.)

- [ ] **Step 2: Branch the preview** (~line 522)

```tsx
{previewImage && previewImage.kind && previewImage.kind !== "image" && previewImage.kind !== "gif" ? (
  <ReferenceLightbox
    item={{
      id: previewImage.id,
      moodboard_id: "",
      image_url: previewImage.mediaUrl ?? previewImage.imageUrl,
      source_url: previewImage.sourceUrl ?? null,
      kind: previewImage.kind,
      note: previewImage.note ?? null,
      added_by: null,
      thumbnail_url: previewImage.imageUrl,
      position: 0,
      added_at: "",
    }}
    onClose={() => setPreviewId(null)}
  />
) : previewImage ? (
  <FullScreenImageZoom /* existing props unchanged */ />
) : null}
```

(Match the existing `setPreviewId`/close-handler names in the file — read the current block first.)

- [ ] **Step 3: Note field on the drawer's add-URL** — extend `gallery-add-url.tsx`'s `onAdd` signature to `(url: string, note?: string)` with an optional second `Input` (placeholder "Note (optional)"), and `useMoodboards.addItemUrl` to pass `{ imageUrl, note }` in the POST body (route accepts `note` since Task 8).

- [ ] **Step 4: Verify in the app**

Open a canvas → gallery drawer → Moodboards tab. Check: Direct/Adjacent boards appear alongside customs; a YouTube reference shows its thumbnail; previewing it plays; plain images behave exactly as before.

- [ ] **Step 5: Full test run + commit**

Run: `npx vitest run` (drawer has hook/type coverage in `gallery-*` tests — they must stay green).

```bash
git add src/components/canvas/gallery-drawer src/hooks/use-moodboards.ts
git commit -m "feat(market): gallery drawer renders reference kinds, plays video previews"
```

---

### Task 13: Extension — clip pages, carry a note, fix the app URL

**Files:**
- Modify: `moodboard-extension/background.js`
- Modify: `moodboard-extension/sidepanel.html`
- Modify: `moodboard-extension/sidepanel.js`
- Modify: `moodboard-extension/config.js`

**Interfaces:**
- Consumes: POST `/api/moodboards/[id]/items` accepting `{ pageUrl, sourceUrl?, note? }` (Task 8).
- Produces: a second context-menu entry on any page; a note textarea in the side panel whose value is attached to the **next** clip, then cleared.

No test harness exists for the extension (plain JS, no bundler) — verification is manual (Step 4).

- [ ] **Step 1: `background.js` — page-level menu item**

```js
// In onInstalled, after the existing image menu:
chrome.contextMenus.create({
  id: "add-page-to-moodboard",
  title: "Add this page as reference",
  contexts: ["page", "video", "link"],
});
```

```js
// Rework the click listener to handle both menu ids (keep the sidePanel.open()
// user-gesture ordering comment and behavior EXACTLY as it is):
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isImage = info.menuItemId === "add-to-moodboard" && info.srcUrl;
  const isPage = info.menuItemId === "add-page-to-moodboard";
  if (!isImage && !isPage) return;

  if (tab && tab.windowId != null) {
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch((e) => console.error("[moodboard] side panel open failed:", e));
  }

  const { target, pendingNote } = await chrome.storage.local.get(["target", "pendingNote"]);
  if (!target || !target.boardId) {
    flashBadge("!", "#b91c1c");
    return;
  }

  // For a link context, clip the link's destination; otherwise the page itself.
  const pageUrl = isImage ? undefined : info.linkUrl || info.pageUrl;
  const body = isImage
    ? { imageUrl: info.srcUrl, sourceUrl: info.pageUrl, note: pendingNote || undefined }
    : { pageUrl, sourceUrl: info.pageUrl, note: pendingNote || undefined };

  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards/${target.boardId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    await chrome.storage.local.remove("pendingNote"); // note rides one clip
    flashBadge("✓", "#16a34a");
  } catch (e) {
    flashBadge("x", "#b91c1c");
    console.error("[moodboard] add failed:", e);
  }
});
```

- [ ] **Step 2: Side panel note field**

`sidepanel.html`: add under the boards list (native elements are correct here — this is the extension, not app JSX):

```html
<label for="note" class="note-label">Note for the next clip (optional)</label>
<textarea id="note" rows="2" placeholder="What caught your eye?"></textarea>
```

`sidepanel.js`: persist as the user types, restore on open:

```js
const noteEl = document.getElementById("note");
noteEl.addEventListener("input", () => {
  chrome.storage.local.set({ pendingNote: noteEl.value.trim() });
});
chrome.storage.local.get("pendingNote").then(({ pendingNote }) => {
  if (pendingNote) noteEl.value = pendingNote;
});
```

`sidepanel.css`: style the textarea to match the existing panel inputs (same font/border variables already in the file).

- [ ] **Step 3: `config.js` — point at the deployed app**

Read the file first. Set `APP_BASE_URL` to the deployed URL already whitelisted in the manifest (`https://creativeos-yuvabe.vercel.app`), keeping the localhost value as a commented dev toggle. (Known issue from project memory: it still pointed at localhost.)

- [ ] **Step 4: Manual verification**

Load the unpacked extension (`chrome://extensions` → Load unpacked → `moodboard-extension/`). Pick a client + Direct board in the panel; type a note; right-click an Instagram reel page → "Add this page as reference". Check: badge flashes ✓; the reference appears on the Market page with kind `instagram`, the note, and (if oEmbed cooperated) a thumbnail; the note box cleared.

- [ ] **Step 5: Commit**

```bash
git add moodboard-extension
git commit -m "feat(extension): page-level clipping, per-clip note, deployed app URL"
```

---

### Task 14: Client nav — KB | Market

**Files:**
- Create: `src/components/clients/client-section-nav.tsx`
- Modify: `src/app/clients/[id]/kb/page.tsx` (render nav)
- Modify: `src/app/clients/[id]/market/page.tsx` (render nav)

**Interfaces:**
- Consumes: client `slug`; `usePathname` or server-side current-section prop.
- Produces: `ClientSectionNav({ slug, active }: { slug: string; active: "kb" | "market" })`.

- [ ] **Step 1: Component** (server-compatible — plain links, active state via prop, no hooks)

```tsx
// src/components/clients/client-section-nav.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "kb", label: "Brand KB", path: "kb" },
  { key: "market", label: "Market", path: "market" },
] as const;

export function ClientSectionNav({ slug, active }: { slug: string; active: "kb" | "market" }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-border">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={`/clients/${slug}/${s.path}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-200",
            active === s.key
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
```

(Nav links are `Link`s — navigation, not controls; no Button needed. Placement inside each page: directly under the breadcrumb in `kb/page.tsx` — read its JSX to slot it without disturbing the review/edit layout branch — and at the top of `market/page.tsx`'s `<main>`.)

- [ ] **Step 2: Wire into both pages, verify visually**

Both pages show the same two-tab nav; active state correct on each; KB's onboarding/review states still render undisturbed.

- [ ] **Step 3: Full suite + typecheck + lint**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: clean (pre-existing lint failures noted in project memory are not yours to fix — compare against `main`'s lint output if anything looks unrelated).

- [ ] **Step 4: Commit**

```bash
git add src/components/clients/client-section-nav.tsx "src/app/clients/[id]/kb/page.tsx" "src/app/clients/[id]/market/page.tsx"
git commit -m "feat(market): client section nav — KB | Market"
```

---

## Post-plan checks (run once, end of implementation)

- [ ] Full suite green: `npx vitest run` (Kling flake caveat applies).
- [ ] `npx tsc --noEmit` clean.
- [ ] Migration 0034 applied to the Supabase project by the user (Task 1 Step 3) — confirm before any live-app verification is reported as done.
- [ ] Walk PRD §15's requirement list against the app once, end-to-end: extension clip → Market page browse → watch a reel → multi-select → signal → drawer shows the boards.
- [ ] `superpowers:requesting-code-review` before merge; then `superpowers:finishing-a-development-branch`.
