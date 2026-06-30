# Approval Flag — maker-checker on LLM outputs

**Date:** 2026-06-29
**Status:** Approved design. Implementation pending (test-first).
**Type:** Design spec (adds **D29**; a flag-only first step toward a review/approval workflow).
**Decision record:** ADR **D29** (`2026-05-30-creativeos-staging-roadmap.md` §7 — append).
**Builds on:** **D4** (uniform version envelope), **D5** (active pointer), **D18** (a version
is an LLM attempt), **D14** (no auth yet; `operator` reserved-but-empty), **D11** (human is the
scheduler — *preserved, not changed*).
**Origin:** "now that the shot is composed, a senior designer may want to validate the LLM
outputs before I proceed." Brainstormed down from a full gating/triggering workflow to its
simplest useful primitive: **a flag**.

---

## 1. Problem

Any LLM-generated output in CreativeOS (script parse, shot composition, image/video prompts,
generated images/videos) is currently produced and consumed with **no notion of human
sign-off**. An intern can generate a wave of outputs, but there is no place to record that a
**senior designer reviewed and approved** a given output, no record of **who** approved it or
**when**, and no way to signal "this one needs another pass." Every version is anonymous and
un-reviewed.

This is the classic **maker-checker** gap: a *maker* produces work, a *checker* validates it,
and the system records the separation of duties. CreativeOS has the maker half (generation
writes a version) but nothing for the checker half.

## 2. Goal

Add the **smallest useful primitive** for maker-checker: an **approval flag** on every
LLM-generated output, settable by a reviewer, visible on the canvas, and fully attributed
(who + when) on **both** sides — maker and checker.

Explicitly a **flag only**. It records state; it does **not** yet gate connections, trigger
downstream generation, or enforce who may approve. Those are deliberately deferred (§7) and
are *unblocked* by — i.e. build on top of — this flag.

## 3. Non-goals (deferred, but unblocked by the flag)

- **Connection gating** — unapproved output cannot be wired/consumed downstream. *Later.*
- **Auto-advance / triggering** — approval kicking off the next generation step. *Later
  (would require revisiting D11).*
- **Enforcement / RBAC** — "only a senior may approve." Requires real auth. *Later.*
- **Notifications** — telling the senior something awaits review. *Later.*

The flag is the foundation each of these would read from.

## 4. Design

### 4.1 Approval attaches to the *version*, not the node

Per **D18**, a version is one LLM attempt; per **D5**, the node's `active_version_id` points at
the current one. Approval is a judgment about **a specific attempt**, so it lives on the
version. "Approve this node" means "approve its active version." A **re-generate produces a new
version → it starts at `pending`** again (the old approval does not carry over). This falls
straight out of the append-only model — no extra machinery.

### 4.2 Data model — extend the uniform envelope (D4)

Because **D4** makes every AI action write the *same* envelope to `node_versions`, adding the
flag there gives it to **every node type at once** (script, shot, prompt, image-gen,
video-prompt, video-gen) with no per-node work. One migration adds:

| Column | Type | Default | Meaning |
|---|---|---|---|
| `approval_status` | `text` | `'pending'` | `'pending' \| 'approved' \| 'changes_requested'` |
| `approved_by` | `text` | `null` | soft identity of the **checker** (name; upgrades to `user_id`) |
| `approved_at` | `timestamptz` | `null` | when the current status was set |

`note` (existing column) carries the **"changes requested" feedback** — no new column needed.
The **maker** is recorded in the existing `operator` column (the D14-reserved field), now
filled from identity (§4.4) at generation time instead of left empty.

**Three states** (kept, per decision in brainstorming):

- **pending** — generated, not yet reviewed (default on every new version).
- **approved** — a checker signed off.
- **changes_requested** — a checker wants another pass; `note` says what to fix.

Distinct from the existing `decision: 'pass' | 'fail'` eval signal. `decision` is the **D22
quality/learning** signal (was this output *good*); `approval_status` is the **sign-off gate**
(is this output *cleared*). They are intentionally separate fields — an output can be "good but
not yet signed off," or "approved despite a mediocre eval."

### 4.3 Setting the flag

A small **approval control** in each node's **focus view**, beside the existing pass/fail eval
bar. Actions, each writing to the **active version** via a server action (mirroring the
existing `setVersionLabelAction`):

| Action | Writes |
|---|---|
| **Approve** | `approval_status='approved'`, `approved_by=<identity>`, `approved_at=now()` |
| **Request changes** (opens note) | `approval_status='changes_requested'`, `approved_by`, `approved_at`, `note` |
| **Reset to pending** | `approval_status='pending'`, clears `approved_by`/`approved_at` |

### 4.4 Identity — soft, set at app start (maker-checker needs both sides)

To attribute **both** maker and checker, identity is captured **once at app start**, not lazily
at approval time (lazy would capture the checker but lose the maker, who generated earlier).

- **Stored value:** `localStorage["creativeos.identity"] = { name, role }`,
  `role: 'senior' | 'designer'`.
- **App-start gate:** first load with no identity → a lightweight shadcn dialog ("Who are
  you?" — name + role select) before the canvas. Set once, persisted, never re-asked.
- **Top-bar identity chip:** shows current identity; click to switch (e.g. a senior sitting at
  the intern's machine).
- **Hook:** `useIdentity()` reads the stored value. Generation writes `operator = identity`;
  approval writes `approved_by = identity`.
- **Spoofable by design.** Anyone can edit localStorage. Accepted trade-off for a small
  trusted internal team: we get the **audit trail** without auth. *Trust* and *enforcement*
  are what real auth adds later.
- **Cosmetic role hint:** `role` may gate *visibility* of the Approve control (show for
  `senior`) — a habit-shaping nudge, **not** security.

### 4.5 Showing the flag

- **Node badge:** a status pill reusing the `kb-status-badge` style — amber **"Pending"**,
  emerald **"Approved"**, neutral-with-dot **"Changes requested"**.
- **Version history:** the same status shown per attempt, so it is clear *which* version was
  approved and by whom/when.

## 5. Upgrade path to real auth

> **Handoff note.** This section is the durable record for a *future* auth project. When real
> auth is built someday, this spec is a valid input: §5.1 is the as-built seam, §5.2 is the
> step-by-step graduation. Nothing in §4 needs redesign — only the *source of identity* changes.

### 5.1 The seam (as built by this feature)

The design is shaped so the *shape* survives and only the *source of identity* changes — the
same seam **D14** anticipated:

| Piece | Now (soft identity) | After Supabase Auth + RLS |
|---|---|---|
| Identity source | `localStorage` → `useIdentity()` | session → `useUser()` (same hook, new innards) |
| `approved_by` / `operator` | free-text name | `user_id` FK — a *data* migration, not a redesign |
| `role` | self-selected in the chip | from a `profiles`/`roles` table |
| App-start gate | "who are you?" dialog | real login screen (slots into the same spot) |
| Enforcement | none (cosmetic role hint) | RLS: only `role='senior'` may write `approval_status` |
| `approval_status` / `approved_at` / states | — | **unchanged** |

### 5.2 Graduation checklist (for the future auth project)

1. **Add Supabase Auth** + a `profiles` table carrying `role` (`senior | designer | …`).
2. **Re-point `useIdentity()`** to the session (`supabase.auth.getUser()` + `profiles.role`).
   Keep the hook signature `{ name, role }` so call sites are untouched. Delete the localStorage
   read and the app-start "who are you?" dialog (replaced by the login screen).
3. **Migrate identity columns:** `approved_by` and `operator` `text` → `uuid` FK to the auth
   user. Backfill historical free-text names by best-effort match (or leave as legacy strings in
   a side column — these are MVP-era records).
4. **Turn on RLS** on `node_versions`: only `role='senior'` may write `approval_status` /
   `approved_by`. Remove the cosmetic `role==='senior'` visibility hint (RLS now enforces it).
5. **No change** to `approval_status`, `approved_at`, the three states, the focus-view control,
   the node badge, or version-history display — they survive verbatim.

## 6. Testing

- **Migration:** new columns exist with correct defaults; existing rows backfill to `pending`.
- **Server action:** approve / request-changes / reset write the right fields to the **active**
  version; re-generate yields a new version at `pending` (old approval does not carry).
- **Identity:** `useIdentity()` reads/writes localStorage; app-start gate appears only when
  unset; generation stamps `operator`, approval stamps `approved_by`.
- **UI:** badge reflects each of the three states; version history shows per-attempt status.
- **Separation from eval:** setting `approval_status` does not touch `decision`, and vice
  versa.

## 7. Out of scope

Connection gating, auto-advance/triggering, RBAC enforcement, and notifications — see §3. All
deferred; all build on this flag.
