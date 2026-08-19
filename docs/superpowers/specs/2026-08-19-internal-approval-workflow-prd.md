# PRD — Internal approval workflow (senior review of junior work)

**Date:** 2026-08-19
**Status:** Product decisions settled with the user 2026-08-19. Pending review.
**Owner:** Cyril Varghese
**Audience:** Product, design, engineering. This is the *what* and *why*. The *how* lives in the
design specs listed in §12.

> **Not to be confused with client approval.** [`2026-08-03-post-client-approval-design.md`](2026-08-03-post-client-approval-design.md)
> covers an **external client** approving a finished post over a tokenized link, with no account.
> **This PRD is internal maker-checker** — a senior designer inside the agency reviewing a junior's
> generated assets, both of them logged in. The two flows share the word "approval" and nothing else:
> different actors, different surfaces, different tables. Where this document says *approval*, it
> always means the internal one.

---

## 1. Summary

CreativeOS records that an asset was approved, but nothing routes the work to the person who should
approve it. A senior designer has no way to find what is waiting for them, and — because of the
canvas lock — often no way to approve it even after finding it.

This PRD makes internal approval an actual workflow: **more than one person per organization**, a
**junior/senior split** that is enforced rather than suggested, generated assets that **enter a
review queue automatically**, a **pending-review count that bubbles from client to canvas to node**,
a **review drawer** on the canvas, and a **rejection that travels back to the junior who made it**.

> **Positioning:** **"The senior never has to go looking for what needs reviewing."**

That sentence is the scope rule. Every requirement below either puts work in front of the reviewer
or gets it back to the maker. Anything that does neither is out of scope.

## 2. Context & problem

### 2.1 What already exists

Two prior decisions did real work here, and this PRD builds on both rather than replacing them.

**D29** put the approval flag on the version envelope: `node_versions.approval_status`
(`pending | approved | changes_requested`), plus `approved_by`, `approved_at`, and `note` for
feedback. Because every AI action writes the same envelope (D4), every node type got the flag at
once. `ApprovalBadge` and `InlineApprovalBar` render it in the focus view.

**D34** designed a per-canvas read-only review queue — and it was **never built**. There is no
`/review` route and `buildReviewQueue` does not exist in the codebase. Its deferred list reads:
*"Cross-canvas inbox, submit lifecycle, notifications, batch approve, count badges."* This PRD is
the promotion of that deferral, not a re-litigation of it.

**Roles already exist in the schema.** `org_memberships.org_role` is
`check (org_role in ('owner','senior','designer'))`, and the unique index is `one_org_per_user` —
one **org per user**, not one **user per org**. Multiple seats are already legal in the database.

### 2.2 What is missing

| Gap | Evidence |
|---|---|
| **No way to create a second user** | `createOrgWithOwner` hardcodes `org_role: 'owner'` and is the only call to `auth.admin.createUser` in the repo. |
| **Role gating is decorative** | `InlineApprovalBar`'s prop is commented `// cosmetic role hint; NOT security`. `setVersionApprovalAction` performs no role check — a designer can approve their own work. |
| **No queue at any level** | D34 specced it; nothing was built. There is no aggregate count on the client list, the canvas list, or the canvas. |
| **No routing back to the maker** | `operator` is a free-text name, so "send it back to the junior" cannot resolve to a person. |
| **Video assets cannot be approved at all** | `video-gen-node.tsx` renders `ApprovalBadge`, but `video-gen-focus-view.tsx` has **no `InlineApprovalBar`**. A video shows "Pending" forever with no control anywhere to change it. |
| **The lock blocks approval** | All three focus views pass `canApprove={editable && identity?.role === "senior"}`. `editable` is the D33 lock. |
| **Reviewing evicts the maker** | `useCanvasLock` acquires **on mount**, so a senior opening a canvas to review takes the lock and flips the junior to read-only mid-generation. |

The last two are the sharpest. Today, reviewing the work **interrupts the work**, and if the junior
got there first, the senior cannot review at all. The workflow fails in both directions at once.

### 2.3 Why now

Approval state without routing is an audit trail nobody writes to. Seniors review by walking the
canvas node by node, which is exactly what D34 identified as too slow for production volume — and
D34's own answer to that was never implemented. Meanwhile the identity system, org tenancy, and
server-side role resolution (`resolveCallerContext`) all now exist, so the enforcement D29 deferred
for want of real auth is finally buildable.

## 3. Users

All users are agency staff inside one organization. The end client is not a user of this flow.

| | Does | Wants |
|---|---|---|
| **Junior designer** (`designer`) | Generates image and video assets on a canvas. | To know what came back rejected and why, without asking anyone. |
| **Senior designer** (`senior`) | Reviews juniors' assets; approves or rejects with a note. | To be shown the work, not to hunt for it — and to review without stopping the junior from working. |
| **Owner** (`owner`) | Runs the agency org. Reviews as a senior does. | Everything a senior gets. |
| **Super-admin** (Yuvabe staff, `platform_role: super_admin`) | Provisions organizations and their seats. | To add a second seat to an org without a database console. |

`owner` and `senior` are treated identically for approval, matching the existing
`orgRoleToIdentityRole` collapse. Only `designer` is restricted.

## 4. The scope rule

**Route work to a reviewer; route rejections back to the maker.** Nothing else.

This PRD does **not** gate generation on approval, does not auto-advance the pipeline when something
is approved, and does not stop a junior from using an unapproved asset downstream. **D11 stands —
the human is still the scheduler.** Those were deferred by D29 §3 and D34, and they stay deferred:
they change what the pipeline *does*, whereas this PRD only changes what people *see*.

## 5. Release scope

**In scope**

- Multiple seats per organization, provisioned by the super-admin, with a role per seat.
- Server-enforced approval permission.
- Automatic entry into review for generated image and video assets.
- Pending-review counts bubbling at client, canvas, and node level, updating live.
- A review drawer on the canvas that navigates to the node under review.
- Approval that works while another person holds the canvas lock, without taking it from them.
- A navbar icon with a number badge, opening a popover list of work waiting on you — rejected work
  for a junior, pending review for a senior.
- Approval controls for video assets (currently absent).
- Attribution migrated from free-text names to real user references.

**Out of scope**

- Org owners provisioning their own seats (super-admin only for now — §10 Q1).
- Email, push, or any out-of-app notification. In-app only.
- Gating, auto-advance, or connection blocking on unapproved assets (D11).
- Batch approve — every decision is made one asset at a time.
- A cross-canvas *review run*. The navbar popover (§6.9) is org-wide, but it only **navigates**; runs
  stay scoped to one canvas (R9.7).
- Reviewing prompt or motion-prompt text nodes. Assets only.
- Client-facing approval — that is a separate PRD.
- More than one org per user; the `one_org_per_user` index stands.

## 6. Requirements

Requirements are numbered `R<section>.<n>` and referenced by the design specs.

### 6.1 Seats and roles

- **R1.1** A super-admin can add a member to an existing organization from the org detail page,
  supplying email, display name, and role (`owner | senior | designer`).
- **R1.2** Adding a member creates the auth user, the profile, and the membership, and returns a
  generated temporary password for out-of-band sharing — the same pattern `createOrgWithOwner`
  already uses for the first seat.
- **R1.3** A super-admin can change an existing member's role.
- **R1.4** An organization must always retain at least one `owner`. The last owner cannot be removed
  or demoted. *(Already enforced by the `enforce_last_owner` trigger; this requirement records that
  it must keep holding.)*
- **R1.5** A member's role is visible to them in their own profile surface, so a junior understands
  why they cannot approve.
- **R1.6** A user belongs to exactly one organization. Unchanged.

### 6.2 Permission and enforcement

- **R2.1** Only `senior` and `owner` may set `approval_status`. This is **enforced on the server**,
  in the approval action, against the caller's resolved role — not inferred from anything the client
  sends.
- **R2.2** A `designer` attempting to approve is rejected with an error, whether they reach the
  action through the UI or directly.
- **R2.3** The UI continues to hide approval controls from a `designer`, but that hiding is a
  courtesy on top of R2.1, never the mechanism.
- **R2.4** A `designer` may still *read* every approval state and note — including on other people's
  work. Review is not secret.
- **R2.5** Approving one's own work is permitted for `senior`/`owner`. Separation of duties is not
  enforced beyond the role check, because small agencies have one senior. *(See §10 Q3.)*

### 6.3 What enters review, and when

- **R3.1** A generated asset enters review **automatically** on generation. There is no submit step.
- **R3.2** "Asset" means a node of type `image-gen` or `video-gen`. Prompt and motion-prompt nodes
  are excluded from the queue.
- **R3.3** Only a node's **active version** is ever in the queue. A junior who regenerates twenty
  times produces one queue item, not twenty. *(This is what makes R3.1 tolerable — it falls out of
  D5/D18 with no extra machinery.)*
- **R3.4** A node is in the senior's queue when its active version's `approval_status` is `pending`.
- **R3.5** A node with no active version — never generated, or generation failed — is not in the
  queue.
- **R3.6** Regenerating produces a new version at `pending` (D29 §4.1), so a previously approved or
  rejected node **re-enters the queue automatically**. This is the return path for rejected work and
  requires no resubmit action.
- **R3.7** Assets generated by a `senior` or `owner` also enter the queue. The queue is a property of
  the work, not of who made it.

### 6.4 Assignment

- **R4.1** Review is **not assigned to a named individual.** Every `senior` and `owner` in the
  organization sees the same queue.
- **R4.2** The queue is **derived on read** from approval state. There is no assignee column and no
  assignment record. *(Consistent with D9.)*
- **R4.3** A rejected asset is routed back to **the specific person who generated it**, resolved from
  the version's maker reference (R11.1). This is the one place the workflow is person-specific.
- **R4.4** Two seniors may review concurrently. If both act on the same item, last write wins; the
  live updates in §6.8 make the collision visible rather than silent.

### 6.5 Bubbling — three levels, one number

- **R5.1** The **client list** shows, per client row, a count of assets pending review across all
  that client's canvases. Zero renders nothing at all — no empty badge.
- **R5.2** The **canvas list** shows, per canvas row, the same count scoped to that canvas.
- **R5.3** The **canvas** shows a control indicating how many of its assets await review, which opens
  the review drawer (§6.6).
- **R5.4** Individual **nodes** on the canvas continue to carry `ApprovalBadge`. This is existing
  behaviour and is preserved.
- **R5.5** The three levels show **the same underlying number** at three zoom levels: a client's count
  is the sum of its canvases' counts.
- **R5.6** Counts are visible to every role. A junior sees how much is outstanding; only a senior can
  act on it.
- **R5.7** A senior can travel client → canvas → node purely by following the counts, without knowing
  in advance where the work is.
- **R5.8** The count is rendered as a **neutral pill carrying a single amber dot**. Amber is the
  attention colour, matching the `pending` state the existing `ApprovalBadge` already renders in amber.
- **R5.9** **Red is reserved for `changes_requested` and must not be used for pending counts.** A red
  dot meaning "needs review" at the client level, resolving to a red badge meaning "was rejected" at
  the node level, would give one colour two meanings inside the single journey R5.7 describes.
- **R5.10** The treatment must stay legible when *many* rows carry a count. A page on which every row
  is flagged should still read as a list, not an alarm.

### 6.6 The review drawer

- **R6.1** A canvas-level control opens a drawer listing every asset on that canvas awaiting review.
- **R6.2** Each row identifies the asset well enough to triage it without opening it: a preview,
  which node it is, who made it, and when.
- **R6.3** Clicking a row navigates the canvas to that node and opens its focus view — the same
  navigation the generation tray already performs (D35).
- **R6.4** The senior approves or rejects from the node's existing approval control. The drawer routes;
  it does not become a second approval surface.
- **R6.5** Rejecting requires a note. A rejection with no explanation is not useful to the junior.
  Approving does not.
- **R6.6** An item leaves the drawer as soon as it is approved or rejected — the drawer holds only
  what is still `pending`.
- **R6.7** The drawer is available to every role; for a `designer` it is a read-only view of what is
  outstanding.
- **R6.8** Opening, reading, and acting in the drawer **never acquires the canvas lock** (§6.7).
- **R6.9** Clicking a row **starts a review run**, not a single lookup. The senior moves through that
  canvas's pending items in sequence without returning to the drawer between them.
- **R6.10** While a run is active, the node's focus view shows the senior's **position in the queue**
  ("3 of 7") and offers **approve-and-advance**, so acting on an item moves to the next one.
- **R6.11** A run is navigable by keyboard, and a senior may move through items without deciding on
  each — skipping is allowed; only the queue's contents are fixed, not the order they act in.
- **R6.12** The drawer is non-modal and takes no backdrop: the canvas stays interactive behind it,
  matching the gallery drawer's existing behaviour.

> **Why a run.** Focus views open as a bottom sheet at 92% of viewport height, so the drawer and the
> node it navigates to cannot both be on screen. Rather than shrink every node type's focus view, the
> drawer hands off a queue and steps aside. `review-screen.tsx` already implements this shape —
> one item per screen, keyboard navigation, save-and-advance, a progress counter — and was written to
> be source-agnostic, so this is largely rewiring rather than new construction.

### 6.7 Approval and the canvas lock

- **R7.1** Approval **does not require the canvas edit lock.** A senior can approve while a junior is
  actively editing the same canvas.
- **R7.2** Entering a canvas to review **does not acquire the lock.** A senior reviewing must never
  flip an editing junior into read-only.
- **R7.3** Everything the lock protects today stays protected: canvas edits, generation, and parse
  remain single-writer under D33. Only approval is decoupled.
- **R7.4** A reviewer's view reflects changes made by the person holding the lock, via §6.8 — so
  approving something that was regenerated a moment ago is prevented by the view being current, not
  by a lock.

> **Rationale.** The lock exists to stop two full-snapshot canvas writes clobbering each other.
> Approval writes only to `node_versions`, annotating an existing attempt; it touches no canvas,
> node, or edge row, so it is not in the class of writes the lock defends. D34 already stated this
> — *"D33's 'viewers can't approve' is a canvas-UI gate, not a server guard"* — but the UI never
> matched the decision.

### 6.8 Live updates

- **R8.1** Pending-review counts and the drawer's contents update **live**, without a reload.
- **R8.2** When a junior generates an asset, a senior with the canvas open sees the count rise and the
  item appear.
- **R8.3** When a senior approves or rejects, a junior with the canvas open sees the node's badge
  change and, if rejected, sees it arrive in their own queue.
- **R8.4** Live updates are **in-app only**. No email and no push. A user who is not looking at the
  app is not told anything until they return.
- **R8.5** If the live connection drops, the surfaces must not display a confidently wrong count —
  degrade to the value from last load rather than to zero.

### 6.9 The navbar queue — both roles, one control

- **R9.1** Work waiting on you is reached from a **navbar icon carrying a number badge**, which opens
  a **popover containing a list**. It is not a page and not a canvas surface.
- **R9.2** The popover is deliberately **minimal — a list of pointers**. Each row identifies the asset
  and where it lives; that is all it owes the reader.
- **R9.3** Clicking an entry navigates to that node. **The reviewer's note is read on the node**, next
  to the asset and the controls to regenerate it — the place the fix actually happens.
- **R9.4** An entry leaves the list when the junior regenerates, because the new version returns to
  `pending` (R3.6) and the asset re-enters the senior's queue. The hand-off is automatic in both
  directions.
- **R9.5** **One control, one meaning — "things waiting on you."** For a `designer` it lists their own
  rejected work; for a `senior`/`owner` it lists what is pending review. A senior who has had their
  own work rejected sees that too.
- **R9.6** The icon lives in the **app chrome**, not on a canvas, because the work it points at
  **spans canvases and clients**. No single canvas could host it.
- **R9.7** **The popover navigates; it does not run.** A senior therefore has *two* entry points, and
  they are deliberately different: the **navbar popover is org-wide and jumps to a node**, while the
  **canvas sidebar is canvas-scoped and starts a review run** (§6.6). Only the sidebar begins a run.
- **R9.8** The two counts a senior sees are **scoped differently and will legitimately disagree** —
  the navbar counts everything outstanding, the canvas control counts only this canvas. Each must
  state its scope, so that a navbar reading of 12 beside a canvas reading of 5 is obviously two
  questions answered, not a bug.

> **Why the run stays canvas-scoped.** A run that spanned canvases would have to load a different
> canvas mid-sequence on every "approve and next" — new lock state, new Realtime channel, a viewport
> jump the senior did not ask for. Keeping the run inside one canvas costs the senior one extra click
> per canvas and removes that entire class of problem.

### 6.10 Video assets

- **R10.1** `video-gen` nodes gain an approval control in the focus view, matching `image-gen`.
  Without it, R3.2 cannot be satisfied — video is currently unapprovable.
- **R10.2** Video assets appear in the queue, drawer, and counts on the same terms as images.

### 6.11 Attribution

- **R11.1** The **maker** of a version is recorded as a real user reference, not a free-text name.
- **R11.2** The **reviewer** is recorded as a real user reference, not a free-text name.
- **R11.3** Both surfaces display the person's current display name, resolved through the reference,
  so a renamed user is not shown under a stale name.
- **R11.4** Existing rows carry MVP-era free-text names with no user to point at. They must not break
  the surfaces or block the migration; they may display as legacy strings.
- **R11.5** Attribution is org-scoped. A reference must never resolve to a name from another
  organization.

> **Why this is required, not cosmetic:** R4.3 routes rejected work to the person who made it. With
> `operator` as free text, "the junior who made it" is unresolvable. This migration is what makes the
> return path mean anything. D29 §5.2 already prescribed it as the graduation step once real auth
> existed — it now does.

### 6.12 Permissions summary

| Action | `designer` | `senior` | `owner` | `super_admin` |
|---|---|---|---|---|
| Generate an asset | ✅ | ✅ | ✅ | — |
| See pending counts and drawer | ✅ | ✅ | ✅ | — |
| Approve / reject an asset | ❌ | ✅ | ✅ | — |
| See own rejected queue | ✅ | ✅ | ✅ | — |
| Add a member to an org | ❌ | ❌ | ❌ | ✅ |
| Change a member's role | ❌ | ❌ | ❌ | ✅ |

## 7. Success criteria

1. An organization can have a junior and a senior, each logging in as themselves.
2. A junior generates an image; without any further action, it appears in the senior's queue.
3. The senior finds that asset starting from the client list, following counts down to the node,
   without being told where it is.
4. The senior approves it **while the junior still holds the canvas lock**, and the junior is not
   interrupted.
5. The senior rejects a video with a note; it leaves their drawer and appears in the junior's
   rejected queue with the note attached.
6. The junior regenerates; the asset returns to the senior's queue with no resubmit step.
7. A junior cannot approve anything, including by calling the action directly.
8. Counts at all three levels agree, and update live in both directions.

## 8. Dependencies and constraints

- **Existing approval state (D29).** States, columns, and semantics are reused as-is. The only change
  to them is the identity migration in §6.11.
- **The active-version model (D5/D18).** R3.3 depends on it entirely; without it R3.1 floods the queue.
- **The canvas lock (D33).** §6.7 refines its reach. Nothing else about it changes.
- **Org tenancy (D42/D44/D88).** Every query in this PRD is org-scoped through the existing tree, and
  default-deny RLS applies to anything the browser reads directly.
- **Server-side identity (`resolveCallerContext`).** R2.1 is only buildable because this exists.
- **Canvas navigation (D35).** R6.3 and R9.3 reuse the generation tray's fly-to-node behaviour rather
  than inventing navigation.
- **Realtime.** §6.8 needs a live channel; D35 established the pattern on `generations`, but approval
  state lives on `node_versions`, so the subscription is new work.
- **Free-tier reality.** Counts must not require a query per row on list pages; the client list is
  rendered for every org member on every visit.

## 9. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Queue floods** | R3.1 auto-enrols everything. If R3.3 is wrong, a junior's iteration loop buries the senior. | Active version only; verify against a realistic session before shipping. |
| **Decoupling approval from the lock is a real weakening** | D33 deliberately blocked approval for second openers. We are reversing that. | Approval writes to a different table than the lock protects, and cannot conflict with a canvas snapshot write. Scope the reversal to approval alone. |
| **Stale review** | A senior approves an asset regenerated seconds earlier. | Approval targets a specific version id, so a stale approval lands on the old version, not the new one. §6.8 keeps the view current. |
| **Count drift** | Three levels disagree; users stop trusting the badges. | One derivation, aggregated — never three independent queries. R5.5 is a testable invariant. |
| **The identity migration touches historical rows** | `operator`/`approved_by` carry MVP-era names. | R11.4 — legacy strings degrade visibly, never block. |
| **Realtime cost and connection churn** | A channel per canvas per viewer. | Reuse the D35 channel pattern; one channel per canvas, filtered client-side. |
| **Temp passwords shared out-of-band** | R1.2 mirrors an existing pattern with a known weakness — D84 deferred forced password change. | Out of scope here, but the exposure grows with seat count. Flagged, not solved. |

## 10. Open questions

1. **Should org owners eventually provision their own seats?** Super-admin-only is right for the
   pilot, but it puts Yuvabe in the loop for every hire. Deferred, not rejected.
2. **Should self-approval be blocked for seniors?** R2.5 permits it because a one-senior agency
   would otherwise deadlock. Revisit if orgs grow.
3. **Is "Rejected" or "Changes requested" the right label?** The stored value stays
   `changes_requested`; the UI wording is a copy decision, currently "Rejected".
4. **Does an approved asset ever need to leave the approved state?** Reset-to-pending exists in the
   action today. Whether it belongs in this workflow's UI is undecided.

## 11. Decisions this PRD introduces

Recorded in `2026-05-30-creativeos-staging-roadmap.md` §7. **Numbers provisional — D147 is the
current maximum, and both D80 and D139 are already duplicated in the log, so these must be confirmed
against §7 at the moment of writing rather than assumed.**

| # | Decision |
|---|---|
| **D148** | Approval is decoupled from the D33 canvas lock: it writes only to `node_versions` and needs no lock. Refines D34, which asserted this for a separate route but left the canvas UI gating it. |
| **D149** | A canvas can be entered in a non-acquiring review mode, so reviewing never evicts an editor. This is what makes an in-canvas review drawer possible — the thing D34 rejected as "would fight the D33 lock." |
| **D150** | Review is derived, not assigned: no assignee column, every senior sees one queue. Rejection is the only person-specific routing, and resolves through the version's maker. |
| **D151** | Seats are provisioned by the super-admin, extending the existing org-detail surface. Org self-serve is deferred. |
| **D152** | Approval permission is enforced server-side against the caller's org role, retiring the cosmetic-only gate D29 §3 deferred. |
| **D153** | `operator` and `approved_by` become real user references; legacy free-text values degrade rather than block. Executes D29 §5.2. |
| **D154** | Pending counts are a neutral pill with an amber dot; **red stays reserved for `changes_requested`**. Extends D29's existing badge palette upward to the client and canvas levels rather than introducing a second alarm colour. |
| **D155** | Reviewing is a **run, not a lookup**: the canvas drawer hands a queue to the focus view, which carries position and approve-and-advance. Adopts the `review-screen.tsx` shape rather than shrinking every node type's 92vh bottom sheet. |
| **D156** | One navbar control serves both roles — org-wide, a list of pointers, **navigates but never runs**. The run stays canvas-scoped, so no "approve and next" ever loads a different canvas. |

## 12. Where the design lives

This PRD owns *what* and *why*. The *how* belongs in design specs, to be written next:

- **Seats and enforcement** — R1.x, R2.x, R11.x.
- **Queue, counts, and bubbling** — R3.x, R4.x, R5.x, R8.x.
- **Review drawer and the lock** — R6.x, R7.x, R9.x, R10.x.

**Where a design spec and this PRD disagree, the PRD is right and the spec is stale.**
