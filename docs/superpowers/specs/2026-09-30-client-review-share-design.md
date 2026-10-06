# Client review share — design

**Status:** implemented on feat/client-review-share · **Date:** 2026-10-01 · **Branch:** `feat/client-review-share`
**ADR:** D307 (staging roadmap §7) · **Migration:** `0047_canvas_reviews.sql`

## 1. Intent

An operator uploads an edited, stitched cut onto a canvas and sends the client a **public link**.
The client — no account, no login — opens it on their phone, enters their name once, watches the
cut, and leaves comments stamped with the moment they're about. The comments show up on the canvas
node that holds the cut.

This is deliberately the smallest useful version: **upload a video, add comments.** It is
independent of the Post-node client-approval share and of the internal approval / annotation
system (`node_versions`, `node_version_annotations`).

### What the operator said vs. what this spec assumes

Said:
- Upload a video; comments can be added. Nothing more in this version.
- The client page is **mobile-first**.
- The review is a **node on the canvas**.
- When the link opens, it asks for the reviewer's **name first**; the name is stored in
  `localStorage` so it is not asked again.
- Everyone with the link sees everyone's comments.
- A new cut is a new node.
- Comments can be **edited by anyone** with the link (an edit records who made it).
- When a client **pauses and writes**, the paused timestamp is attached to the comment.

Assumed — strike at review if wrong:
- Comments **cannot be deleted** — only edited. Clearing a comment's text is not allowed.
- Focusing the comment box **pauses the video** for them, so the stamp can't drift while typing.
- Only the client comments; the team **reads** comments on the canvas.

### Success criteria

1. The operator uploads a cut into a Client review node and copies its link.
2. On a phone, a client opens the link, enters a name, and posts a comment at a moment in the cut.
3. Reopening the link on that phone goes straight to the video — no name prompt.
4. A second reviewer on the same link sees the first reviewer's comments and can edit them; the
   edited comment shows *"edited by {name}"*.
5. The canvas node shows the comment count, and its focus view lists the comments; tapping one
   seeks the video to that moment.

### Non-goals

Painting / frame annotation · deleting comments · replies · team comments · approve /
request-changes verdict · live updates · revoking or regenerating links · link expiry · replacing
the video inside a node · the moodboard gallery (step 2).

## 2. Data model — migration `0047_canvas_reviews.sql`

```sql
canvas_reviews (
  id           uuid pk default gen_random_uuid(),
  canvas_id    uuid not null references canvases(id) on delete cascade,
  node_id      uuid not null unique references nodes(id) on delete cascade,
  org_id       uuid not null,                  -- set by trigger from canvas → client → org
  video_path   text not null,                  -- GCS object path
  share_token  text not null unique,           -- 32 random bytes, base64url
  created_by   uuid not null,
  created_at   timestamptz not null default now()
)

canvas_review_comments (
  id           uuid pk default gen_random_uuid(),
  review_id    uuid not null references canvas_reviews(id) on delete cascade,
  author_name  text not null,                  -- 1–60 chars
  body         text not null,                  -- 1–2,000 chars
  timecode_ms     int  not null,
  edited_by_name  text,                        -- set on edit; null until then
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
)
```

- **RLS** default-deny on both; all access through the service-role client in server code (D44).
  No anon policy (D86 stands).
- **Video** at `clients/{c}/canvases/{cv}/nodes/{n}/client-review/cut-<ts>.mp4`, served by its
  public GCS URL (D46). The path builder goes in `src/lib/storage/paths.ts`.
- **Limits** live in `src/lib/client-review/constants.ts`: name 60, body 2,000.
- **Token stored plainly** so the node can always offer *Copy link* — the same capability-URL
  trade-off D46 accepts for GCS objects. Deleting the node kills the link.

## 3. Public access boundary (D307)

- `src/proxy.ts` matcher exempts `r/` and `api/r/`, next to `api/webhooks`. **The only
  unauthenticated surface in the app.**
- `withShareToken(token, handler)` in `src/lib/api/route-helpers.ts`, beside `withCanvas`: unknown
  token → `apiError` 404.
- Public routes:

| Route | Purpose |
|---|---|
| `GET /api/r/[token]` | `{ title, videoUrl, comments[] }` — **no org, client, canvas or node ids** |
| `POST /api/r/[token]/comments` | `{ authorName, body, timecodeMs }` → the new comment |
| `PATCH /api/r/[token]/comments/[commentId]` | `{ editorName, body }` → the updated comment; sets `edited_by_name`, `updated_at` |

- `PATCH` checks `comment.review_id === review.id`, so one token cannot edit another review's
  comments. Only `body` is editable — never the timecode or the original author.

- The page sends `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
- **"No internal ids" means response fields.** The public JSON never carries org, client, canvas or node ids as fields. The `videoUrl` is a public GCS URL whose path contains those UUIDs, like every other asset URL in the app (D46 capability URLs); they grant nothing without a session.
- **No app chrome on `/r/*`.** `src/app/layout.tsx` renders the CreativeOS header (brand, help,
  review inbox, profile) on every route; the inbox and profile call session-only APIs, which would
  401 for a client. The header moves into a small client component, `AppHeader`, that renders
  nothing when the path starts with `/r/` (the same `usePathname` check `HeaderActions` already
  uses for `/login`). `resolveImpersonationState` is safe for anonymous visitors (it uses
  `resolveCallerContextOrNull`), so the layout itself needs no other change.

## 4. Client page — `src/app/r/[token]/page.tsx` (mobile-first)

**Name screen** — shown when `localStorage` has no `reviewer_name`:

```
┌─────────────────────────┐
│ Yuvabe Studios          │
│ Dosa brand film         │
│ Watch the cut and leave │
│ comments for the team.  │
│ Your name               │
│ [ Priya              ]  │
│ [     Start review    ] │
└─────────────────────────┘
```

**Review screen:**

```
┌─────────────────────────┐
│ Dosa brand film         │
│ Priya · change          │
├─────────────────────────┤
│     ▶ video (sticky)    │
├─────────────────────────┤
│ 5 comments              │
│ 0:04 Priya              │
│ Logo feels too small    │
│ 0:07 Arjun              │
│ Warmer grade here       │
├─────────────────────────┤
│ [ Comment at 0:07     ] │  ← pinned to the bottom
│               [ Post ]  │
└─────────────────────────┘
```

- The video is sticky at the top; comments scroll beneath, oldest first.
- The composer is pinned to the bottom. **The timestamp is the paused frame:** focusing the
  composer pauses the video, and the comment is stamped with that paused position — so a client
  who pauses on a moment and writes about it gets exactly that moment attached. A chip above the
  input shows it (*"at 0:07"*). If they scrub while the video is paused, the chip follows, because
  the frame on screen is what they're commenting on. Typing never resumes playback, so the stamp
  cannot drift while they write; **Post** sends the paused position.
- Tapping a comment's timecode seeks the video there.
- **Edit:** each comment has an *Edit* action (anyone's comment). It turns the comment into an
  inline `Textarea` with **Save** / **Cancel**; saving shows *"edited by {name}"* under the body.
- *change* clears `reviewer_name` and shows the name screen.
- First load arrives server-rendered with comments; after a post the list refetches from
  `GET /api/r/[token]`. No polling.
- **Name storage:** one site-wide key, `reviewer_name`, so a second cut doesn't ask again. Every
  read/write is wrapped in `try/catch`.
- **No flash, decided on the client before paint:** the page is server-rendered with the review
  already loaded (the server component resolves the token and reads title, video URL and comments
  directly — no client fetch on first load). Both the name screen and the review screen are in the
  HTML. A tiny inline `<script>` (the `next-themes` pattern), placed immediately after the page's
  wrapper element opens, reads `reviewer_name` before first paint and sets
  `data-reviewer="known"` on that wrapper — not on `<html>`, which belongs to the shared root
  layout. The wrapper carries `suppressHydrationWarning`, scoping the workaround to this page. CSS
  hides whichever screen doesn't apply. React then takes over with the same answer, so returning reviewers see the video
  on the very first frame. If storage throws, the script leaves the attribute unset and the name
  screen shows.
- **In-app browsers:** links shared on WhatsApp / Instagram / Gmail open in the app's own webview,
  with storage separate from Safari/Chrome; a reviewer who switches browsers is asked their name
  again. Accepted. Names are labels, not identity.
- **Desktop (≥ `lg`)**: two columns, video left, comments + composer right.
- Visual: Yuvabe system — Clash Display title, neutral surface, purple only on **Start review** and
  **Post**. Controls are shadcn primitives only (`Input`, `Textarea`, `Button`, `InputGroup`).

## 5. The Client review node (canvas side)

- New node type `client-review`, registered with the existing node registry.
- **Empty state:** dashed primary chip **Upload edited cut**, which also accepts a dropped file.
- **Upload:** browser → signed PUT URL (existing `_signPutUrl` flow) → GCS; then the server creates
  the `canvas_reviews` row with a fresh token.
- **On the node:** poster, inline-editable title, and **"5 comments"**.
- **Focus view** (copies the video-gen focus-view shell): the video on the right; the comment list
  in the middle (read-only for the team; shows *"edited by"*), where tapping a timecode seeks the video; **Copy link** and
  **Open as client** at the top.
- Team routes (session-gated, `withNode`): `GET /api/nodes/[id]/client-review` (review + comments),
  `POST /api/nodes/[id]/client-review` (create after upload), `POST .../client-review/sign`.
- **Title lives in the node's own data** (`data.title`, autosaved like every node title); the
  public `GET` reads it from the node row. No title column, no title route.
- The count refreshes when the canvas loads and when the focus view opens.

## 6. Failure cases

| Case | Behaviour |
|---|---|
| Unknown token / node deleted | Friendly page: *"This review link is no longer active — ask your contact for a new one."* (HTTP 200 — the page streams before the lookup; it is noindex) |
| Post fails | The text stays in the composer with an inline error and **Post** re-enabled |
| Two people edit the same comment | Last write wins; *"edited by"* shows who changed it last |
| Edit to empty text | **Save** disabled; deleting by emptying is not possible |
| Empty name or comment | **Start review** / **Post** disabled until there is text |
| `localStorage` unavailable (private mode) | The name lives in memory for the visit; the prompt returns next time |
| Video fails to load | Standard error state; comments remain readable |

## 7. Testing

- **Unit:** payload validation (lengths, required fields, non-negative timecode); token generation
  is 32 bytes base64url.
- **Route:** unknown token → 404; the public `GET` response contains no org, client, canvas or node
  ids; `POST` stores the comment against the token's review only; `PATCH` with token A on a comment
  from review B → 404; `PATCH` cannot change `timecode_ms` or `author_name`.
- **Proxy:** `/r/*` and `/api/r/*` load without a session; other paths stay gated.
- **Manual:** upload → copy link → open on a phone in a private window → enter name → post at a
  timecode → reopen (no name prompt) → the comment appears on the canvas node and in its focus view.
  Repeat with the link opened **inside WhatsApp's in-app browser** on iOS and Android: sticky video,
  bottom composer above the keyboard, and inline video playback all behave.

## 8. Step 2 (not designed here)

Sharing a gallery of moodboard concepts. Moodboards belong to a **client**, not a canvas
(`moodboards.client_id`), so step 2 must decide whether a whole board or hand-picked items are
shared.
