# Design: Market Signals V1 — moodboards, extended

**Date:** 2026-08-27
**Status:** Approved shape, pre-plan. Decisions recorded as **D184–D189** in the ADR log
(`2026-05-30-creativeos-staging-roadmap.md` §7).
**PRD:** `2026-08-27-market-signals-v1-prd.md` (the *what/why*). Supersedes the
2026-08-17 Market Signals PRD — scopes/resolver/kinds/validity/review-queue and the
generation-injection Mode A are all **out** of V1 (they return, reshaped, in V1.x/V2).
**Branch:** `worktree-market-signals` (worktree `.claude/worktrees/market-signals`, based
on `origin/main` @ 33dd8fc).

---

## 0. The one-line architecture

**Market Signals V1 is an extension of the moodboards system, not a parallel one** (D184).
The evidence layer *is* moodboards — two system boards per client plus richer items. The
signal layer is a thin link-set over those items. Every surface (Market page, canvas
gallery drawer, browser extension) renders the same rows through the same components.

What this avoids: a `market_references` table that is 90% `moodboard_items`, a second
tile renderer, a second capture extension, and a second RLS/org-scoping story — the exact
divergence AGENTS.md's reusability rules warn about.

---

## 1. Data model (migration `0034_market_signals.sql`)

> Migration numbering note: next free number is 0034. (0027 is already used twice —
> `brand_kit` and `impersonation` — so filenames, not numbers, are the identity.)

### 1.1 `moodboards` — board types (D186)

```sql
alter table moodboards
  add column board_type text not null default 'custom'
    check (board_type in ('custom', 'direct', 'adjacent'));
```

* Every client gets **one `direct` and one `adjacent` board**, auto-provisioned (created
  lazily on first Market read/write for existing clients; on client creation for new
  ones). Not renameable, not deletable in the UI.
* All existing boards keep working, untouched, as `custom`.
* Partial unique index so a client can't get duplicate system boards:
  `create unique index moodboards_client_system_board_uq on moodboards(client_id, board_type) where board_type <> 'custom';`

### 1.2 `moodboard_items` — richer references (D185, D186)

```sql
alter table moodboard_items
  add column kind          text not null default 'image'
    check (kind in ('image', 'gif', 'video', 'youtube', 'instagram', 'tiktok', 'link')),
  add column note          text,
  add column added_by      uuid references auth.users(id) on delete set null,
  add column thumbnail_url text;
```

* `image_url` keeps its role for image-kind items and stays the field the existing
  drawer/masonry reads — **no rename**, no backfill needed (default `'image'` is correct
  for every existing row).
* `thumbnail_url` is the GCS-re-hosted preview for video/link kinds (see §2). For images
  it stays null; the tile falls back to `image_url`.
* `added_by` nullable + `set null` on user deletion — matches D181 (work survives,
  unattributed).
* `note` is MR's only voice — shown clamped on the tile, full in the lightbox.

### 1.3 `signals` + `signal_items` — link-set, not container (D187)

```sql
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

create index signals_client_id_idx      on signals(client_id);
create index signal_items_item_id_idx   on signal_items(item_id);
```

* A signal **links** evidence; the reference stays in its bucket and can back many
  signals. Deleting a reference cascades it out of every signal (the card visibly thins).
  A signal whose last reference is deleted **survives as an empty card** — the
  interpretation still has value; deleting it is a human act.
* Why not "signal = moodboard with extra fields": items belong to exactly one board, and
  co-membership (in Direct *and* in a signal) is the load-bearing behaviour. Bending
  moodboards to many-to-many refactors a working system to avoid two small tables.
* Default-deny RLS on both new tables, same rationale as 0026: app access goes through
  the service-role client; zero policies closes the anon-key REST path.

---

## 2. Reference ingest — accept anything, watchable on open (D185)

One server-side module, `src/lib/market/ingest.ts` (name at build time), used by every
add path:

1. **Classify the URL** → `kind`. Host/path patterns: `youtube.com|youtu.be` →
   `youtube`; `instagram.com/(p|reel|tv)/` → `instagram`; `tiktok.com` → `tiktok`;
   content-type / extension `image|gif|mp4…` → `image|gif|video`; anything else → `link`.
2. **Fetch a thumbnail**, best-effort:
   * YouTube: derived directly (`img.youtube.com/vi/{id}/hqdefault.jpg`) — no API.
   * Instagram / TikTok: **oEmbed** `thumbnail_url`. Both endpoints are tokenless as of
     2026 (Meta re-opened tokenless oEmbed for single public posts/reels on 2026-06-15;
     TikTok's oEmbed is public). Verified 2026-08-27; primary sources:
     developers.facebook.com/docs/instagram-platform/oembed,
     developers.tiktok.com/doc/embed-videos.
   * The fetched thumbnail is **re-hosted to GCS at add time** and stored in
     `thumbnail_url`. This is the deliberate, bounded exception to the D13/D92 URL-only
     rule: a thumbnail is small, and it is what lets a board survive a deleted post (the
     moodboard-clipper F6 lesson).
3. **Never reject.** oEmbed down, private account, dead link, weird site → save anyway
   with `kind` best-guessed (or `link`) and no thumbnail. The tile degrades to
   favicon + domain + note, opening the source in a new tab. Capture never fails; the
   shelf is a research surface, not a gallery.

**Playback (the "watchable" contract):** thumbnails in the grid; the **lightbox plays**:
* `youtube` → YouTube iframe embed
* `instagram` / `tiktok` → the platform's embed markup (oEmbed HTML / blockquote +
  script), mounted only when the lightbox opens — never in the grid, so a 40-tile board
  costs 40 cached images, not 40 live embeds
* `video` / `gif` / `image` → native `<video>` / `<img>`
* `link` → open source in new tab

We do **not** download platform video (rejected in D185: ToS exposure + breaks D13/D92
wholesale + downloader maintenance).

---

## 3. Surfaces (D189)

### 3.1 Market page — `/clients/[id]/market` (new, primary)

The SEE + DISTILL surface. Thin shell over shared components; reuses the focus-view
shell/heading conventions and the existing gallery primitives (masonry, lightbox).

* Tabs: **Direct | Adjacent | Signals** (shadcn Tabs).
* Direct/Adjacent: full-width masonry of reference tiles (thumbnail, kind badge, clamped
  note); add-URL form (Input + bucket Select + note Textarea — shadcn only, InputGroup
  where composed); multi-select mode; lightbox with player.
* **Group as Signal:** selection (may span both bucket tabs) → dialog: name, tags,
  description → saves signal + links. Open to **every designer** (D188 — no seniority
  gate, no new role).
* Signals tab: cards (name · tags · description · linked-ref thumbnails · created_by).
  Card opens as its own grid — same tile renderer + lightbox — with description on top.
* Client nav gains its second destination: **KB | Market**
  (`/clients/[id]/page.tsx` currently hard-redirects to `/kb`; the redirect stays, nav
  links appear in the client shell).

### 3.2 Canvas gallery drawer — inherits, small refactor

* Direct/Adjacent are `moodboards` rows → they appear in the drawer's existing Moodboards
  tab **automatically**.
* The drawer's tile path is `<img>`-only today; it must render the **same tile
  component** the Market page uses (thumbnail/kind/note, lightbox player) — a refactor of
  `gallery-masonry.tsx`/preview, not a fork. The drawer's add-URL affordance
  (`gallery-add-url.tsx`) gains the note field.
* **Signals stay page-only in V1.** Flow D mid-canvas is a human reading a signal; a
  second tab does that. In-canvas signal browsing is V1.x surface work (it will be
  reshaped by AI ideation anyway).

### 3.3 Browser extension — `moodboard-extension/` (existing, upgraded)

MR's primary capture path (PRD Flow A):

* Today: right-click an **image** (`info.srcUrl`) → picker → POST. Direct/Adjacent boards
  show up in its picker automatically (they're boards).
* Add: a page-level context-menu entry — "Add this page as reference" — sending
  `info.pageUrl` into the same ingest path (§2), which classifies reel/YouTube/TikTok
  URLs correctly. Add a note field to the side panel.
* Known pre-existing issue (from project memory): the extension's configured app URL
  still points at localhost; fix rides along.

---

## 4. Roles and permissions (D188)

* **No new role.** MR team members get ordinary accounts (`org_role = 'designer'`). V1
  gives MR responsibilities but no exclusive powers, so there is nothing for an `mr` role
  to protect. The `org_role` check constraint stays closed at three values.
* **Signal creation is open to every designer** (owner/senior/designer alike).
* Measurement need ("does MR maintain the shelf?") is covered by `added_by`, not a role
  bit.
* The moment V1.x/V2 introduces an MR-exclusive surface (review queue), widening the
  constraint is a one-line migration made with a real requirement in hand.

---

## 5. API shape

Follows `docs/api-routes.md` (`apiError`/`apiOk`, `withClient` under
`/api/clients/[id]/`, `withTryCatch` for multi-step handlers):

* `GET  /api/clients/[id]/market` — boards (auto-provisioning direct/adjacent) + items +
  signals, one round-trip for the page.
* `POST /api/clients/[id]/market/references` — { url, bucket, note? } → ingest (§2) →
  item. (The extension's existing `POST /api/moodboards/[id]/items` route stays and gains
  the same ingest + note.)
* `POST /api/clients/[id]/market/signals` — { name, tags, description, itemIds } →
  signal + links.
* `PATCH/DELETE` on signal; `DELETE` on reference (cascades out of signals).

Exact handler split is plan-time detail; the rule is: **ingest logic lives in
`src/lib/market/`, routes stay thin.**

---

## 6. What V1 explicitly does not build

* No AI anywhere (assist arrives V1.1+).
* No generation injection — `compilePrompt` / `resolve-inputs.ts` are untouched. The
  2026-08-17 PRD's Mode A returns at V1.2/V1.3 with a designer in the loop.
* No scopes/resolver (global/category), no validity windows/expiry, no `kind` taxonomy of
  signals, no review queue, no `mr` role, no per-agency RBAC.
* No downloading of platform video; no scraping.
* No in-canvas signal browsing.

---

## 7. Build order (and drop order)

1. Migration 0034 + db helpers + ingest module (URL classify, oEmbed thumbnail, GCS
   re-host) — with tests (TDD; oEmbed fetchers mocked).
2. Market API routes.
3. Reference tile + lightbox player components (shared); Market page Direct/Adjacent tabs
   with add form + multi-select.
4. Signals: create dialog, Signals tab, signal detail.
5. Drawer refactor to shared tile (drawer inherits boards for free).
6. Extension: page-clip menu item + note field + URL config fix.
7. Client nav (KB | Market).

Drop order under time pressure: 6 → 5 (drawer keeps images-only rendering for a while) —
never 1–4; without them there is no experiment.

Verification baseline: suite green at branch point (1386/1387; the 1 is the known Kling
cold-cache flake, passes warm).

---

## 8. Open questions (visible, not silently decided)

1. **File upload as a capture fallback** (screen-recorded Story, saved image with no
   public URL). `uploadNodeFile` exists so the path is cheap, but it's another control on
   the add form. Decide at build time with MR's actual first week of use — not blocking.
2. **Instagram embeds in the lightbox require Meta's `embed.js`** on the page; if CSP or
   the script's behaviour inside the app proves hostile, the fallback for `instagram`
   kind is thumbnail + "open on Instagram" (still capture-safe; watchability degrades for
   that provider only). TikTok same posture. YouTube (plain iframe) carries no such risk.
3. **Tokenless oEmbed rate limits** are not published precisely ("may differ" from the
   1,000/hr token tier). If MR's clip volume ever hits limits, the token-based tier is
   the unchanged escape hatch (needs a Meta app + token, no App Review for oEmbed read).
