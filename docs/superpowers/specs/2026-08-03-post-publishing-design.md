# Post publishing — Instagram, Facebook, LinkedIn

**Date:** 2026-08-03
**Status:** Draft design — pending user review.
**Type:** Design spec (new subsystem). Introduces decisions **D113–D115** — numbers provisional,
see §10 and the numbering caution in the Post node spec.
**▸ Read the PRD first:** **[`2026-08-03-post-prd.md`](2026-08-03-post-prd.md)**. **The PRD owns what
and why; this spec owns how.** Where they disagree, the PRD is right and this file is stale.
**Implements:** PRD **§6.9** publishing (R9.1–R9.7), the publish row of **§6.10** permissions, and
the platform-approval constraint in **§8**.
**Paired specs:**
**[`2026-08-03-post-node-design.md`](2026-08-03-post-node-design.md)** — builds the artifact this one
distributes; ships the Publish button present and disabled (D106), which this spec turns on.
**[`2026-08-03-post-client-approval-design.md`](2026-08-03-post-client-approval-design.md)** — the
**hard gate**: nothing publishes without the client having approved that exact rendered image (D109).
Approval ships before publishing does.
**Builds on:** **D42/D44** (org tenancy; app-layer enforcement at chokepoints), **D88** (default-deny
RLS on every table), **D46** (public GCS capability URLs — load-bearing here, see §4), **D11** (the
human is the scheduler), **D26** (the generation/job substrate, whose shape the publish job reuses).

> **Sources.** Platform constraints in this spec were read from vendor documentation on 2026-08-03
> and are cited inline. They move; re-verify before implementation.

---

## 1. Problem & goal

A finished post currently leaves CreativeOS as a downloaded PNG that someone re-uploads by hand into
Instagram, Facebook, or LinkedIn. That hand-off loses the caption, loses the record of what was
posted where, and puts the last mile outside the tool that produced the asset.

**Goal.** Publish a Post node's rendered image, with its caption, to a client's connected social
accounts — and keep a record of what went out, when, and to which account.

## 2. The constraint that shapes the plan

Publishing is not primarily an engineering problem. It is an **approvals** problem, and the approvals
are slow:

- `instagram_content_publish` (posting to Instagram) and `pages_manage_posts` (posting to a Facebook
  Page) are **Advanced Access** permissions. Advanced Access is required whenever an app serves
  professional accounts it does not itself own, and it requires **App Review *and* Business
  Verification**. Reported turnaround is **2–6 weeks, with multiple submission rounds likely**.
- Until review clears, the app is in development mode, where **only accounts explicitly listed as
  test users** in the Meta app dashboard can connect. Real clients cannot be onboarded.
- LinkedIn requires a **verified app** with organizational permissions approved before
  `w_organization_social` will work, and the connecting user must be an **admin of the page**.

**Therefore the work is staged so the pilot is never blocked on a reviewer:**

| Stage | Contents | Blocked on approval? |
|---|---|---|
| **A — Assisted publish** | `social_connections` + `post_publications` tables, the publish dialog (account selection, the approved caption shown read-only, per-network length check), and a **"Copy caption · Download image"** hand-off that records the publication as `manual`. | **No.** Ships immediately. |
| **B — LinkedIn** | OAuth connect, image upload, `/rest/posts`, publication records. | LinkedIn app verification. |
| **C — Meta** | Instagram + Facebook Page OAuth, container-then-publish, quota checks. | Meta App Review + Business Verification. |

Stage A is not a placeholder. It is genuinely most of the value — the caption is composed, reviewed,
and recorded in one place — and it makes Stages B and C a swap of the transport underneath an
interface that already works. **Submit both app reviews on day one of Stage A**, so the calendar runs
in parallel with the build.

## 3. Scope

**In scope:** connecting a client's Instagram professional account, Facebook Page, and LinkedIn
organization page; composing a caption per network; publishing a single image post; recording the
result; surfacing failures in a way a human can act on.

**Out of scope (v1):** scheduling for later, carousels, video/Reels, Stories, comment or engagement
reading, analytics, cross-posting the same caption to all networks in one click, and per-network
image re-cropping. Each is additive and none changes the shape below.

## 4. Publish flow

**Instagram** is a two-step, container-then-publish flow: `POST /media` creates a media container
from an image URL and caption, then `POST /media_publish` publishes that container id. The media
**"must be hosted on a publicly accessible server"** — Instagram fetches it rather than accepting an
upload. Instagram professional accounts must be connected to a Facebook Page; if that Page requires
Page Publishing Authorization, publishing is blocked until PPA is completed. Publishing is capped at
**100 API-published posts per rolling 24 hours**, and the current count is readable from
`/content_publishing_limit`.

> **This is why D46 matters.** A Post node's `fileUrl` is already a public GCS URL, so it is directly
> publishable with no new hosting, no signed-URL dance, and no re-upload. If the pilot ever moves to
> signed access (the hardening D46 defers), Instagram publishing needs a public capability URL minted
> per publish — worth remembering before that change is made.

**LinkedIn** is a three-step flow in the other direction: `initializeUpload` on `/rest/images`
registers the upload, the bytes are PUT to the returned URL, and the resulting image **URN** is
referenced in a `/rest/posts` call. Scope `w_organization_social`; the connecting user must be an
admin of the target page. Because LinkedIn wants bytes, the server fetches the post's GCS object and
streams it — it does not proxy through the browser.

**Facebook Page** posting uses the Page access token obtained alongside the Instagram connection,
with `pages_manage_posts`.

**The publish call runs server-side, as a job.** It reuses the shape of the existing generation
substrate (D26): a row is written, work happens off the request, and the UI reads the row. Publishing
is slow, retryable, and fails in ways that must survive a closed tab — the same reasons image and
video generation are jobs. It does **not** join the `generations` table; publishing is not a
generation and must not pollute eval capture or credit metering.

## 5. Data model

```sql
-- One connected account per client per network.
create table social_connections (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id),          -- D42 tenant boundary
  client_id         uuid not null references clients(id) on delete cascade,
  network           text not null check (network in ('instagram','facebook','linkedin')),
  account_id        text not null,        -- IG user id / Page id / LinkedIn org URN
  account_name      text not null,        -- display only
  access_token_enc  bytea not null,       -- encrypted at rest; never leaves the server
  refresh_token_enc bytea,
  token_expires_at  timestamptz,
  scopes            text[] not null,
  connected_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, network)
);

-- One row per publish attempt, successful or not.
create table post_publications (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  node_id        uuid not null references nodes(id) on delete cascade,
  connection_id  uuid references social_connections(id) on delete set null,
  network        text not null,           -- includes 'manual' for the Stage A hand-off
  status         text not null,           -- queued | publishing | published | failed
  caption        text,
  image_url      text not null,           -- snapshot: what was actually sent
  remote_post_id text,
  remote_url     text,
  error          text,
  published_at   timestamptz,
  created_at     timestamptz not null default now()
);
```

**Both tables carry `org_id` and get default-deny RLS with an org-scoped policy** (D88), and every
route enforces org at the chokepoint (D44). `post_publications.image_url` is a **snapshot, not a
reference**: re-rendering the post later must not rewrite the record of what was published.

**Tokens never reach the browser.** They are encrypted at rest with an app-held key, decrypted only
inside the publish job, and no API route ever returns them — not even redacted. The connection list
returns `network`, `account_name`, `token_expires_at`, and a derived health state.

## 6. UX

**Connecting** lives on the client page next to the KB and Drive folder, not in the Post editor —
it is a client-level setup act performed once, like connecting a Drive folder. Each network shows
connected / not connected / **needs reconnection** (expired or revoked token).

**Publishing** is a dialog from the Post node's header button:

```
┌──────────────────────────────────────────────────────────┐
│  Publish                                                  │
├──────────────────────────────────────────────────────────┤
│  ┌────────┐   ☑ Instagram  @primadonn        connected    │
│  │ post   │   ☐ LinkedIn   Primadonn Constr. connected    │
│  │ image  │   ☐ Facebook   —            not connected →   │
│  └────────┘                                               │
│                                                           │
│  ✓ Approved by Ravi Kumar · 3 Aug · this render           │
│                                                           │
│  Caption — as approved                        read-only   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Celebrate this Diwali with…                          │ │
│  │ #Primadonn #Chennai #DreamHomes                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ⓘ 4 of 100 Instagram posts used in the last 24h          │
│                                                           │
│              [ Copy caption · Download ]   [ Publish ]    │
└──────────────────────────────────────────────────────────┘
```

**The caption is not composed here.** It lives on the post and was approved with the artwork (D109),
so this dialog shows it **read-only**. Editing it would publish copy the client never saw — the exact
failure the approval gate exists to prevent. Changing it means going back to the post, which
invalidates the approval and requires another round. That friction is the feature.

The **"Copy caption · Download"** action is Stage A's whole product, and it stays permanently — it is
the fallback whenever a token has expired, a network is unsupported, or someone simply wants to post
by hand. It records a `manual` publication so the history stays complete. It is **also gated on
approval**: a manual hand-off publishes just as really as an API call does.

**Two gates, not one.** An earlier draft made the Publish button its own sufficient gate, reasoning
that post nodes have no version envelope and therefore nowhere to hang an approval. That reasoned
from the architecture instead of the requirement, and is **retracted** (D109/D111):

1. **Client approval** of the exact render — image, caption and hashtags — per
   `2026-08-03-post-client-approval-design.md`. Publish is disabled, with a stated reason, until the
   post's current render matches an approval. Any edit after approval makes it stale.
2. **Role** — only `senior` and `owner` may publish. A `designer` composes and shares the approval
   link; sending to a client is not a privileged act, publishing to a live account is.

On top of both, publishing stays a deliberate human action behind a confirm dialog naming the exact
accounts — consistent with D11 (the human is the scheduler) and D70 (irreversible steps always pause).

**Irreversibility must be visible.** Publishing is outward-facing and effectively permanent. The
confirm dialog names every target account explicitly; there is no "publish to all" shortcut.

## 7. The failure surface

This is most of the real work. Each of these is a user-visible state, not an exception in a log:

| Failure | Handling |
|---|---|
| Token expired or revoked | Connection shows **needs reconnection**; publish is blocked with a direct reconnect link. |
| Instagram 24h quota exhausted | Checked via `/content_publishing_limit` **before** attempting; the dialog says how many remain. |
| Page Publishing Authorization incomplete | Detected from the error and surfaced as an actionable message, not a raw API code. |
| Container created but publish failed | The container id is recorded on the publication row so a retry resumes rather than duplicating. |
| Caption over the network limit | Blocked client-side with a live counter, per network. |
| Image URL unreachable by Meta's fetcher | Pre-flight HEAD from the server before creating the container. |
| Duplicate publish (double-click, retry) | Unique constraint on `(node_id, connection_id)` for `published` rows; retries reuse the row. |

## 8. Testing

- **Pure:** caption length validation per network; connection health derivation from
  `token_expires_at` and last error; publication status transitions; the URN/container-id resume path.
- **Integration:** publish routes against a mocked platform client — success, expired token, quota
  exhausted, unreachable image, duplicate.
- **Manual, per network, before enabling it:** one real post to a test account, verified as it
  appears on the platform.
- **No live-platform tests in CI.** They need real tokens and produce real posts.

## 9. Sequencing

1. **Day 1 of Stage A:** submit Meta App Review + Business Verification, and LinkedIn app
   verification. The clock is the critical path; nothing else is.
2. **Stage A** — tables, RLS, connection scaffolding, the publish dialog, manual hand-off. Requires
   the client-approval spec to have landed, since every path out is gated on approval.
3. **Stage B** — LinkedIn, when verification clears.
4. **Stage C** — Instagram + Facebook, when App Review clears.

## 10. Decisions for the ADR log

To be appended to §7 of `2026-05-30-creativeos-staging-roadmap.md`. Numbering resolved (2026-08-03
spec review): the video-start-end-spine branch landed first and holds **D95–D100**; the Post node
spec holds **D101–D109**; the client-approval spec holds **D110–D112**; this spec holds
**D113–D115**.

| # | Decision |
|---|---|
| **D113** | Publishing ships in three stages, gated by platform approval rather than by engineering; Stage A (assisted publish with a manual hand-off) is unblocked and ships first. *Why: Meta Advanced Access requires App Review plus Business Verification at 2–6 weeks; development mode admits only test users. Rejected: waiting for approval before building; shipping a Publish button that fails for real clients.* |
| **D114** | A social connection is client-scoped and org-owned; tokens are encrypted at rest and never returned by any API route. *Rejected: org-level connections (a client's accounts are not the agency's); storing tokens in plaintext behind RLS alone.* |
| **D115** | A publish is a server-side job with a `post_publications` record that snapshots the image URL and caption; it does not join the `generations` substrate. *Why: publishing is slow, retryable, and must survive a closed tab, but it is not a generation and must not pollute eval capture or credit metering. Rejected: publishing inline in the request; reusing `generations`.* |

> **Retracted:** an earlier draft's *"the Publish button is itself the human gate; publication
> introduces no second approval system"*. It reasoned from the architecture — post nodes have no
> version envelope, so there was nowhere to hang an approval — rather than from the requirement.
> Superseded by **D109** (client approval is required) and **D111** (approval binds to the render).

## 11. Risks

| Risk | Mitigation |
|---|---|
| App Review rejected repeatedly; Stage C slips past the pilot. | Stage A carries the pilot; submit early; treat multiple rounds as expected, not exceptional. |
| Platform APIs change under us. | Docs re-verified at implementation; each network is behind one client module so a change is localised. |
| A client revokes access silently; posts fail later. | Connection health surfaced on the client page, checked before every publish. |
| D46 hardening to signed URLs would break Instagram publishing. | Recorded here explicitly: Instagram fetches the image, so a public capability URL must survive that change. |
| Token encryption key handling. | Key from env, never in the DB; rotation procedure documented at implementation. |

---

**Sources** (read 2026-08-03):
[Instagram Platform — Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) ·
[Instagram Platform — Overview](https://developers.facebook.com/docs/instagram-platform/overview/) ·
[LinkedIn Images API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-06) ·
[Meta Advanced Access — which permissions need App Review](https://singhamandeep.com/what-is-meta-advanced-access/)
