# Client review share — design

**Status:** draft for review · **Date:** 2026-09-30 · **Branch:** `feat/client-review-share`
**ADR:** D279 (recorded in the staging roadmap §7) · **Migration:** `0041_canvas_reviews.sql`

## 1. Intent

An operator uploads an edited, stitched cut onto a canvas and sends the client a **public link**.
The client — no account, no login — watches the cut, pauses on a frame, paints the area that
needs to change and writes a note, using the same annotation UX the video-gen node already has.
Everyone on the client side sees everyone's notes, and anyone can edit any note. The notes land
back on the canvas, on the node that holds the cut.

**Scope of this spec (step 1):** one uploaded video per node, shared by link, annotated by the
client. **Step 2** — sharing a gallery of moodboard concepts — gets its own spec.

### What the operator said vs. what this spec assumes

Said:
- Standalone design; not the Post-node client-approval share (`2026-08-03-post-client-approval-design.md`).
- The review lives **per canvas**, because the canvas is where the stitched clip is uploaded.
- A node on the canvas is the surface.
- Everyone with the link sees everyone's notes.
- Anyone can edit any note.
- It is stored as a review row under the canvas.
- A new cut is a new node (one node per cut).

Assumed — strike at review if wrong:
- The client types a name once; it is how their notes are attributed. No verification.
- **No verdict** (Approve / Request changes) in step 1 — notes only.
- **Team members can also add and edit notes** from the focus view, attributed by account name.
- Notes save individually on **Add**; there is no batched "Send feedback".

### Success criteria

1. Operator uploads a cut into a Client review node and copies a link in under a minute.
2. A client opens the link in a private window, gives a name, and adds a painted frame note and a
   general note — on desktop and on a phone.
3. A second reviewer on the same link sees the first reviewer's notes and can edit them.
4. The notes appear on the canvas node (badge count updates live) and in its focus view.
5. Revoking the link makes it dead immediately; the notes are kept.

### Non-goals (step 1)

Approve / Request-changes verdict · replacing the video inside a node (versioning) · threads /
replies on a note · timeline-range marks · reviewer identity or email · rate-limiting
infrastructure · link expiry dates · the moodboard gallery (step 2).

## 2. Data model — migration `0041_canvas_reviews.sql`

```sql
canvas_reviews (
  id           uuid pk default gen_random_uuid(),
  canvas_id    uuid not null references canvases(id) on delete cascade,
  node_id      uuid not null references nodes(id)    on delete cascade,  -- the Client review node
  org_id       uuid not null,                         -- set by trigger from canvas → client → org
  title        text not null default '',
  video_path   text not null,                         -- GCS object path
  share_token  text not null unique,                  -- 32 random bytes, base64url
  revoked_at   timestamptz,
  created_by   uuid not null,
  created_at   timestamptz not null default now()
)
-- one review per node: unique (node_id)

canvas_review_notes (
  id              uuid pk default gen_random_uuid(),
  review_id       uuid not null references canvas_reviews(id) on delete cascade,
  org_id          uuid not null,                      -- set by trigger from review
  seq             int  not null,                      -- display number; unique (review_id, seq)
  author_name     text not null,
  author_user_id  uuid,                               -- set only for team notes
  edited_by_name  text,
  note            text not null,
  timecode_ms     int,                                -- null → general note
  mask_path       text,                               -- null → general note
  bounds          jsonb,                              -- {x,y,w,h} as 0..1 fractions (D248)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                         -- soft delete
)
```

- **RLS:** default-deny on both tables. Server code uses the service-role client (D44).
  `canvas_review_notes` gets one org-isolation **SELECT** policy and joins the Realtime
  publication, mirroring `node_version_annotations` (0035), so the canvas can hear new notes.
  There is **no anon policy** — D86 stands.
- **Masks** reuse the review-annotation format and limits (`lib/review-annotations/constants.ts`:
  1 MB per mask) and are stored at
  `clients/{c}/canvases/{cv}/nodes/{n}/client-review/{reviewId}/notes/{noteId}-mask.png`.
- **Video** is stored at `clients/{c}/canvases/{cv}/nodes/{n}/client-review/{reviewId}/cut-<ts>.mp4`.
  Path builders go in `src/lib/storage/paths.ts` beside `pathForReviewAnnotation`.
- **Cap:** 200 live (non-deleted) notes per review.
- **Why the token is stored plainly:** the focus view must be able to show *Copy link* at any time.
  This is the same capability-URL trade-off D46 accepts for GCS objects; revoke and regenerate are
  the remedy for a leaked link.

**Rejected:** reusing `node_version_annotations`. Those rows hang off an approval decision, need a
`decided_by_user_id`, and exist only for `changes_requested` — forcing anonymous clients into that
shape would bend the internal approval model.

## 3. Public access boundary (D279)

- `src/proxy.ts` matcher exempts `r/` and `api/r/`, next to the existing `api/webhooks` exemption.
  **This is the only unauthenticated surface in the app.**
- `withShareToken(token, handler)` in `src/lib/api/route-helpers.ts`, beside `withCanvas`: loads the
  review by token; unknown or revoked → `apiError` 404 (never 403, matching the other helpers).
  Every public route is wrapped in it.
- Public routes:

| Route | Purpose |
|---|---|
| `GET /api/r/[token]` | `{ title, videoUrl, notes[] }` — **no org, client, canvas or node ids** |
| `POST /api/r/[token]/notes` | create a note (mask as base64 in the body) |
| `PATCH /api/r/[token]/notes/[noteId]` | edit a note's text; sets `edited_by_name` |
| `DELETE /api/r/[token]/notes/[noteId]` | soft delete |
| `GET /api/r/[token]/video` | same-origin, Range-capable stream of **this review's** `video_path` only |

- Note routes check `note.review_id === review.id`, so one token cannot touch another review's notes.
- Mask validation reuses `MAX_MASK_BYTES` (1 MB) from `lib/review-annotations/constants.ts`.
  One note carries at most one mask, so a request stays far under Vercel's 4.5 MB function body
  cap. `author_name` is trimmed, required, and capped at 60 characters; `note` is required and
  capped at 2,000 characters (new constants in `src/lib/client-review/constants.ts`).
- The page sends `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

**Why a dedicated video proxy:** painting a frame draws the paused `<video>` onto a `<canvas>`;
a cross-origin GCS video taints the canvas and the browser refuses to export it. D245 solves this
with `/api/image-proxy`, which is session-gated. The public page's proxy is locked to one object,
so the token can never be used to fetch arbitrary URLs.

## 4. The Client review node (canvas side)

- New node type `client-review`, registered with the existing node registry.
- **Empty state:** a dashed primary chip, **Upload edited cut**, which also accepts a dropped file.
- **Upload:** browser → signed PUT URL (existing `_signPutUrl` flow) → GCS; on completion the
  server creates the `canvas_reviews` row with a fresh token. The link exists as soon as the video
  does.
- **On the node:** video poster, inline-editable title, and a badge — *"4 client notes"*, or
  *"Link revoked"* in neutral grey.
- **Live badge:** the Realtime-ping-then-refetch pattern from `use-canvas-approval-sync.ts`.
- **Focus view:** copies the video-gen focus-view shell (rail, eyebrow headings, panel widths).
  - Rail: *Video · Notes (n) · Share*.
  - Middle: the shared notes panel (below).
  - Right: the video with `AnnotationOverlay`; clicking a note seeks to its frame.
  - Share panel: **Copy link**, **Open as client**, **Revoke**, **Regenerate link** (the last two
    keep the notes and kill only the old URL).
- Team routes (session-gated, `withNode`): `GET/POST /api/nodes/[id]/client-review`,
  note `PATCH/DELETE`, and `POST .../share` for revoke and regenerate.

## 5. The public page — `src/app/r/[token]/page.tsx`

- **Layout:** header (studio mark, cut title, *Reviewing as {name} · change*); video on the left;
  notes panel on the right. On a phone it stacks: video, then notes.
- **Name card** on first visit; the name is stored in `localStorage` (`reviewer_name`). *Change*
  lets a second person on the same device switch.
- **Annotate:** pause → **Annotate this frame** → paint (`ReviewAnnotationCanvas`) → pin
  (`AnnotationPin`) → popover (`AnnotationNotePopover`) → **Add**, which saves immediately.
- **General note:** a dashed primary chip, **+ General note**; saves with no timecode and no mask.
- **Edit and delete** inline on every note.
- **Freshness:** refetch on window focus and every 20 s while the page is visible. No Realtime —
  the client has no org, and an anon policy would reverse D86 for the whole table.
- **Visual:** Yuvabe system — Clash Display title, neutral surface, purple only on primary actions,
  the video as the hero. Controls are shadcn primitives only (`Input`, `Textarea`, `Button`,
  `InputGroup`).

### Shared view layer

The public page and the focus view render the same components: `ReviewNotesPanel` (list grouped
by timecode via `groupByTimecode`, inline edit/delete, general-note chip) and
`ReviewVideoStage` (player, annotate mode, overlay). Only the data source differs, through a small
`ReviewNotesSource` interface (`list`, `create`, `update`, `remove`) with a token implementation and
a node implementation. These live in `src/components/client-review/`.

## 6. Failure cases

| Case | Behaviour |
|---|---|
| Unknown or revoked token | Friendly page: *"This review link is no longer active — ask your contact for a new one."* (HTTP 404) |
| Save fails | Note stays open in the popover with **Retry**; text is never lost |
| Two people edit the same note | Last write wins; `updated_at` + "edited by" make it visible |
| 200-note cap reached | **Add** disabled with a one-line explanation |
| Video fails to load | Standard error state; notes remain readable |
| Node deleted | Cascade removes review and notes; the link 404s |

## 7. Testing

- **Unit:** token resolver; note payload validation; `note.review_id` ownership check; the cap;
  soft-delete excluded from lists and from the cap.
- **Route:** revoked token → 404; token A cannot `PATCH` a note in review B; the public `GET`
  response contains no org, client, canvas or node ids; the video proxy serves only `video_path`.
- **Proxy:** `/r/*` and `/api/r/*` load without a session; all other paths stay gated.
- **Manual:** upload → copy link → private window → annotate on desktop and on a phone → the note
  appears on the canvas node and in the focus view; revoke → the link dies, the notes remain.

## 8. Open for step 2 (not designed here)

Moodboards belong to a **client**, not a canvas (`moodboards.client_id`). Sharing a gallery from a
canvas needs a decision on whether the operator shares a whole board or picks items into the share.
