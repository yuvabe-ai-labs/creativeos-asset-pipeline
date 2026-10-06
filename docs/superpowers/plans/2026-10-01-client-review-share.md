# Client Review Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator uploads an edited cut into a new `client-review` canvas node and shares a public `/r/[token]` link; clients (no login) enter a name once and leave paused-frame-stamped, editable comments on a mobile-first page; the comments appear on the node.

**Architecture:** Two new tables (`canvas_reviews`, `canvas_review_comments`) read and written only by server code through the service-role client. A single proxy exemption (`/r/*`, `/api/r/*`) plus one helper (`withShareToken`) is the only unauthenticated surface. Pure logic (validation, token, wire mapping, reviewer-name storage, pre-paint script) lives in `src/lib/client-review/` and is unit-tested in Vitest's node environment; UI is verified manually in the browser.

**Tech Stack:** Next.js 16 App Router (`src/proxy.ts`, async `params`), React 19, Supabase (Postgres, service-role), GCS (public URLs, V4 signed PUT), React Flow (`@xyflow/react`), Tailwind v4, shadcn on Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-client-review-share-design.md` (ADR D307 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7)

## Global Constraints

- Work only inside the worktree `.claude/worktrees/client-review-share` on branch `feat/client-review-share`.
- **Next.js 16 is not the Next.js you know.** Before writing a page, route handler, `not-found`, or `metadata`, read the matching guide in `node_modules/next/dist/docs/` and follow it over memory.
- Every interactive control is a shadcn primitive from `src/components/ui/*` (`Button`, `Input`, `Textarea`, `InputGroup`…). **Never** a raw `<button>`, `<input>`, `<textarea>` — including the hidden file picker (use `Input type="file"`). Base UI composes with `render`, not `asChild`.
- API routes return `apiError` / `apiOk` from `src/lib/api/route-helpers.ts` — never `NextResponse.json` directly. Session routes under `/api/nodes/[id]/*` use `withNode`. Multi-step async handlers are wrapped in `withTryCatch`.
- Design system: Clash Display (`font-display`) for titles, Gilroy body; purple `primary` only on primary CTAs (**Start review**, **Post**); `.text-eyebrow` for small-caps labels; Lucide icons at stroke 1.5; easing `cubic-bezier(0.22,1,0.36,1)` only; "add" actions are dashed primary chips (`border border-dashed border-primary/40 hover:bg-primary/5`). Colors only via CSS variables.
- One component per file, named exports, split at ~200 lines.
- Limits (exact): reviewer name 1–60 chars after trim; comment body 1–2,000 chars after trim; cut file extensions `mp4`, `mov`, `webm`; cut max size 500 MB; share token = 32 random bytes, base64url (43 chars).
- `localStorage` key: `reviewer_name` (one site-wide key). Every storage access wrapped in `try/catch`.
- Public `GET` responses never contain org, client, canvas or node ids.
- Public pages: `robots: { index: false, follow: false }` and `referrer: "no-referrer"`.
- Comments are add + edit only. No delete, no clearing to empty. Edits change `body` only (never `timecode_ms` or `author_name`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Test command: `npx vitest run <path>`; full suite `npm test`; types `npx tsc --noEmit`; lint `npm run lint`. If a single Kling test times out while running in parallel with `tsc`, re-run it alone before investigating — it is a known flake.

## Review Focus

1. **Comment stamped before the video has loaded** (`currentTime` is `NaN` or the client focuses the box at 0:00) — expect `0:00`, never `NaN:NaN` and never a rejected post. Pinned by `toTimecodeMs` tests in Task 1.
2. **Whitespace-only name or comment** ("   ") — expect it to be treated as empty: button disabled client-side and 400 server-side. Pinned in Task 1 (`parseNewComment` / `parseCommentEdit`) and Task 6 (route 400).
3. **Garbage or truncated token in the URL** (a link cut off in WhatsApp, `/r/abc`) — expect the friendly "no longer active" page, with no DB query for malformed tokens. Pinned in Task 4 (`withShareToken` skips DB) and manual check in Task 9.
4. **"change" name after a pre-painted visit** — the wrapper must not stay stuck on `known` after the name is cleared. Pinned by using explicit `"known"`/`"unknown"` values (Task 8 tests the script; Task 9 manual step).
5. **Double-tapping Post on a slow phone connection** — expect exactly one comment. Pinned in Task 9 by disabling **Post** while a request is in flight (manual step with network throttling).

---

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `supabase/migrations/0047_canvas_reviews.sql` | Tables, org trigger, RLS, Realtime-free |
| `src/lib/client-review/constants.ts` | Limits, extensions, storage key |
| `src/lib/client-review/validate.ts` (+ `.test.ts`) | Request parsing, timecode clamp, extension check |
| `src/lib/client-review/token.ts` (+ `.test.ts`) | Token generation + shape check (server-only) |
| `src/lib/client-review/wire.ts` (+ `.test.ts`) | Row → wire types (pure) |
| `src/lib/client-review/paths.ts` (+ `.test.ts`) | `isPublicReviewPath`, `sharePathFor` |
| `src/lib/client-review/reviewer-name.ts` (+ `.test.ts`) | Safe name storage + pre-paint script string |
| `src/lib/db/client-reviews.ts` | Supabase queries |
| `src/lib/client-review/load.ts` | `buildPublicReview` (server-only, shared by page + GET route) |
| `src/app/api/r/[token]/route.ts` (+ `.test.ts`) | Public GET |
| `src/app/api/r/[token]/comments/route.ts` (+ `.test.ts`) | Public POST |
| `src/app/api/r/[token]/comments/[commentId]/route.ts` (+ `.test.ts`) | Public PATCH |
| `src/app/api/nodes/[id]/client-review/route.ts` (+ `.test.ts`) | Team GET + finalize POST |
| `src/app/api/nodes/[id]/client-review/sign/route.ts` (+ `.test.ts`) | Signed upload URL |
| `src/proxy.test.ts` | Matcher exemption test |
| `src/components/layout/app-header.tsx` | Header hidden on `/r/*` |
| `src/app/r/[token]/page.tsx`, `src/app/r/[token]/not-found.tsx` | Public page |
| `src/components/client-review/review-api.ts` | Browser fetchers |
| `src/components/client-review/client-review-page.tsx` | Public page root (state, pre-paint wrapper) |
| `src/components/client-review/name-gate.tsx` | Name screen |
| `src/components/client-review/review-video.tsx` | Video player |
| `src/components/client-review/comment-composer.tsx` | Paused-frame composer |
| `src/components/client-review/comment-list.tsx` | List (shared with focus view) |
| `src/components/client-review/comment-item.tsx` | One comment, inline edit |
| `src/components/nodes/client-review-node.tsx` | Canvas card |
| `src/components/nodes/client-review-focus-view.tsx` | Focus view |
| `src/components/nodes/client-review-upload.tsx` | Upload chip (card + focus view) |
| `src/components/nodes/use-node-client-review.ts` | Fetch hook for node + focus view |

**Modify**
| File | Change |
|---|---|
| `src/lib/storage/paths.ts` (+ `paths.test.ts`) | `pathForClientReviewCut` |
| `src/lib/storage/index.ts` | `signClientReviewUpload` |
| `src/lib/api/route-helpers.ts` (+ new `route-helpers.share-token.test.ts`) | `withShareToken` |
| `src/proxy.ts` | Matcher exempts `r/` and `api/r/` |
| `src/app/layout.tsx` | Use `AppHeader` |
| `src/lib/canvas-nodes.ts` | `ClientReviewNodeData`, union, `VALID_CONNECTIONS` |
| `src/lib/canvas-node-options.ts` (+ test) | Add `client-review`, mnemonic `R` |
| `src/components/canvas/quick-add-menu.tsx` | Icon |
| `src/components/canvas/canvas.tsx` | `nodeTypes` |
| `src/lib/nodes/describe-node.ts` | Description + `REV` abbrev |

---

### Task 1: Pure client-review rules (constants, validation, token, wire, paths)

**Files:**
- Create: `src/lib/client-review/constants.ts`, `validate.ts`, `validate.test.ts`, `token.ts`, `token.test.ts`, `wire.ts`, `wire.test.ts`, `paths.ts`, `paths.test.ts`

**Interfaces:**
- Produces:
  - `REVIEWER_NAME_MAX = 60`, `COMMENT_BODY_MAX = 2000`, `CUT_EXTENSIONS: ReadonlySet<string>`, `CUT_MAX_BYTES = 524_288_000`, `REVIEWER_NAME_KEY = "reviewer_name"`
  - `type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `parseNewComment(input: unknown): Parsed<{ authorName: string; body: string; timecodeMs: number }>`
  - `parseCommentEdit(input: unknown): Parsed<{ editorName: string; body: string }>`
  - `toTimecodeMs(seconds: number): number`
  - `cutExtension(filename: string): string | null` (lowercase ext if allowed, else null)
  - `generateShareToken(): string`, `isWellFormedToken(token: string): boolean`
  - `type CanvasReviewRow`, `type ReviewCommentRow`, `type ReviewComment`, `type PublicReview`, `type NodeClientReview`, `toReviewComment(row)`
  - `isPublicReviewPath(pathname: string): boolean`, `sharePathFor(token: string): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/client-review/validate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseNewComment, parseCommentEdit, toTimecodeMs, cutExtension } from "./validate";

describe("toTimecodeMs", () => {
  it("rounds seconds to whole milliseconds", () => {
    expect(toTimecodeMs(7.2345)).toBe(7235);
  });
  it("clamps NaN, negatives and Infinity to 0 (video not loaded yet)", () => {
    expect(toTimecodeMs(Number.NaN)).toBe(0);
    expect(toTimecodeMs(-3)).toBe(0);
    expect(toTimecodeMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("parseNewComment", () => {
  it("accepts and trims a valid comment", () => {
    const r = parseNewComment({ authorName: "  Priya ", body: " Logo too small ", timecodeMs: 4000 });
    expect(r).toEqual({ ok: true, value: { authorName: "Priya", body: "Logo too small", timecodeMs: 4000 } });
  });
  it("rejects a whitespace-only name", () => {
    expect(parseNewComment({ authorName: "   ", body: "x", timecodeMs: 0 }).ok).toBe(false);
  });
  it("rejects a whitespace-only body", () => {
    expect(parseNewComment({ authorName: "Priya", body: " \n ", timecodeMs: 0 }).ok).toBe(false);
  });
  it("rejects a name over 60 chars and a body over 2000 chars", () => {
    expect(parseNewComment({ authorName: "a".repeat(61), body: "x", timecodeMs: 0 }).ok).toBe(false);
    expect(parseNewComment({ authorName: "P", body: "x".repeat(2001), timecodeMs: 0 }).ok).toBe(false);
  });
  it("rejects a missing, negative or fractional timecode", () => {
    expect(parseNewComment({ authorName: "P", body: "x" }).ok).toBe(false);
    expect(parseNewComment({ authorName: "P", body: "x", timecodeMs: -1 }).ok).toBe(false);
    expect(parseNewComment({ authorName: "P", body: "x", timecodeMs: 1.5 }).ok).toBe(false);
  });
  it("rejects non-object input", () => {
    expect(parseNewComment(null).ok).toBe(false);
    expect(parseNewComment("hi").ok).toBe(false);
  });
});

describe("parseCommentEdit", () => {
  it("accepts and trims a valid edit", () => {
    expect(parseCommentEdit({ editorName: " Arjun ", body: " Warmer " })).toEqual({
      ok: true,
      value: { editorName: "Arjun", body: "Warmer" },
    });
  });
  it("rejects clearing a comment to empty", () => {
    expect(parseCommentEdit({ editorName: "Arjun", body: "   " }).ok).toBe(false);
  });
  it("ignores extra fields such as timecodeMs", () => {
    const r = parseCommentEdit({ editorName: "A", body: "b", timecodeMs: 999, authorName: "X" });
    expect(r).toEqual({ ok: true, value: { editorName: "A", body: "b" } });
  });
});

describe("cutExtension", () => {
  it("returns the lowercase extension for allowed video files", () => {
    expect(cutExtension("Final Cut.MP4")).toBe("mp4");
    expect(cutExtension("v2.mov")).toBe("mov");
    expect(cutExtension("a.webm")).toBe("webm");
  });
  it("returns null for anything else", () => {
    expect(cutExtension("poster.png")).toBeNull();
    expect(cutExtension("noext")).toBeNull();
  });
});
```

`src/lib/client-review/token.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateShareToken, isWellFormedToken } from "./token";

describe("share token", () => {
  it("is 43 base64url characters (32 bytes)", () => {
    const t = generateShareToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("is unique per call", () => {
    expect(generateShareToken()).not.toBe(generateShareToken());
  });
  it("recognises well-formed tokens only", () => {
    expect(isWellFormedToken(generateShareToken())).toBe(true);
    expect(isWellFormedToken("abc")).toBe(false);
    expect(isWellFormedToken("a".repeat(42) + "!")).toBe(false);
  });
});
```

`src/lib/client-review/wire.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toReviewComment, type ReviewCommentRow } from "./wire";

const row: ReviewCommentRow = {
  id: "c1",
  review_id: "r1",
  author_name: "Priya",
  body: "Logo too small",
  timecode_ms: 4000,
  edited_by_name: null,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

describe("toReviewComment", () => {
  it("maps a row to the wire shape without the review id", () => {
    expect(toReviewComment(row)).toEqual({
      id: "c1",
      authorName: "Priya",
      body: "Logo too small",
      timecodeMs: 4000,
      editedByName: null,
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
    });
    expect(toReviewComment(row)).not.toHaveProperty("reviewId");
  });
});
```

`src/lib/client-review/paths.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isPublicReviewPath, sharePathFor } from "./paths";

describe("isPublicReviewPath", () => {
  it("matches /r and anything under /r/", () => {
    expect(isPublicReviewPath("/r")).toBe(true);
    expect(isPublicReviewPath("/r/abc")).toBe(true);
  });
  it("does not match routes that merely start with r", () => {
    expect(isPublicReviewPath("/review")).toBe(false);
    expect(isPublicReviewPath("/clients/x")).toBe(false);
  });
});

describe("sharePathFor", () => {
  it("builds the public path", () => {
    expect(sharePathFor("tok")).toBe("/r/tok");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/client-review`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementation**

`src/lib/client-review/constants.ts`:
```ts
// D307 client review share. Limits are copied verbatim from the spec
// (docs/superpowers/specs/2026-09-30-client-review-share-design.md).
export const REVIEWER_NAME_MAX = 60;
export const COMMENT_BODY_MAX = 2000;
export const CUT_EXTENSIONS: ReadonlySet<string> = new Set(["mp4", "mov", "webm"]);
export const CUT_MAX_BYTES = 524_288_000; // 500 MB — browser PUTs straight to GCS
export const REVIEWER_NAME_KEY = "reviewer_name";
```

`src/lib/client-review/validate.ts`:
```ts
import { COMMENT_BODY_MAX, CUT_EXTENSIONS, REVIEWER_NAME_MAX } from "./constants";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown, label: string, max: number): Parsed<string> {
  if (typeof value !== "string") return { ok: false, error: `${label} is required.` };
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: `${label} is required.` };
  if (trimmed.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value: trimmed };
}

function record(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

// A <video> reports NaN before metadata loads; a comment written then is about 0:00.
export function toTimecodeMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * 1000);
}

export function parseNewComment(
  input: unknown,
): Parsed<{ authorName: string; body: string; timecodeMs: number }> {
  const o = record(input);
  if (!o) return { ok: false, error: "Invalid request body." };
  const name = text(o.authorName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const body = text(o.body, "Comment", COMMENT_BODY_MAX);
  if (!body.ok) return body;
  const t = o.timecodeMs;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0) {
    return { ok: false, error: "A timecode is required." };
  }
  return { ok: true, value: { authorName: name.value, body: body.value, timecodeMs: t } };
}

// Only the text is editable — the moment and the original author never change.
export function parseCommentEdit(
  input: unknown,
): Parsed<{ editorName: string; body: string }> {
  const o = record(input);
  if (!o) return { ok: false, error: "Invalid request body." };
  const name = text(o.editorName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const body = text(o.body, "Comment", COMMENT_BODY_MAX);
  if (!body.ok) return body;
  return { ok: true, value: { editorName: name.value, body: body.value } };
}

export function cutExtension(filename: string): string | null {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return null;
  const ext = filename.slice(idx + 1).toLowerCase();
  return CUT_EXTENSIONS.has(ext) ? ext : null;
}
```

`src/lib/client-review/token.ts`:
```ts
import "server-only";
import { randomBytes } from "node:crypto";

// D307: the token IS the capability. 32 CSPRNG bytes → 43 base64url chars.
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

// Cheap shape check so a mangled link never reaches the database.
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
```

`src/lib/client-review/wire.ts`:
```ts
// DB rows and the JSON shapes that leave the server. Pure — safe to import anywhere.

export type CanvasReviewRow = {
  id: string;
  canvas_id: string;
  node_id: string;
  org_id: string;
  video_path: string;
  share_token: string;
  created_by: string;
  created_at: string;
};

export type ReviewCommentRow = {
  id: string;
  review_id: string;
  author_name: string;
  body: string;
  timecode_ms: number;
  edited_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewComment = {
  id: string;
  authorName: string;
  body: string;
  timecodeMs: number;
  editedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

// Public payload: deliberately no org / client / canvas / node ids (spec §3).
export type PublicReview = {
  title: string;
  videoUrl: string;
  comments: ReviewComment[];
};

// Team payload for the canvas node + focus view.
export type NodeClientReview = {
  review: { videoUrl: string; sharePath: string } | null;
  comments: ReviewComment[];
};

export function toReviewComment(row: ReviewCommentRow): ReviewComment {
  return {
    id: row.id,
    authorName: row.author_name,
    body: row.body,
    timecodeMs: row.timecode_ms,
    editedByName: row.edited_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

`src/lib/client-review/paths.ts`:
```ts
// The one public route prefix (D307). Used by the proxy test and AppHeader.
export function isPublicReviewPath(pathname: string): boolean {
  return pathname === "/r" || pathname.startsWith("/r/");
}

export function sharePathFor(token: string): string {
  return `/r/${token}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/client-review`
Expected: PASS (all four files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/client-review
git commit -m "feat(client-review): pure rules — limits, validation, token, wire types

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migration 0047 + DB module

**Files:**
- Create: `supabase/migrations/0047_canvas_reviews.sql`, `src/lib/db/client-reviews.ts`

**Interfaces:**
- Consumes: `CanvasReviewRow`, `ReviewCommentRow` from `@/lib/client-review/wire`
- Produces (`src/lib/db/client-reviews.ts`):
  - `type ReviewByToken = CanvasReviewRow & { title: string }`
  - `getReviewByToken(token: string): Promise<ReviewByToken | null>`
  - `getReviewByNodeId(nodeId: string): Promise<CanvasReviewRow | null>`
  - `createReview(input: { canvasId: string; nodeId: string; videoPath: string; shareToken: string; createdBy: string }): Promise<CanvasReviewRow>` — throws `ReviewExistsError` on unique violation
  - `class ReviewExistsError extends Error`
  - `listComments(reviewId: string): Promise<ReviewCommentRow[]>` (oldest first)
  - `insertComment(input: { reviewId: string; authorName: string; body: string; timecodeMs: number }): Promise<ReviewCommentRow>`
  - `updateComment(input: { reviewId: string; commentId: string; body: string; editedByName: string }): Promise<ReviewCommentRow | null>` — `null` when the comment is not in that review

This task has no unit test: the module is a thin query layer, mocked by every route test in Tasks 4–7, and exercised for real in the Task 9/10 manual runs. Typecheck is the gate.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0047_canvas_reviews.sql`:
```sql
-- D307: public, token-scoped client review of an uploaded cut.
-- One review per Client review node; comments are add + edit (never delete).
-- Server code reads and writes both tables with the service-role client (D44).
-- No anon policy — the public page goes through /api/r/* (D86 stands).

create table canvas_reviews (
  id           uuid primary key default gen_random_uuid(),
  canvas_id    uuid not null references canvases(id) on delete cascade,
  node_id      uuid not null unique references nodes(id) on delete cascade,
  org_id       uuid not null references organizations(id),
  video_path   text not null,
  share_token  text not null unique,
  created_by   uuid not null,
  created_at   timestamptz not null default now()
);

create table canvas_review_comments (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references canvas_reviews(id) on delete cascade,
  author_name     text not null check (char_length(author_name) between 1 and 60),
  body            text not null check (char_length(body) between 1 and 2000),
  timecode_ms     int  not null check (timecode_ms >= 0),
  edited_by_name  text check (edited_by_name is null or char_length(edited_by_name) between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index canvas_review_comments_review_created
  on canvas_review_comments (review_id, created_at);

-- org_id from canvas → client → org, same pattern as set_node_version_org_id (0030).
create or replace function set_canvas_review_org_id() returns trigger
language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
      from canvases cv
      join clients cl on cl.id = cv.client_id
     where cv.id = new.canvas_id;
  end if;
  return new;
end;
$$;

create trigger canvas_reviews_set_org_id
  before insert on canvas_reviews
  for each row execute function set_canvas_review_org_id();

-- Default-deny: RLS on, no policies. Only the service role touches these tables.
alter table canvas_reviews enable row level security;
alter table canvas_review_comments enable row level security;
```

- [ ] **Step 2: Write the DB module**

`src/lib/db/client-reviews.ts`:
```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CanvasReviewRow, ReviewCommentRow } from "@/lib/client-review/wire";

export type ReviewByToken = CanvasReviewRow & { title: string };

export class ReviewExistsError extends Error {
  constructor() {
    super("This node already has a cut.");
  }
}

const REVIEW_COLUMNS = "id, canvas_id, node_id, org_id, video_path, share_token, created_by, created_at";

// The cut's title is the node's own title (spec §5) — read it from nodes.data.
export async function getReviewByToken(token: string): Promise<ReviewByToken | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .select(`${REVIEW_COLUMNS}, nodes!inner(data)`)
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { nodes, ...review } = data as unknown as CanvasReviewRow & {
    nodes: { data: { title?: unknown } } | { data: { title?: unknown } }[] | null;
  };
  const node = Array.isArray(nodes) ? nodes[0] : nodes;
  const title = typeof node?.data?.title === "string" ? node.data.title : "";
  return { ...review, title };
}

export async function getReviewByNodeId(nodeId: string): Promise<CanvasReviewRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .select(REVIEW_COLUMNS)
    .eq("node_id", nodeId)
    .maybeSingle();
  if (error) throw error;
  return (data as CanvasReviewRow | null) ?? null;
}

export async function createReview(input: {
  canvasId: string;
  nodeId: string;
  videoPath: string;
  shareToken: string;
  createdBy: string;
}): Promise<CanvasReviewRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_reviews")
    .insert({
      canvas_id: input.canvasId,
      node_id: input.nodeId,
      video_path: input.videoPath,
      share_token: input.shareToken,
      created_by: input.createdBy,
    })
    .select(REVIEW_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new ReviewExistsError(); // unique (node_id) — one cut per node
    throw error;
  }
  return data as CanvasReviewRow;
}

const COMMENT_COLUMNS =
  "id, review_id, author_name, body, timecode_ms, edited_by_name, created_at, updated_at";

export async function listComments(reviewId: string): Promise<ReviewCommentRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .select(COMMENT_COLUMNS)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewCommentRow[];
}

export async function insertComment(input: {
  reviewId: string;
  authorName: string;
  body: string;
  timecodeMs: number;
}): Promise<ReviewCommentRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .insert({
      review_id: input.reviewId,
      author_name: input.authorName,
      body: input.body,
      timecode_ms: input.timecodeMs,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data as ReviewCommentRow;
}

// Filtering on BOTH ids is the ownership check: a comment from another review
// matches nothing, so a token can never edit outside its own review.
export async function updateComment(input: {
  reviewId: string;
  commentId: string;
  body: string;
  editedByName: string;
}): Promise<ReviewCommentRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvas_review_comments")
    .update({
      body: input.body,
      edited_by_name: input.editedByName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.commentId)
    .eq("review_id", input.reviewId)
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewCommentRow | null) ?? null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Apply the migration to the staging database (operator step)**

Ask the operator to apply `0047_canvas_reviews.sql` to the staging Supabase project (SQL editor), the same way 0038 was applied. Do not proceed to the manual runs in Tasks 9–10 until they confirm. Unit tests do not need it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0047_canvas_reviews.sql src/lib/db/client-reviews.ts
git commit -m "feat(client-review): migration 0047 + DB module (D307)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Storage path + signed upload helper

**Files:**
- Modify: `src/lib/storage/paths.ts`, `src/lib/storage/paths.test.ts`, `src/lib/storage/index.ts`

**Interfaces:**
- Produces:
  - `pathForClientReviewCut(args: { clientId: string; canvasId: string; nodeId: string; ext: string }): string`
  - `clientReviewPrefix(args: { clientId: string; canvasId: string; nodeId: string }): string`
  - `signClientReviewUpload(args: { clientId: string; canvasId: string; nodeId: string; ext: string; contentType: string }): Promise<SignedUploadResult>`

- [ ] **Step 1: Write the failing test** — append to `src/lib/storage/paths.test.ts`:

```ts
import { pathForClientReviewCut, clientReviewPrefix } from "./paths";

describe("pathForClientReviewCut", () => {
  it("stores the cut under the node's client-review folder", () => {
    const p = pathForClientReviewCut({ clientId: "c", canvasId: "cv", nodeId: "n", ext: "mp4" });
    expect(p.startsWith("clients/c/canvases/cv/nodes/n/client-review/cut__")).toBe(true);
    expect(p.endsWith(".mp4")).toBe(true);
  });
  it("prefix is what the finalize route checks against", () => {
    const args = { clientId: "c", canvasId: "cv", nodeId: "n" };
    expect(pathForClientReviewCut({ ...args, ext: "mov" }).startsWith(clientReviewPrefix(args))).toBe(true);
  });
});
```
(If `describe`/`it`/`expect` are already imported at the top of the file, add only the new import line.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `pathForClientReviewCut` is not exported.

- [ ] **Step 3: Implement** — add to `src/lib/storage/paths.ts` after `pathForReviewAnnotation`:

```ts
export function clientReviewPrefix(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
}): string {
  return `clients/${args.clientId}/canvases/${args.canvasId}/nodes/${args.nodeId}/client-review/`;
}

// D307: the uploaded cut a client reviews. One per node; a new cut is a new node.
export function pathForClientReviewCut(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
}): string {
  const name = buildStoredName(undefined, { slug: "cut", ext: args.ext });
  return `${clientReviewPrefix(args)}${name}`;
}
```

Add to `src/lib/storage/index.ts` (import `pathForClientReviewCut` alongside the existing path imports):

```ts
// Authorize a direct browser → GCS upload of a Client review cut (up to 500 MB,
// far past Vercel's 4.5 MB body cap — the bytes never touch a function).
export async function signClientReviewUpload(args: {
  clientId: string;
  canvasId: string;
  nodeId: string;
  ext: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForClientReviewCut(args);
  return _sign(path, args.contentType);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/paths.ts src/lib/storage/paths.test.ts src/lib/storage/index.ts
git commit -m "feat(client-review): GCS path + signed upload for cuts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `withShareToken` + `buildPublicReview`

**Files:**
- Modify: `src/lib/api/route-helpers.ts`
- Create: `src/lib/api/route-helpers.share-token.test.ts`, `src/lib/client-review/load.ts`

**Interfaces:**
- Consumes: `getReviewByToken`, `listComments`, `ReviewByToken` (Task 2); `isWellFormedToken` (Task 1); `toReviewComment`, `PublicReview` (Task 1); `publicUrlFor` from `@/lib/storage`
- Produces:
  - `withShareToken(params: Promise<{ token: string }>, handler: (review: ReviewByToken) => Promise<AnyResponse>): Promise<AnyResponse>`
  - `buildPublicReview(review: ReviewByToken): Promise<PublicReview>` in `src/lib/client-review/load.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/api/route-helpers.share-token.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/client-reviews", () => ({ getReviewByToken: vi.fn() }));

import { getReviewByToken } from "@/lib/db/client-reviews";
import { withShareToken, apiOk } from "./route-helpers";

const TOKEN = "a".repeat(43);
const review = {
  id: "r1", canvas_id: "cv", node_id: "n", org_id: "o", video_path: "p",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Cut",
};

describe("withShareToken", () => {
  beforeEach(() => vi.resetAllMocks());

  it("404s a malformed token without touching the database", async () => {
    const res = await withShareToken(Promise.resolve({ token: "abc" }), async () => apiOk({}));
    expect(res.status).toBe(404);
    expect(vi.mocked(getReviewByToken)).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(null);
    const res = await withShareToken(Promise.resolve({ token: TOKEN }), async () => apiOk({}));
    expect(res.status).toBe(404);
  });

  it("hands the review to the handler", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const handler = vi.fn(async () => apiOk({ ok: true }));
    const res = await withShareToken(Promise.resolve({ token: TOKEN }), handler);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(review);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/api/route-helpers.share-token.test.ts`
Expected: FAIL — `withShareToken` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/api/route-helpers.ts`, add imports at the top:
```ts
import { getReviewByToken, type ReviewByToken } from "@/lib/db/client-reviews";
import { isWellFormedToken } from "@/lib/client-review/token";
```
and add this section after `withMoodboard`:
```ts
// ── Share-token resolution (D307) ─────────────────────────────────────────────

// The ONE unauthenticated entry point in the app: /api/r/[token]/* (exempted in
// src/proxy.ts). The token is the capability — no session, no org check, no
// impersonation gate (there is no operator here). Unknown → 404, like every other
// resolver; a malformed token never reaches the database.
export async function withShareToken(
  params: Promise<{ token: string }>,
  handler: (review: ReviewByToken) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { token } = await params;
  if (!isWellFormedToken(token)) return apiError("Review not found.", 404);
  const review = await getReviewByToken(token);
  if (!review) return apiError("Review not found.", 404);
  return handler(review);
}
```

`src/lib/client-review/load.ts`:
```ts
import "server-only";
import { listComments, type ReviewByToken } from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { toReviewComment, type PublicReview } from "./wire";

// Shared by the public page (first, server-rendered load) and GET /api/r/[token].
export async function buildPublicReview(review: ReviewByToken): Promise<PublicReview> {
  const rows = await listComments(review.id);
  return {
    title: review.title,
    videoUrl: publicUrlFor(review.video_path),
    comments: rows.map(toReviewComment),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/api/route-helpers.share-token.test.ts`
Expected: PASS. Then run the existing route tests that import route-helpers to confirm nothing broke: `npx vitest run src/app/api/clients`. Expected: PASS. (If an existing test fails because it doesn't mock `@/lib/db/client-reviews`, that's the new import pulling in `server-only` Supabase code — fix by adding `vi.mock("@/lib/db/client-reviews", () => ({ getReviewByToken: vi.fn() }))` to that test, not by changing the helper.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/route-helpers.ts src/lib/api/route-helpers.share-token.test.ts src/lib/client-review/load.ts
git commit -m "feat(client-review): withShareToken — the single token-scoped entry point

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Proxy exemption + header hidden on `/r/*`

**Files:**
- Modify: `src/proxy.ts`, `src/app/layout.tsx`
- Create: `src/proxy.test.ts`, `src/components/layout/app-header.tsx`

**Interfaces:**
- Consumes: `isPublicReviewPath` (Task 1)
- Produces: `AppHeader({ className }: { className?: string })`

- [ ] **Step 1: Write the failing test**

`src/proxy.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/get-user-with-retry", () => ({ getUserWithRetry: vi.fn() }));

import { config } from "./proxy";

// The matcher is a regex source; a path the regex does NOT match skips the session check.
const runsProxy = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("proxy matcher (D307)", () => {
  it("skips the session check for the public review page and API", () => {
    expect(runsProxy("/r/abc")).toBe(false);
    expect(runsProxy("/api/r/abc")).toBe(false);
    expect(runsProxy("/api/r/abc/comments/c1")).toBe(false);
  });
  it("still gates everything else, including look-alike paths", () => {
    expect(runsProxy("/review")).toBe(true);
    expect(runsProxy("/api/review/inbox")).toBe(true);
    expect(runsProxy("/clients/x")).toBe(true);
    expect(runsProxy("/api/nodes/n/client-review")).toBe(true);
  });
  it("keeps the existing exemptions", () => {
    expect(runsProxy("/login")).toBe(false);
    expect(runsProxy("/api/webhooks/trigger")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL on the first `it` (`/r/abc` currently runs the proxy).

- [ ] **Step 3: Implement**

In `src/proxy.ts`, replace the `config` block's comment and matcher:
```ts
// Run on everything EXCEPT: /login, webhooks (server-to-server, no session), the
// public client review page + API (/r/*, /api/r/* — D307, token-scoped via
// withShareToken), Next internals, and static assets.
//
// mp4/webm are in the exclusion list for the Help chapter clips in public/help-videos.
// Without them every clip request runs the session check — an auth round-trip per file
// to serve a static asset — and the browser's range requests for video multiply that.
export const config = {
  matcher: [
    "/((?!login|api/webhooks|r/|api/r/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|mp4|webm)$).*)",
  ],
};
```

`src/components/layout/app-header.tsx`:
```tsx
"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isPublicReviewPath } from "@/lib/client-review/paths";
import { HeaderBrand } from "./header-brand";
import { HeaderActions } from "./header-actions";

// The app chrome, minus the public client review page (D307): a client has no session,
// so the inbox/profile would 401, and the page must read as the studio's deliverable.
export function AppHeader({ className }: { className?: string }) {
  const pathname = usePathname();
  if (isPublicReviewPath(pathname)) return null;

  return (
    <header
      className={cn(
        "sticky z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md",
        className,
      )}
    >
      <HeaderBrand />
      <HeaderActions />
    </header>
  );
}
```

In `src/app/layout.tsx`: replace the `HeaderBrand`/`HeaderActions` imports with `import { AppHeader } from "@/components/layout/app-header";`, drop the now-unused `cn` import if nothing else uses it, and replace the whole `<header …>…</header>` element with:
```tsx
        <AppHeader className={headerTopClass(isImpersonating)} />
```

- [ ] **Step 4: Run to verify**

Run: `npx vitest run src/proxy.test.ts src/lib/client-review/paths.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/proxy.test.ts src/components/layout/app-header.tsx src/app/layout.tsx
git commit -m "feat(client-review): exempt /r and /api/r from the session proxy; hide app chrome there

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Public API routes (GET, POST comment, PATCH comment)

**Files:**
- Create: `src/app/api/r/[token]/route.ts` (+ `route.test.ts`), `src/app/api/r/[token]/comments/route.ts` (+ `route.test.ts`), `src/app/api/r/[token]/comments/[commentId]/route.ts` (+ `route.test.ts`)

**Interfaces:**
- Consumes: `withShareToken`, `apiOk`, `apiError`, `withTryCatch`; `buildPublicReview`; `parseNewComment`, `parseCommentEdit`; `insertComment`, `updateComment`; `toReviewComment`
- Produces (HTTP):
  - `GET /api/r/[token]` → 200 `PublicReview`
  - `POST /api/r/[token]/comments` body `{ authorName, body, timecodeMs }` → 201 `{ comment: ReviewComment }`; 400 `{ error }`
  - `PATCH /api/r/[token]/comments/[commentId]` body `{ editorName, body }` → 200 `{ comment: ReviewComment }`; 400; 404

All three test files share this mock preamble (repeat it in each — the files are read independently):
```ts
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/storage", () => ({ publicUrlFor: (p: string) => `https://cdn/${p}` }));
vi.mock("@/lib/db/client-reviews", () => ({
  getReviewByToken: vi.fn(),
  listComments: vi.fn(),
  insertComment: vi.fn(),
  updateComment: vi.fn(),
}));
```
and these fixtures:
```ts
const TOKEN = "a".repeat(43);
const review = {
  id: "r1", canvas_id: "cv-secret", node_id: "n-secret", org_id: "org-secret",
  video_path: "clients/c/canvases/cv/nodes/n/client-review/cut.mp4",
  share_token: TOKEN, created_by: "u", created_at: "t", title: "Dosa film",
};
const commentRow = {
  id: "c1", review_id: "r1", author_name: "Priya", body: "Logo too small",
  timecode_ms: 4000, edited_by_name: null, created_at: "t1", updated_at: "t1",
};
```

- [ ] **Step 1: Write the failing tests**

`src/app/api/r/[token]/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// <mock preamble here>
import { getReviewByToken, listComments } from "@/lib/db/client-reviews";
// <fixtures here>

describe("GET /api/r/[token]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns title, video URL and comments — and no internal ids", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(listComments).mockResolvedValue([commentRow]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/r/${TOKEN}`), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Dosa film");
    expect(body.videoUrl).toBe(`https://cdn/${review.video_path}`);
    expect(body.comments).toHaveLength(1);
    const raw = JSON.stringify(body);
    for (const secret of ["org-secret", "cv-secret", "n-secret", "r1"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/r/${TOKEN}`), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(res.status).toBe(404);
  });
});
```

`src/app/api/r/[token]/comments/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// <mock preamble here>
import { getReviewByToken, insertComment } from "@/lib/db/client-reviews";
// <fixtures here>

function post(body: unknown) {
  return new NextRequest(`http://localhost/api/r/${TOKEN}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ token: TOKEN });

describe("POST /api/r/[token]/comments", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stores the comment against the token's review and returns 201", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(insertComment).mockResolvedValue(commentRow);
    const { POST } = await import("./route");
    const res = await POST(post({ authorName: " Priya ", body: "Logo too small", timecodeMs: 4000 }), { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(insertComment)).toHaveBeenCalledWith({
      reviewId: "r1", authorName: "Priya", body: "Logo too small", timecodeMs: 4000,
    });
    expect((await res.json()).comment.authorName).toBe("Priya");
  });

  it("400s a whitespace-only comment without inserting", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const { POST } = await import("./route");
    const res = await POST(post({ authorName: "Priya", body: "   ", timecodeMs: 0 }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(insertComment)).not.toHaveBeenCalled();
  });

  it("404s an unknown token", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(post({ authorName: "P", body: "x", timecodeMs: 0 }), { params });
    expect(res.status).toBe(404);
  });
});
```

`src/app/api/r/[token]/comments/[commentId]/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// <mock preamble here>
import { getReviewByToken, updateComment } from "@/lib/db/client-reviews";
// <fixtures here>

function patch(body: unknown) {
  return new NextRequest(`http://localhost/api/r/${TOKEN}/comments/c1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ token: TOKEN, commentId: "c1" });

describe("PATCH /api/r/[token]/comments/[commentId]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("edits the body only and records who edited", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(updateComment).mockResolvedValue({ ...commentRow, body: "Warmer", edited_by_name: "Arjun" });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "Warmer", timecodeMs: 1, authorName: "X" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateComment)).toHaveBeenCalledWith({
      reviewId: "r1", commentId: "c1", body: "Warmer", editedByName: "Arjun",
    });
    expect((await res.json()).comment.editedByName).toBe("Arjun");
  });

  it("404s a comment that belongs to a different review", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    vi.mocked(updateComment).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "Warmer" }), { params });
    expect(res.status).toBe(404);
  });

  it("400s clearing a comment to empty", async () => {
    vi.mocked(getReviewByToken).mockResolvedValue(review);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Arjun", body: "  " }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(updateComment)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/api/r`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement**

`src/app/api/r/[token]/route.ts`:
```ts
import { apiOk, withShareToken, withTryCatch } from "@/lib/api/route-helpers";
import { buildPublicReview } from "@/lib/client-review/load";

// GET /api/r/:token — public (D307). Used to refresh the list after a post or edit;
// the first load is server-rendered by src/app/r/[token]/page.tsx.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withTryCatch("Could not load the review.", () =>
    withShareToken(params, async (review) => apiOk(await buildPublicReview(review))),
  );
}
```

`src/app/api/r/[token]/comments/route.ts`:
```ts
import { apiError, apiOk, withShareToken, withTryCatch } from "@/lib/api/route-helpers";
import { parseNewComment } from "@/lib/client-review/validate";
import { toReviewComment } from "@/lib/client-review/wire";
import { insertComment } from "@/lib/db/client-reviews";

// POST /api/r/:token/comments — public (D307). Add one comment at a paused frame.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  return withTryCatch("Could not post the comment.", () =>
    withShareToken(params, async (review) => {
      const parsed = parseNewComment(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const row = await insertComment({ reviewId: review.id, ...parsed.value });
      return apiOk({ comment: toReviewComment(row) }, 201);
    }),
  );
}
```

`src/app/api/r/[token]/comments/[commentId]/route.ts`:
```ts
import { apiError, apiOk, withShareToken, withTryCatch } from "@/lib/api/route-helpers";
import { parseCommentEdit } from "@/lib/client-review/validate";
import { toReviewComment } from "@/lib/client-review/wire";
import { updateComment } from "@/lib/db/client-reviews";

// PATCH /api/r/:token/comments/:commentId — public (D307). Anyone with the link may
// edit any comment's TEXT; the moment and original author are never editable.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string; commentId: string }> },
) {
  const { commentId } = await params;
  return withTryCatch("Could not save the edit.", () =>
    withShareToken(params, async (review) => {
      const parsed = parseCommentEdit(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const row = await updateComment({
        reviewId: review.id,
        commentId,
        body: parsed.value.body,
        editedByName: parsed.value.editorName,
      });
      if (!row) return apiError("Comment not found.", 404);
      return apiOk({ comment: toReviewComment(row) });
    }),
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/app/api/r`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/r"
git commit -m "feat(client-review): public GET/POST/PATCH routes behind withShareToken

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Team routes (sign upload, finalize, read)

**Files:**
- Create: `src/app/api/nodes/[id]/client-review/sign/route.ts` (+ `route.test.ts`), `src/app/api/nodes/[id]/client-review/route.ts` (+ `route.test.ts`)

**Interfaces:**
- Consumes: `withNode`; `cutExtension`, `CUT_MAX_BYTES`; `signClientReviewUpload`, `publicUrlFor`; `clientReviewPrefix`; `getReviewByNodeId`, `createReview`, `ReviewExistsError`, `listComments`; `generateShareToken`; `sharePathFor`; `toReviewComment`, `NodeClientReview`
- Produces (HTTP, session-gated):
  - `POST /api/nodes/[id]/client-review/sign` body `{ filename, contentType, size }` → 200 `{ signedUrl, path, url }`; 400 bad type/size; 409 node already has a cut
  - `GET /api/nodes/[id]/client-review` → 200 `NodeClientReview` (`review: null` when no cut yet)
  - `POST /api/nodes/[id]/client-review` body `{ path, filename }` → 201 `NodeClientReview`; 400 path outside the node; 409 already has a cut

Both test files share this preamble (repeat it in each):
```ts
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "user-1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
// withNode reads the node + org chain through the service-role client.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "n1", canvas_id: "cv1", type: "client-review", position: { x: 0, y: 0 },
              data: {}, active_version_id: null, created_at: "t", updated_at: "t",
              canvases: { client_id: "c1", clients: { org_id: "org-1" } },
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/storage", () => ({
  publicUrlFor: (p: string) => `https://cdn/${p}`,
  signClientReviewUpload: vi.fn(async () => ({ signedUrl: "https://signed", path: "p", url: "https://cdn/p" })),
}));
vi.mock("@/lib/db/client-reviews", async () => {
  class ReviewExistsError extends Error {}
  return {
    ReviewExistsError,
    getReviewByNodeId: vi.fn(),
    createReview: vi.fn(),
    listComments: vi.fn(async () => []),
  };
});
const params = Promise.resolve({ id: "n1" });
```

- [ ] **Step 1: Write the failing tests**

`src/app/api/nodes/[id]/client-review/sign/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// <preamble here>
import { getReviewByNodeId } from "@/lib/db/client-reviews";
import { signClientReviewUpload } from "@/lib/storage";

function sign(body: unknown) {
  return new NextRequest("http://localhost/api/nodes/n1/client-review/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/nodes/[id]/client-review/sign", () => {
  beforeEach(() => vi.mocked(getReviewByNodeId).mockReset());

  it("signs an mp4 under the node's client-review folder", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "Final.MP4", contentType: "video/mp4", size: 1000 }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(signClientReviewUpload)).toHaveBeenCalledWith({
      clientId: "c1", canvasId: "cv1", nodeId: "n1", ext: "mp4", contentType: "video/mp4",
    });
  });

  it("400s a non-video file", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.png", contentType: "image/png", size: 10 }), { params });
    expect(res.status).toBe(400);
  });

  it("400s a file over 500 MB", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.mp4", contentType: "video/mp4", size: 524_288_001 }), { params });
    expect(res.status).toBe(400);
  });

  it("409s when the node already has a cut", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue({ id: "r1" } as never);
    const { POST } = await import("./route");
    const res = await POST(sign({ filename: "a.mp4", contentType: "video/mp4", size: 10 }), { params });
    expect(res.status).toBe(409);
  });
});
```

`src/app/api/nodes/[id]/client-review/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
// <preamble here>
import { getReviewByNodeId, createReview, listComments, ReviewExistsError } from "@/lib/db/client-reviews";

const PREFIX = "clients/c1/canvases/cv1/nodes/n1/client-review/";

function finalize(body: unknown) {
  return new NextRequest("http://localhost/api/nodes/n1/client-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/nodes/[id]/client-review", () => {
  beforeEach(() => {
    vi.mocked(getReviewByNodeId).mockReset();
    vi.mocked(createReview).mockReset();
    vi.mocked(listComments).mockResolvedValue([]);
  });

  it("GET returns review:null before a cut is uploaded", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/nodes/n1/client-review"), { params });
    expect(await res.json()).toEqual({ review: null, comments: [] });
  });

  it("GET returns the video URL and share path once a cut exists", async () => {
    vi.mocked(getReviewByNodeId).mockResolvedValue({
      id: "r1", video_path: `${PREFIX}cut.mp4`, share_token: "tok",
    } as never);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/nodes/n1/client-review"), { params });
    const body = await res.json();
    expect(body.review).toEqual({ videoUrl: `https://cdn/${PREFIX}cut.mp4`, sharePath: "/r/tok" });
  });

  it("POST creates the review with a fresh token for a path inside the node", async () => {
    vi.mocked(createReview).mockImplementation(async (input) => ({
      id: "r1", canvas_id: input.canvasId, node_id: input.nodeId, org_id: "org-1",
      video_path: input.videoPath, share_token: input.shareToken, created_by: input.createdBy, created_at: "t",
    }));
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}cut.mp4`, filename: "cut.mp4" }), { params });
    expect(res.status).toBe(201);
    const input = vi.mocked(createReview).mock.calls[0][0];
    expect(input).toMatchObject({ canvasId: "cv1", nodeId: "n1", videoPath: `${PREFIX}cut.mp4`, createdBy: "user-1" });
    expect(input.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await res.json()).review.sharePath).toBe(`/r/${input.shareToken}`);
  });

  it("POST 400s a path outside this node", async () => {
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: "clients/c1/canvases/cv1/nodes/OTHER/client-review/x.mp4", filename: "x.mp4" }), { params });
    expect(res.status).toBe(400);
    expect(vi.mocked(createReview)).not.toHaveBeenCalled();
  });

  it("POST 409s when the node already has a cut", async () => {
    vi.mocked(createReview).mockRejectedValue(new ReviewExistsError());
    const { POST } = await import("./route");
    const res = await POST(finalize({ path: `${PREFIX}cut.mp4`, filename: "cut.mp4" }), { params });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run "src/app/api/nodes/[id]/client-review"`
Expected: FAIL — route modules not found.

- [ ] **Step 3: Implement**

`src/app/api/nodes/[id]/client-review/sign/route.ts`:
```ts
import { apiError, apiOk, withNode, withTryCatch, validateFileSize } from "@/lib/api/route-helpers";
import { CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { cutExtension } from "@/lib/client-review/validate";
import { getReviewByNodeId } from "@/lib/db/client-reviews";
import { signClientReviewUpload } from "@/lib/storage";

// POST /api/nodes/:id/client-review/sign — authorize a direct browser → GCS upload of
// the node's cut (D307). One cut per node: a node that already has one gets 409.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not authorize upload.", () =>
    withNode(req, params, async (nodeId, node, _caller, clientId) => {
      const body = (await req.json().catch(() => null)) as {
        filename?: string;
        contentType?: string;
        size?: number;
      } | null;
      if (!body?.filename || typeof body.size !== "number") {
        return apiError("filename and size are required.", 400);
      }
      const ext = cutExtension(body.filename);
      if (!ext) {
        return apiError(`Upload a video: ${[...CUT_EXTENSIONS].map((e) => `.${e}`).join(", ")}.`, 400);
      }
      const sizeError = validateFileSize(body.size, 0, CUT_MAX_BYTES, "500 MB");
      if (sizeError) return sizeError;
      if (await getReviewByNodeId(nodeId)) {
        return apiError("This node already has a cut. Add a new Client review node for a new cut.", 409);
      }
      const signed = await signClientReviewUpload({
        clientId,
        canvasId: node.canvas_id,
        nodeId,
        ext,
        contentType: body.contentType || `video/${ext === "mov" ? "quicktime" : ext}`,
      });
      return apiOk(signed);
    }),
  );
}
```

`src/app/api/nodes/[id]/client-review/route.ts`:
```ts
import { apiError, apiOk, withNode, withTryCatch } from "@/lib/api/route-helpers";
import { sharePathFor } from "@/lib/client-review/paths";
import { generateShareToken } from "@/lib/client-review/token";
import { cutExtension } from "@/lib/client-review/validate";
import { toReviewComment, type CanvasReviewRow, type NodeClientReview } from "@/lib/client-review/wire";
import { createReview, getReviewByNodeId, listComments, ReviewExistsError } from "@/lib/db/client-reviews";
import { publicUrlFor } from "@/lib/storage";
import { clientReviewPrefix } from "@/lib/storage/paths";

async function payload(review: CanvasReviewRow | null): Promise<NodeClientReview> {
  if (!review) return { review: null, comments: [] };
  const rows = await listComments(review.id);
  return {
    review: { videoUrl: publicUrlFor(review.video_path), sharePath: sharePathFor(review.share_token) },
    comments: rows.map(toReviewComment),
  };
}

// GET /api/nodes/:id/client-review — the node's cut, share path and comments (team view).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not load the review.", () =>
    withNode(req, params, async (nodeId) => apiOk(await payload(await getReviewByNodeId(nodeId)))),
  );
}

// POST /api/nodes/:id/client-review — finalize an upload: record the cut and mint the
// share token, so the link exists as soon as the video does.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withTryCatch("Could not save the cut.", () =>
    withNode(req, params, async (nodeId, node, caller, clientId) => {
      const body = (await req.json().catch(() => null)) as { path?: string; filename?: string } | null;
      if (!body?.path || !body.filename || !cutExtension(body.filename)) {
        return apiError("path and a video filename are required.", 400);
      }
      // A client could otherwise finalize with an arbitrary path and point the
      // public link at someone else's object.
      const prefix = clientReviewPrefix({ clientId, canvasId: node.canvas_id, nodeId });
      if (!body.path.startsWith(prefix)) {
        return apiError("Upload path does not belong to this node.", 400);
      }
      try {
        const review = await createReview({
          canvasId: node.canvas_id,
          nodeId,
          videoPath: body.path,
          shareToken: generateShareToken(),
          createdBy: caller.userId,
        });
        return apiOk(await payload(review), 201);
      } catch (e) {
        if (e instanceof ReviewExistsError) return apiError(e.message, 409);
        throw e;
      }
    }),
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run "src/app/api/nodes/[id]/client-review"`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/client-review"
git commit -m "feat(client-review): team routes — sign upload, finalize, read

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reviewer name storage + pre-paint script

**Files:**
- Create: `src/lib/client-review/reviewer-name.ts`, `src/lib/client-review/reviewer-name.test.ts`

**Interfaces:**
- Consumes: `REVIEWER_NAME_KEY`, `REVIEWER_NAME_MAX`
- Produces:
  - `type NameStore = Pick<Storage, "getItem" | "setItem" | "removeItem">`
  - `browserStore(): NameStore | null`
  - `readReviewerName(store: NameStore | null): string | null`
  - `saveReviewerName(store: NameStore | null, name: string): string | null` (returns the trimmed name, or null if empty/too long; never throws)
  - `clearReviewerName(store: NameStore | null): void`
  - `PREPAINT_SCRIPT: string` — sets `data-reviewer="known"` on its parent element

- [ ] **Step 1: Write the failing test**

`src/lib/client-review/reviewer-name.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  readReviewerName, saveReviewerName, clearReviewerName, PREPAINT_SCRIPT, type NameStore,
} from "./reviewer-name";

function memoryStore(initial: Record<string, string> = {}): NameStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}
const throwingStore: NameStore = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceeded"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("reviewer name storage", () => {
  it("round-trips a trimmed name", () => {
    const s = memoryStore();
    expect(saveReviewerName(s, "  Priya ")).toBe("Priya");
    expect(readReviewerName(s)).toBe("Priya");
  });
  it("treats a whitespace-only stored value as no name", () => {
    expect(readReviewerName(memoryStore({ reviewer_name: "   " }))).toBeNull();
  });
  it("refuses empty and over-long names", () => {
    const s = memoryStore();
    expect(saveReviewerName(s, "  ")).toBeNull();
    expect(saveReviewerName(s, "a".repeat(61))).toBeNull();
    expect(s.data).toEqual({});
  });
  it("never throws when storage is blocked; the name still works for the visit", () => {
    expect(readReviewerName(throwingStore)).toBeNull();
    expect(saveReviewerName(throwingStore, "Priya")).toBe("Priya");
    expect(() => clearReviewerName(throwingStore)).not.toThrow();
    expect(readReviewerName(null)).toBeNull();
  });
  it("clears the name", () => {
    const s = memoryStore({ reviewer_name: "Priya" });
    clearReviewerName(s);
    expect(readReviewerName(s)).toBeNull();
  });
});

describe("PREPAINT_SCRIPT", () => {
  function run(store: unknown) {
    const parent = { dataset: {} as Record<string, string> };
    const doc = { currentScript: { parentElement: parent } };
    new Function("localStorage", "document", PREPAINT_SCRIPT)(store, doc);
    return parent.dataset.reviewer;
  }
  it("marks a returning reviewer as known before paint", () => {
    expect(run(memoryStore({ reviewer_name: "Priya" }))).toBe("known");
  });
  it("leaves new and whitespace-only reviewers alone", () => {
    expect(run(memoryStore())).toBeUndefined();
    expect(run(memoryStore({ reviewer_name: "  " }))).toBeUndefined();
  });
  it("swallows blocked storage", () => {
    expect(() => run(throwingStore)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/client-review/reviewer-name.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/client-review/reviewer-name.ts`:
```ts
import { REVIEWER_NAME_KEY, REVIEWER_NAME_MAX } from "./constants";

// The client's typed name, kept in localStorage so a returning reviewer isn't asked
// again (spec §4). Every access is guarded: private modes and some in-app webviews
// throw on storage. Pure + injectable so it is testable in the node test env.

export type NameStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserStore(): NameStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readReviewerName(store: NameStore | null): string | null {
  try {
    const value = store?.getItem(REVIEWER_NAME_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

// Returns the name to use for this visit even when it can't be persisted.
export function saveReviewerName(store: NameStore | null, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > REVIEWER_NAME_MAX) return null;
  try {
    store?.setItem(REVIEWER_NAME_KEY, trimmed);
  } catch {
    // Not persisted — the prompt returns next visit (spec §6).
  }
  return trimmed;
}

export function clearReviewerName(store: NameStore | null): void {
  try {
    store?.removeItem(REVIEWER_NAME_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Runs inline, before first paint (the next-themes pattern), so a returning reviewer
// never sees the name screen flash. It marks its PARENT (the page wrapper), not <html>,
// which belongs to the shared root layout. Must stay dependency-free: it is a string.
export const PREPAINT_SCRIPT = `try{var n=localStorage.getItem(${JSON.stringify(
  REVIEWER_NAME_KEY,
)});if(n&&n.trim())document.currentScript.parentElement.dataset.reviewer="known"}catch(e){}`;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/client-review/reviewer-name.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client-review/reviewer-name.ts src/lib/client-review/reviewer-name.test.ts
git commit -m "feat(client-review): safe reviewer-name storage + pre-paint script

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The public client page

**Files:**
- Create: `src/app/r/[token]/page.tsx`, `src/app/r/[token]/not-found.tsx`, `src/components/client-review/review-api.ts`, `client-review-page.tsx`, `name-gate.tsx`, `review-video.tsx`, `comment-composer.tsx`, `comment-list.tsx`, `comment-item.tsx`

**Interfaces:**
- Consumes: `getReviewByToken` (Task 2), `isWellFormedToken` (Task 1), `buildPublicReview` (Task 4), `PublicReview`, `ReviewComment` (Task 1), `toTimecodeMs` (Task 1), `browserStore`/`readReviewerName`/`saveReviewerName`/`clearReviewerName`/`PREPAINT_SCRIPT` (Task 8), `formatTimecode` from `@/components/review-annotations/annotation-list`, `REVIEWER_NAME_MAX`, `COMMENT_BODY_MAX`
- Produces (used by Task 10):
  - `CommentList({ comments, onSeek, onEdit? }: { comments: ReviewComment[]; onSeek: (ms: number) => void; onEdit?: (id: string, body: string) => Promise<void> })` — read-only when `onEdit` is omitted
  - `ReviewVideo` with `ref: Ref<HTMLVideoElement>` and props `{ src: string; className?: string }`

UI has no unit tests (Vitest runs in node, no DOM). The gate is typecheck, lint, and the manual run in Step 6.

- [ ] **Step 1: Read the Next.js 16 docs this task touches**

Read in `node_modules/next/dist/docs/`: the dynamic route `params` (Promise) page, `not-found` file convention, and the `metadata` API (`robots`, `referrer`). Note any deviation from the code below and follow the docs.

- [ ] **Step 2: Server page + not-found**

`src/app/r/[token]/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReviewByToken } from "@/lib/db/client-reviews";
import { isWellFormedToken } from "@/lib/client-review/token";
import { buildPublicReview } from "@/lib/client-review/load";
import { ClientReviewPage } from "@/components/client-review/client-review-page";

// D307: the public client review page. Server-rendered with the review already loaded,
// so the first paint has the video and comments — no client fetch on first load.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review — Yuvabe Studios",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = isWellFormedToken(token) ? await getReviewByToken(token) : null;
  if (!review) notFound();
  const initial = await buildPublicReview(review);
  return <ClientReviewPage token={token} initial={initial} />;
}
```

`src/app/r/[token]/not-found.tsx`:
```tsx
// A truncated or dead link should feel like a closed door, not an error.
export default function ReviewNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-3 px-6">
      <p className="text-eyebrow text-muted-foreground">Yuvabe Studios</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">This review link is no longer active</h1>
      <p className="text-sm text-muted-foreground">Ask your contact for a new one.</p>
    </main>
  );
}
```

- [ ] **Step 3: Browser fetchers**

`src/components/client-review/review-api.ts`:
```ts
import type { PublicReview, ReviewComment } from "@/lib/client-review/wire";

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body;
}

export async function fetchReview(token: string): Promise<PublicReview> {
  return json<PublicReview>(await fetch(`/api/r/${token}`, { cache: "no-store" }), "Could not load the review.");
}

export async function postComment(
  token: string,
  input: { authorName: string; body: string; timecodeMs: number },
): Promise<ReviewComment> {
  const res = await fetch(`/api/r/${token}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ comment: ReviewComment }>(res, "Could not post the comment.")).comment;
}

export async function editComment(
  token: string,
  commentId: string,
  input: { editorName: string; body: string },
): Promise<ReviewComment> {
  const res = await fetch(`/api/r/${token}/comments/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ comment: ReviewComment }>(res, "Could not save the edit.")).comment;
}
```

- [ ] **Step 4: Components**

`src/components/client-review/name-gate.tsx`:
```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REVIEWER_NAME_MAX } from "@/lib/client-review/constants";

export function NameGate({ title, onSubmit }: { title: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const ready = name.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSubmit(name);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-muted-foreground">Yuvabe Studios</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title || "Your cut"}</h1>
        <p className="text-sm text-muted-foreground">Watch the cut and leave comments for the team.</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Your name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={REVIEWER_NAME_MAX}
          autoComplete="name"
          autoFocus
          className="h-11 text-base"
        />
      </label>
      <Button type="submit" size="lg" disabled={!ready} className="h-11">
        Start review
      </Button>
    </form>
  );
}
```

`src/components/client-review/review-video.tsx`:
```tsx
"use client";

import { useState, type Ref } from "react";
import { cn } from "@/lib/utils";

export function ReviewVideo({
  src,
  ref,
  className,
}: {
  src: string;
  ref?: Ref<HTMLVideoElement>;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={cn("flex aspect-video items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground", className)}>
        The video couldn&apos;t be loaded. Comments are still below.
      </div>
    );
  }
  // playsInline keeps iOS (and the WhatsApp webview) from forcing fullscreen,
  // which would hide the comment box the client is writing in.
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={cn("max-h-[50dvh] w-full rounded-xl bg-black object-contain lg:max-h-[80dvh]", className)}
    />
  );
}
```

`src/components/client-review/comment-item.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatTimecode } from "@/components/review-annotations/annotation-list";
import { COMMENT_BODY_MAX } from "@/lib/client-review/constants";
import type { ReviewComment } from "@/lib/client-review/wire";

export function CommentItem({
  comment,
  onSeek,
  onEdit,
}: {
  comment: ReviewComment;
  onSeek: (ms: number) => void;
  onEdit?: (id: string, body: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!onEdit || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onEdit(comment.id, draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the edit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="link"
          onClick={() => onSeek(comment.timecodeMs)}
          className="h-auto p-0 font-medium tabular-nums"
        >
          {formatTimecode(comment.timecodeMs)}
        </Button>
        <span className="font-medium">{comment.authorName}</span>
        {onEdit && !editing && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => { setDraft(comment.body); setEditing(true); }}
            className="ml-auto text-muted-foreground"
          >
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={COMMENT_BODY_MAX}
            autoFocus
            className="min-h-20 text-base"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !draft.trim()}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
      )}
      {comment.editedByName && !editing && (
        <p className="text-xs text-muted-foreground">edited by {comment.editedByName}</p>
      )}
    </li>
  );
}
```

`src/components/client-review/comment-list.tsx`:
```tsx
"use client";

import type { ReviewComment } from "@/lib/client-review/wire";
import { CommentItem } from "./comment-item";

// Shared by the public page (editable) and the canvas focus view (read-only).
export function CommentList({
  comments,
  onSeek,
  onEdit,
}: {
  comments: ReviewComment[];
  onSeek: (ms: number) => void;
  onEdit?: (id: string, body: string) => Promise<void>;
}) {
  if (comments.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No comments yet.</p>;
  }
  return (
    <ul className="flex flex-col">
      {comments.map((c) => (
        <CommentItem key={c.id} comment={c} onSeek={onSeek} onEdit={onEdit} />
      ))}
    </ul>
  );
}
```

`src/components/client-review/comment-composer.tsx`:
```tsx
"use client";

import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatTimecode } from "@/components/review-annotations/annotation-list";
import { COMMENT_BODY_MAX } from "@/lib/client-review/constants";
import { toTimecodeMs } from "@/lib/client-review/validate";

// Spec §4: the timestamp is the PAUSED frame. Focusing the box pauses the video; the
// chip follows the playhead while paused (scrubbing counts) and never drifts while
// typing, because typing never resumes playback. Post sends the paused position.
export function CommentComposer({
  videoRef,
  onPost,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  onPost: (body: string, timecodeMs: number) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [stampMs, setStampMs] = useState(0);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setStampMs(toTimecodeMs(video.currentTime));
    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [videoRef]);

  function pauseForWriting() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setStampMs(toTimecodeMs(video.currentTime));
  }

  async function post() {
    if (!body.trim() || posting) return; // posting guard: one comment per tap
    const video = videoRef.current;
    const at = video ? toTimecodeMs(video.currentTime) : stampMs;
    setPosting(true);
    setError(null);
    try {
      await onPost(body, at);
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
      <p className="text-eyebrow text-muted-foreground">at {formatTimecode(stampMs)}</p>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={pauseForWriting}
        maxLength={COMMENT_BODY_MAX}
        placeholder={`Comment at ${formatTimecode(stampMs)}`}
        className="min-h-16 text-base"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={post} disabled={posting || !body.trim()}>
          {posting ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}
```
(`text-base` on fields keeps iOS from zooming the page on focus — inputs under 16px trigger it.)

`src/components/client-review/client-review-page.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicReview } from "@/lib/client-review/wire";
import {
  PREPAINT_SCRIPT, browserStore, clearReviewerName, readReviewerName, saveReviewerName,
} from "@/lib/client-review/reviewer-name";
import { CommentComposer } from "./comment-composer";
import { CommentList } from "./comment-list";
import { NameGate } from "./name-gate";
import { ReviewVideo } from "./review-video";
import { editComment, fetchReview, postComment } from "./review-api";

export function ClientReviewPage({ token, initial }: { token: string; initial: PublicReview }) {
  const [review, setReview] = useState(initial);
  const [name, setName] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // The pre-paint script may already have set data-reviewer="known". Reading the name
  // here moves React's own value from "unknown" to "known", so a later "change" (back to
  // "unknown") is a real DOM update — the attribute can't get stuck on "known".
  useEffect(() => {
    setName(readReviewerName(browserStore()));
  }, []);

  const refresh = useCallback(async () => {
    setReview(await fetchReview(token));
  }, [token]);

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  async function handlePost(body: string, timecodeMs: number) {
    if (!name) return;
    await postComment(token, { authorName: name, body, timecodeMs });
    await refresh();
  }

  async function handleEdit(id: string, body: string) {
    if (!name) return;
    await editComment(token, id, { editorName: name, body });
    await refresh();
  }

  return (
    <div
      data-reviewer={name ? "known" : "unknown"}
      suppressHydrationWarning
      className="group/review flex min-h-dvh flex-col"
    >
      <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />

      <div className="group-data-[reviewer=known]/review:hidden">
        <NameGate title={review.title} onSubmit={(n) => setName(saveReviewerName(browserStore(), n))} />
      </div>

      <div className="hidden flex-1 flex-col group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-6xl lg:px-6 lg:py-6">
        <header className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-3 lg:px-0">
          <h1 className="font-display text-xl font-semibold tracking-tight lg:text-2xl">{review.title || "Your cut"}</h1>
          <p className="shrink-0 text-sm text-muted-foreground">
            {name}{" · "}
            <Button
              variant="link"
              onClick={() => { clearReviewerName(browserStore()); setName(null); }}
              className="h-auto p-0 text-sm"
            >
              change
            </Button>
          </p>
        </header>

        <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
          <div className="sticky top-0 z-10 bg-background px-4 pb-3 lg:static lg:px-0">
            <ReviewVideo ref={videoRef} src={review.videoUrl} />
          </div>
          <section className="flex flex-1 flex-col lg:max-h-[80dvh] lg:rounded-xl lg:border lg:border-border lg:shadow-card">
            <p className="text-eyebrow px-4 pt-3 text-muted-foreground">
              {review.comments.length} {review.comments.length === 1 ? "comment" : "comments"}
            </p>
            <div className="flex-1 overflow-y-auto px-4">
              <CommentList comments={review.comments} onSeek={seek} onEdit={handleEdit} />
            </div>
            <CommentComposer videoRef={videoRef} onPost={handlePost} />
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors in the new files. (If ESLint flags the inline `<script>`, keep it and add a one-line disable with the reason "pre-paint name check, D307" — the inline script is the point.)

- [ ] **Step 6: Manual run (requires the 0047 migration applied and Task 10 not yet needed)**

Seed one review by hand in the staging DB SQL editor, using an existing canvas + node and any mp4 already in the bucket:
```sql
insert into canvas_reviews (canvas_id, node_id, video_path, share_token, created_by)
values ('<canvas-id>', '<node-id>', '<existing mp4 object path>', 'testtokentesttokentesttokentesttokentesttok', '<your user id>');
```
Start the dev server (`npm run dev`) and, in a private window with no session:
1. Open `http://localhost:3000/r/testtokentesttokentesttokentesttokentesttok` → the name screen, **no CreativeOS header**.
2. Enter a name → the review screen with the video.
3. Play, pause at ~0:05, tap the comment box → chip reads `at 0:05`; type; wait 3s; chip still `0:05`; **Post** → comment appears with `0:05`.
4. Throttle the network to "Slow 3G" in devtools, type a comment, double-click **Post** → exactly one new comment.
5. Reload → straight to the video, no flash of the name screen.
6. Click **change** → name screen; enter a different name → **Edit** the first comment → it shows "edited by <new name>".
7. Open `/r/abc` → the "no longer active" page (HTTP 200 — the response streams before `notFound()`; the page is noindex. Ruling in the SDD ledger, Task 9).
8. Repeat 1–5 at a phone viewport (devtools device mode, 390px): video sticky at the top, composer pinned at the bottom.
Delete the seeded row afterwards.

- [ ] **Step 7: Commit**

```bash
git add "src/app/r" src/components/client-review
git commit -m "feat(client-review): mobile-first public review page with paused-frame comments

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The Client review node on the canvas

**Files:**
- Modify: `src/lib/canvas-nodes.ts`, `src/lib/canvas-node-options.ts`, `src/lib/canvas-node-options.test.ts`, `src/components/canvas/quick-add-menu.tsx`, `src/components/canvas/canvas.tsx`, `src/lib/nodes/describe-node.ts`
- Create: `src/components/nodes/use-node-client-review.ts`, `client-review-upload.tsx`, `client-review-node.tsx`, `client-review-focus-view.tsx`

**Interfaces:**
- Consumes: `NodeClientReview` (Task 1); `CommentList`, `ReviewVideo` (Task 9); `uploadViaSignedUrl` from `@/lib/uploads/client`; `useFlushAutosave` from `@/components/canvas/autosave-flush-context`; `useCanvasEditable` from `@/components/canvas/canvas-editable-context`; `CUT_EXTENSIONS`, `CUT_MAX_BYTES`
- Produces:
  - `type ClientReviewNodeData = { title?: string }`
  - `useNodeClientReview(nodeId: string): { data: NodeClientReview | null; loading: boolean; reload: () => Promise<void> }`

- [ ] **Step 1: Update the failing registry test**

In `src/lib/canvas-node-options.test.ts`, change the first test's name to `"has the 11 user-addable node types (kb, shot and multishot excluded)"` and add `"client-review",` to the expected array. In the mnemonic test (around line 46), add `expect(mnemonicToType("r")).toBe("client-review");`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/canvas-node-options.test.ts`
Expected: FAIL — `client-review` missing.

- [ ] **Step 3: Register the type**

`src/lib/canvas-node-options.ts`: add `| "client-review"` to `AddNodeType`, and append to `ADD_NODE_OPTIONS`:
```ts
  // "R" for Review. The cut a client comments on through a public link (D307).
  { type: "client-review", label: "Client review", mnemonic: "R" },
```

`src/lib/canvas-nodes.ts`: after `DrawNodeData` add
```ts
// D307: an uploaded cut shared with the client by link. The video, token and comments
// live in canvas_reviews / canvas_review_comments — only the title is node data.
export type ClientReviewNodeData = { title?: string };
```
add `| Node<ClientReviewNodeData, "client-review">` to the `AppNode` union, and `"client-review": [],` to `VALID_CONNECTIONS` (terminal — it feeds nothing).

`src/components/canvas/quick-add-menu.tsx`: import `MessageSquareText` from `lucide-react` and add `"client-review": MessageSquareText,` to `ICONS`.

`src/lib/nodes/describe-node.ts`: add `case "client-review": return "client review";` to the `describe` switch and `"client-review": "REV",` to `NODE_ABBREV`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/canvas-node-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Hook + upload chip**

`src/components/nodes/use-node-client-review.ts`:
```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { NodeClientReview } from "@/lib/client-review/wire";

// Fetch-on-mount (the canvas load) and on demand (focus view open/close) — spec §5.
export function useNodeClientReview(nodeId: string) {
  const [data, setData] = useState<NodeClientReview | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/client-review`, { cache: "no-store" });
      // 404 = the node row isn't saved yet (autosave lag) — show the empty state.
      setData(res.ok ? ((await res.json()) as NodeClientReview) : { review: null, comments: [] });
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}
```

`src/components/nodes/client-review-upload.tsx`:
```tsx
"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import type { NodeClientReview } from "@/lib/client-review/wire";

const ACCEPT = [...CUT_EXTENSIONS].map((e) => `.${e}`).join(",");

// Dashed primary chip (design-system "add" action) that also takes a dropped file.
export function ClientReviewUpload({
  nodeId,
  onUploaded,
}: {
  nodeId: string;
  onUploaded: (next: NodeClientReview) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const flushAutosave = useFlushAutosave();

  async function upload(file: File) {
    if (file.size > CUT_MAX_BYTES) {
      toast.error("The cut is over 500 MB. Export a smaller file.");
      return;
    }
    setUploading(true);
    try {
      // The node row must exist before /api/nodes/:id/* can find it (600ms autosave lag).
      await flushAutosave();
      const next = await uploadViaSignedUrl<NodeClientReview>(file, {
        signEndpoint: `/api/nodes/${nodeId}/client-review/sign`,
        finalizeEndpoint: `/api/nodes/${nodeId}/client-review`,
      });
      onUploaded(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  }

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} className="nodrag">
      <Button
        variant="ghost"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full gap-1.5 border border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
      >
        <Upload className="size-4" strokeWidth={1.5} />
        {uploading ? "Uploading…" : "Upload edited cut"}
      </Button>
      <Input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Focus view**

`src/components/nodes/client-review-focus-view.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CommentList } from "@/components/client-review/comment-list";
import { ReviewVideo } from "@/components/client-review/review-video";
import type { NodeClientReview } from "@/lib/client-review/wire";
import { EditableField } from "./editable-field";
import { ClientReviewUpload } from "./client-review-upload";

export function ClientReviewFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  data,
  onTitle,
  onReload,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  data: NodeClientReview | null;
  onTitle: (title: string) => void;
  onReload: () => Promise<void>;
  onUploaded: (next: NodeClientReview) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Fresh comments every time the operator opens the review (spec §5).
  useEffect(() => {
    if (open) void onReload();
  }, [open, onReload]);

  const review = data?.review ?? null;
  const comments = data?.comments ?? [];

  function seek(ms: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = ms / 1000;
    video.pause();
  }

  // window is read on click, never during render — canvas nodes are also server-rendered.
  async function copyLink() {
    if (!review) return;
    await navigator.clipboard.writeText(`${window.location.origin}${review.sharePath}`);
    toast.success("Link copied");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                <EditableField
                  value={title}
                  onCommit={onTitle}
                  placeholder="Untitled cut"
                  className="font-display text-3xl font-semibold tracking-tight"
                />
              </SheetTitle>
              {review && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" onClick={copyLink}>
                    <Copy className="size-4" strokeWidth={1.5} /> Copy link
                  </Button>
                  <Button
                    variant="outline"
                    render={<a href={review.sharePath} target="_blank" rel="noopener noreferrer" />}
                  >
                    <ExternalLink className="size-4" strokeWidth={1.5} /> Open as client
                  </Button>
                </div>
              )}
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {review ? (
            <div className="mx-auto grid h-full w-full max-w-6xl grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 px-6 py-4">
              <section className="flex min-h-0 flex-col">
                <p className="text-eyebrow text-muted-foreground">
                  Comments · {comments.length}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <CommentList comments={comments} onSeek={seek} />
                </div>
              </section>
              <ReviewVideo ref={videoRef} src={review.videoUrl} />
            </div>
          ) : (
            <div className="mx-auto flex h-full max-w-sm flex-col justify-center gap-3 px-6">
              <p className="text-sm text-muted-foreground">
                Upload the edited cut. You&apos;ll get a link to send the client.
              </p>
              <ClientReviewUpload nodeId={nodeId} onUploaded={onUploaded} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
(Before using `render={<a …/>}` on `Button`, check how `add-connection.tsx:55` composes `render` and match it.)

- [ ] **Step 7: Node card + register in React Flow**

`src/components/nodes/client-review-node.tsx`:
```tsx
"use client";

import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useDeleteNode } from "@/hooks/use-delete-node";
import { useFocusViewRegistration } from "@/hooks/use-focus-view-open";
import type { ClientReviewNodeData } from "@/lib/canvas-nodes";
import { ClientReviewFocusView } from "./client-review-focus-view";
import { ClientReviewUpload } from "./client-review-upload";
import { NodeCardHeader } from "./node-card-header";
import { NodeContextMenu } from "./node-context-menu";
import { useNodeClientReview } from "./use-node-client-review";

// D307: terminal node (no handles) — the cut a client reviews by public link.
export function ClientReviewNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useDeleteNode();
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const focusedNodeId = useCanvasStore((s) => s.focusedNodeId);
  const setFocusedNodeId = useCanvasStore((s) => s.setFocusedNodeId);
  const d = data as ClientReviewNodeData;
  const [focusOpen, setFocusOpen] = useState(false);
  const { data: review, reload } = useNodeClientReview(id);
  const [override, setOverride] = useState<typeof review>(null);
  const current = override ?? review;

  const focusViewOpen = focusOpen || focusedNodeId === id;
  const handleFocusOpenChange = (next: boolean) => {
    setFocusOpen(next);
    if (!next && focusedNodeId === id) setFocusedNodeId(null);
    if (!next) void reload().then(() => setOverride(null)); // count refresh on close
  };
  useFocusViewRegistration(id, focusViewOpen);

  const count = current?.comments.length ?? 0;
  const hasCut = !!current?.review;

  return (
    <>
      <NodeContextMenu onDuplicate={() => duplicateNode(id)} onDelete={() => deleteNode(id)}>
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setFocusOpen(true);
          }}
          className={cn(
            "group w-56 rounded-lg border border-border bg-card shadow-card",
            "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]",
            selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          )}
        >
          <NodeCardHeader
            icon={MessageSquareText}
            nodeId={id}
            nodeType="client-review"
            title={d.title ?? ""}
            placeholder="Untitled cut"
            onCommitTitle={(t) => updateNodeData(id, { title: t })}
          />
          {hasCut && current?.review && (
            <div className="overflow-hidden border-b border-border bg-black">
              <video
                src={`${current.review.videoUrl}#t=0.1`}
                preload="metadata"
                muted
                playsInline
                className="h-32 w-full object-contain"
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            {hasCut ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {count} {count === 1 ? "comment" : "comments"}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setFocusOpen(true)}
                  className="nodrag -mx-1.5 h-auto gap-1 rounded-md border-0 px-1.5 py-1 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                >
                  Open ↗
                </Button>
              </>
            ) : (
              <ClientReviewUpload nodeId={id} onUploaded={setOverride} />
            )}
          </div>
        </div>
      </NodeContextMenu>

      {/* Outside NodeContextMenu — same reason as draw-node.tsx: the portaled sheet's
          events would otherwise bubble into the node card. */}
      <ClientReviewFocusView
        open={focusViewOpen}
        onOpenChange={handleFocusOpenChange}
        nodeId={id}
        title={d.title ?? ""}
        data={current}
        onTitle={(t) => updateNodeData(id, { title: t })}
        onReload={reload}
        onUploaded={setOverride}
      />
    </>
  );
}
```
(The `<video>` poster is not an interactive control — it has no `controls` — so it is not covered by the shadcn-only rule.)

`src/components/canvas/canvas.tsx`: add `import { ClientReviewNode } from "@/components/nodes/client-review-node";` with the other node imports and `"client-review": ClientReviewNode,` to `nodeTypes`.

**Read-only sessions (D33):** `ClientReviewUpload` must not upload when the canvas is locked. Add `import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";`, call `const editable = useCanvasEditable();` alongside the other hooks at the top of `ClientReviewUpload`, and `if (!editable) return null;` after all hooks.

- [ ] **Step 8: Typecheck, lint, full tests**

Run: `npx tsc --noEmit`, then `npm run lint`, then `npm test`
Expected: all pass (re-run a lone Kling timeout once before investigating).

- [ ] **Step 9: Manual run (requires migration 0047)**

`npm run dev`, signed in, on a canvas:
1. Press `/` (or the quick-add trigger) → **Client review** (`R`) appears; add one → card with the dashed **Upload edited cut** chip.
2. Upload an mp4 straight after adding the node (within a second) → it succeeds (autosave flushed); the card shows the poster and "0 comments".
3. Double-click → focus view: title editable, **Copy link**, **Open as client**; the comments column says "No comments yet."
4. **Open as client** in a private window, enter a name, post two comments at different moments.
5. Close and reopen the focus view → both comments listed; clicking a timecode seeks the video. Close it → the card reads "2 comments".
6. Rename the node title → reload the client page → the new title shows.
7. Try uploading a .png → toast "Upload a video: .mp4, .mov, .webm."
8. Duplicate the node → the duplicate shows the empty upload state (a new cut is a new node).
9. Delete the node → the client link shows "no longer active".
10. Phone check: open the link from WhatsApp (send it to yourself) on iOS and Android — video plays inline, the composer stays above the keyboard, the name is remembered on reopen.

- [ ] **Step 10: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-node-options.ts src/lib/canvas-node-options.test.ts src/components/canvas/quick-add-menu.tsx src/components/canvas/canvas.tsx src/lib/nodes/describe-node.ts src/components/nodes/use-node-client-review.ts src/components/nodes/client-review-upload.tsx src/components/nodes/client-review-node.tsx src/components/nodes/client-review-focus-view.tsx
git commit -m "feat(client-review): Client review node — upload a cut, copy the link, read comments

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Close out

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (D307 status), `docs/superpowers/specs/2026-09-30-client-review-share-design.md` (status line)

- [ ] **Step 1: Mark D307 recorded**

In the roadmap, change the D307 heading suffix from `*(recorded 2026-10-01; draft, pending spec approval)*` to `*(recorded 2026-10-01)*`. In the spec, change `**Status:** draft for review` to `**Status:** implemented on feat/client-review-share`.

- [ ] **Step 2: Final verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all green. Paste the summary lines into the hand-off message.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs
git commit -m "docs(client-review): D307 recorded; spec implemented

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Hand off with: migration 0047 must be applied to each environment's DB before deploy; GCS objects for deleted nodes are not cleaned up (non-goal); the moodboard gallery is step 2.
