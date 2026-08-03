# Client approval — shared review link with feedback

**Date:** 2026-08-03
**Status:** Draft design — product decisions settled with the user 2026-08-03; pending spec review.
**Type:** Design spec (new surface). Introduces decisions **D110–D112** — numbers provisional, see the
numbering caution in the Post node spec.
**▸ Read the PRD first:** **[`2026-08-03-post-prd.md`](2026-08-03-post-prd.md)**. **The PRD owns what
and why; this spec owns how.** Where they disagree, the PRD is right and this file is stale.
**Implements:** PRD **§6.8** approval (R8.1–R8.7) and the approval rows of **§6.10** permissions.
**Paired specs:**
[`2026-08-03-post-node-design.md`](2026-08-03-post-node-design.md) — produces the artifact being
approved (D109).
[`2026-08-03-post-publishing-design.md`](2026-08-03-post-publishing-design.md) — gated by this.
**Build order:** post node → **approval** → publishing.
**Builds on:** **D46** (public capability URLs accepted for the pilot — the security model here is the
same one, applied to a page), **D34** (a read-only review surface decoupled from the canvas lock),
**D29** (approval as a flag on an artifact), **D42/D44/D88** (org tenancy, chokepoint enforcement,
default-deny RLS), **D30** (media in GCS).

---

## 1. Problem & goal

A post cannot be published until the client has approved it. Today there is no way for a client to
approve anything: the identity model is entirely agency-side — `OrgRole = "owner" | "senior" |
"designer"` — and **no client-facing user, role or login exists anywhere in the system**. Approval
happens over WhatsApp and email, and nothing records it.

The existing review surface (D34) does not fill this gap. It is *internal* maker-checker — a senior
reviewing a junior — it writes to `node_versions`, and its queue excludes nodes without an active
version. Post nodes have none, so they would never appear in it.

**Goal.** A client sees exactly what will be published — artwork **and** caption — on a page they can
open without an account, and either approves it or leaves feedback. The result is recorded against
that specific render, and publishing is gated on it.

## 2. Why a link, not accounts

Three options were considered.

**A — Tokenized share link (chosen).** The client opens an unguessable URL, sees a read-only view,
approves or comments. No account, no password, no invite flow. It matches how approval actually
happens — you send someone a link — and it produces a real audit trail rather than an
agency-asserted one.

The security model is **already accepted in writing**: D46 accepts unguessable public capability URLs
for GCS media in the pilot. This is that same posture applied to a page, with tighter controls
(§6) than the media URLs already in use.

**B — Recorded offline approval (kept as a fallback, not a rival).** Some clients will always approve
on a phone call. A `senior`/`owner` records "approved by <name> on <date>" with a note. Honest only
to the extent of the person filling it in — and marked as such in the record, permanently.

**C — Client portal, real logins.** Correct long-term, far too much for the pilot: external identity,
invites, org-scoped external access, password resets, notification preferences. Rejected for now,
and nothing here forecloses it — a portal would reuse this same view and the same records.

## 3. What the client sees

One page, no chrome from the app, no navigation. The client's brand, not ours.

```
┌────────────────────────────────────────────────────────────┐
│  Primadonn Construction — for your approval                 │
│  Diwali Offer · Instagram Story · sent by Anita, 3 Aug      │
├──────────────────────┬─────────────────────────────────────┤
│                      │  CAPTION                            │
│   ┌──────────────┐   │  ┌───────────────────────────────┐  │
│   │              │   │  │ Celebrate this Diwali with…   │  │
│   │  the post    │   │  │                               │  │
│   │  as rendered │   │  └───────────────────────────────┘  │
│   │              │   │  #Primadonn #Chennai #DreamHomes    │
│   └──────────────┘   │                                     │
│                      │  ┌───────────────────────────────┐  │
│                      │  │ Leave a comment…              │  │
│                      │  └───────────────────────────────┘  │
│                      │                                     │
│                      │  [ Request changes ]  [ Approve ]   │
└──────────────────────┴─────────────────────────────────────┘
```

**Artwork and caption together**, because that is what D109 says the client is approving. An offer's
terms, price and claims live in the caption; approving artwork alone leaves the riskiest copy
unreviewed. Hashtags are shown with it.

**Feedback, not just a verdict.** "Make the headline bigger" is the normal response, and a system
that only offers Approve / Reject forces that conversation back into WhatsApp — which is the thing
this replaces. **Request changes** requires a comment; **Approve** allows an optional one.

**Comments are a flat thread on the post**, not pins anchored to a point on the artwork. Anchored
pins are better and are a natural V2 addition; a thread is what makes the loop work.

**No account, no sign-in, no cookie banner.** The client types their name once (remembered in
`localStorage` for that link) so the record has a person against it.

## 4. What the agency sees

- **On the post node:** a status chip — *Draft · Awaiting approval · Changes requested · Approved* —
  and, when approved, which render it applies to.
- **In the focus view:** the comment thread beside the composition, so feedback is read where the fix
  is made.
- **A "Share for approval" action** in the header producing the link, copyable, with a preview of
  what the client will see. Available to any role (§8).

## 5. Data model

```sql
create table post_share_links (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id),
  node_id       uuid not null references nodes(id) on delete cascade,
  token         text not null unique,          -- 32 bytes, CSPRNG, base64url
  created_by    uuid not null references auth.users(id),
  expires_at    timestamptz not null,          -- default now() + 30 days
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table post_approvals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id),
  node_id        uuid not null references nodes(id) on delete cascade,
  -- WHAT was approved: the exact render, not the node.
  image_url      text not null,
  caption        text,
  hashtags       text[],
  rendered_at    timestamptz not null,
  status         text not null,                -- approved | changes_requested
  -- WHO, and how we know
  source         text not null,                -- 'link' | 'recorded'
  client_name    text,                         -- typed by the client, or named by the recorder
  recorded_by    uuid references auth.users(id),  -- set only when source = 'recorded'
  note           text,
  link_id        uuid references post_share_links(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table post_comments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id),
  node_id      uuid not null references nodes(id) on delete cascade,
  body         text not null,
  author_name  text not null,                  -- client's typed name, or the agency user's
  author_user  uuid references auth.users(id), -- null when the author is a client
  link_id      uuid references post_share_links(id) on delete set null,
  created_at   timestamptz not null default now()
);
```

All three carry `org_id` with default-deny RLS and an org-scoped policy (D88); every agency-side
route enforces org at the chokepoint (D44). The **client-facing routes are the exception** — they
authenticate by token, not by session, and are the only routes in the app that do (§6).

**Approval binds to the render.** `image_url` + `rendered_at` are **snapshots**, not references. The
post's current state is compared against them: if the composition, caption or hashtags have changed
since, the approval is **stale** and publishing is blocked again. This is the whole point — otherwise
"approve → nudge the headline → publish" ships something the client never saw.

**Approvals are append-only.** A post can be approved, edited, and re-approved; every round is a row.
The gate reads the latest row matching the current render. Nothing is overwritten, so the history of
what was shown and said survives.

## 6. Security

The link is a **capability URL** — possession is authorization. Accepted for the pilot per D46, with
controls tighter than the GCS URLs already in use:

| Control | |
|---|---|
| Token | 32 bytes from a CSPRNG, base64url. Not derived from the node id. |
| Expiry | 30 days by default, set at creation, enforced server-side. |
| Revocation | Any agency user can revoke; the page then shows "this link has expired". |
| Scope | **One post.** A token grants nothing else — not the canvas, not the client, not other posts. |
| Response shape | Only the rendered image URL, caption, hashtags, and comments. No node ids, no org data, no other nodes. |
| Indexing | `noindex, nofollow` plus `Referrer-Policy: no-referrer`, so the link doesn't leak through search or referrers. |
| Rate limiting | Per-token, on comment and approval POSTs. |

**Honest limits, stated:** anyone with the link can approve, and can claim any name. That is the same
trust model as emailing a PDF and getting "looks good" back — which is what this replaces — but it is
weaker than authenticated approval and should not be described internally as proof of identity. If
approval ever needs to be legally defensible, that is option C.

**The image is already public.** A post's `fileUrl` is a public GCS object (D46), so the approval page
exposes nothing that a leaked image URL would not.

## 7. The recorded fallback

Where a client approves offline, a `senior`/`owner` records it: their name, the date, an optional
note and attachment. The row is written with `source = 'recorded'` and `recorded_by` set.

**It is never presented as equivalent.** The post's status chip and the publish dialog both show
*"Approved — recorded by Anita"* rather than *"Approved by the client"*. The distinction is preserved
everywhere it is displayed, permanently. A record of who claimed what is worth having; a record that
quietly launders a claim into a fact is not.

## 8. Permissions

| Action | designer | senior | owner | client (link) |
|---|---|---|---|---|
| Create / revoke a share link | ✅ | ✅ | ✅ | — |
| Approve · request changes | — | — | — | ✅ |
| Comment | ✅ | ✅ | ✅ | ✅ |
| Record an offline approval | ❌ | ✅ | ✅ | — |

**Anyone may send a post to a client.** That is ordinary client contact, not a privileged act, and no
internal review gates it — D29 stays flag-only. The privileged act is **publishing**, which needs a
`senior`/`owner` *and* a non-stale approval.

Agency users cannot approve on the client's behalf through the link — that path exists only as the
explicitly-labelled recorded fallback.

## 9. Notifications

**V1 has none.** The link is shared by whatever channel the agency already uses; approvals and
comments surface in-app on the post node and its focus view.

Email on approval or comment is an obvious addition and deliberately deferred — it needs a sending
domain, deliverability, unsubscribe handling, and a decision about who gets notified, none of which
the gate depends on.

## 10. Testing

- **Pure:** staleness derivation (current render vs. approval snapshot) across every mutation — layer edit, caption edit, hashtag edit, re-render; token expiry and revocation states; permission matrix.
- **Integration:** the client route with a valid, expired, revoked and forged token; approve and request-changes round trips; that the response body leaks nothing beyond the documented shape.
- **Manual:** open a real link in a clean browser with no session and confirm the page renders, accepts a name, and records an approval.

## 11. Decisions for the ADR log

| # | Decision |
|---|---|
| **D110** | Client approval happens through a per-post tokenized capability link with no account, with an explicitly-labelled recorded-offline fallback. *Why: no client-facing identity exists, and a link matches how approval already happens. The capability-URL posture is the one D46 already accepts for the pilot, with tighter controls. Rejected: a client portal with real logins (external identity, invites, resets — too much for the pilot); agency-asserted approval as the only mechanism.* |
| **D111** | Approval binds to the exact render — image, caption and hashtags snapshotted — and any subsequent edit makes it stale and re-blocks publishing. Approvals are append-only. *Why: otherwise "approve → edit → publish" ships something the client never saw. Rejected: approval as a flag on the node; last-write-wins on a single row.* |
| **D112** | The client's response is approve **or feedback**, and feedback is a comment thread on the post; anyone in the agency may send a post for approval, but only `senior`/`owner` may publish. *Why: "make the headline bigger" is the normal response, and a verdict-only system pushes that conversation back into WhatsApp, which is the thing being replaced. Rejected: approve/reject only; pin-anchored comments in V1 (a V2 addition); gating client contact behind internal senior review.* |

## 12. Risks

| Risk | Mitigation |
|---|---|
| A forwarded link lets an unintended person approve. | Per-post scope, expiry, revocation, and a named approver on the record. Accepted posture, documented — it is the trust model of emailing a PDF. |
| A client approves, the designer tweaks, nobody notices. | Staleness is derived, not stored — publishing re-blocks automatically and the chip changes. |
| The recorded fallback becomes the default because it is easier. | It is `senior`/`owner` only, and it is labelled as recorded everywhere it appears. Worth watching as a metric. |
| Comment threads become the project management tool. | Scoped to one post, no assignment, no status. If it grows, that is a different product. |
| No notifications means links go unanswered. | V1 accepts this; the agency chases as it does today. Revisit if approval round-trip time (a tracked metric) is bad. |

## 13. Open questions

1. **Is latest-wins the right gate**, or should publishing require the *most recent* approval to be an approval — i.e. does a later "request changes" override an earlier approval on the same render? Assumed yes: the latest row for the current render decides.
2. **Should the client see version history** — the previous rounds and what changed? Assumed no in V1.
3. **Link expiry of 30 days** — long enough for a slow client, short enough to matter? A guess, easily changed.
