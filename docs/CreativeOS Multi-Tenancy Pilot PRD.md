# CreativeOS Multi-Tenancy Pilot PRD

## Orgs, login, and data isolation for the first external customer

> **Scope discipline:** this is a **pilot** PRD. It covers the 80% core — one agency logs
> in and sees only its own world — and explicitly defers the 20% (multi-seat orgs, RBAC,
> self-serve, billing). Decisions land in the ADR log
> (`docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7) as **D42–D48**.
> Supersedes the "open app on a private URL" posture of **D14**;
> implements the auth half of backlog **F1** (MVP PRD §21).

---

## 1. Summary

CreativeOS today is a single shared workspace: no login, every visitor sees every client,
canvas, and generated asset (D14 — deliberate for the internal MVP). To give the product
to the first external agency, that posture must change: each agency gets an
**Organization** that owns its clients end-to-end, users **log in**, and **no data —
rows, files, or realtime events — crosses the org boundary.**

The pilot deliberately starts at **one user per org**. The schema is shaped so a second
seat is additive, but nothing multi-user is built.

---

## 2. Problem

| Problem | Impact |
| :---- | :---- |
| No login — anyone with the URL sees everything | Cannot onboard any external agency |
| All clients/canvases live in one flat pool | Agency A would see Agency B's client brands, scripts, and generated assets |
| Generated files are public GCS URLs | An asset URL that leaks is world-readable |
| `generations` + `client_kb_jobs` are browser-readable via the anon key | Any visitor's browser can read every org's job rows (prompts, statuses) |
| Identity is a spoofable localStorage name (D29) | No real attribution, no accountability for an external customer |
| Generation cost is metered per generation but has no org dimension | Cannot monitor what a pilot agency consumes, cap runaway cost, or invoice from real numbers |

---

## 3. Pilot goal

An external agency can use CreativeOS for its own client brands with **zero visibility
into any other org's data**; Yuvabe can **monitor each org's credit usage** (and cap it)
while the pilot runs; and onboarding a new agency is a repeatable, low-effort operation
(seed script + credentials — no redeploy, no new infra).

---

## 4. Information architecture

One new layer at the top. Nothing below it moves.

```
Organization (agency)              ← NEW  (e.g. Yuvabe Studios, external agencies)
├── Users (exactly 1 per org in the pilot)   ← NEW (Supabase Auth)
└── Clients (the agency's client brands)     ← existing table + org_id
    └── Canvases → Nodes → versions / edges / generations / KB   ← untouched
```

* **Organization** is the tenant and the isolation boundary. Every access check reduces
  to one question: *does this row's client belong to the caller's org?*
* **Client** keeps its existing meaning (a brand workspace). Because every table already
  FKs up to `clients` (single ownership tree, cascade deletes), adding `clients.org_id`
  gives every row in the system an org by inheritance — no other table changes.
* **Canvas** remains the project unit, per the MVP PRD.

---

## 5. Users & login

### Login

* **Supabase Auth, email + password, invite-only.** No self-serve signup: the operator
  (Yuvabe) creates each org and its user via a **seed script**. Password reset comes with
  Supabase Auth.
* Next.js middleware guards every page and API route: no session → `/login`.
  Webhook/cron routes keep their existing shared-secret auth (unchanged).

### Identity: the D29 seam gets its real source

The soft-identity gate ("who are you?" → localStorage) is **replaced by login**, exactly
as D29 reserved:

* A `profiles` row (per user) carries `display_name` and `role` (`senior | designer`).
* `useIdentity()` swaps its source from localStorage to the session/profile — its call
  sites do not change. The identity chip becomes the logged-in user (+ sign out).
* `node_versions.operator` / `approved_by` keep their existing text shape, now stamped
  from the profile's display name — trustworthy attribution without a data migration.
  Promoting them to `user_id` FKs stays backlog (F1).
* Role remains **cosmetic** (senior sees the Approve control) — flag, not RBAC (D29).

### Concurrency

The D33 single-writer canvas lock is unchanged — it is per-tab, not per-person, and
composes with login (the banner name now comes from the profile).

---

## 6. Functional requirements

### 6.1 Schema (one migration)

| Table | Shape |
| :---- | :---- |
| `organizations` | `id`, `name`, `slug`, `created_at` |
| `profiles` | `user_id` PK → `auth.users`, `org_id` → organizations, `display_name`, `role` (`senior \| designer`) |
| `clients` | + `org_id` → organizations (not null after backfill). The existing `drive_root_folder_id` (from the Drive-folder feature) doubles as the Drive tenancy boundary — §7 |

`profiles` is membership-shaped: multi-seat later = insert more rows, no schema change.

### 6.2 Enforcement — server-side, at the existing chokepoints

The service-role server client stays. Isolation is enforced in app code where all data
access already funnels:

* **Session → org resolution** once per request (helper alongside `route-helpers.ts`).
* **`withClient`** (all `/api/clients/[id]/*` routes) additionally verifies
  `client.org_id === caller.org_id` → 404 on mismatch (404, not 403 — don't confirm
  existence of other orgs' resources).
* **Deeper routes** (`/api/nodes/[id]/*`, `/api/canvas/[id]/*`, canvases, the eval
  surfaces (`/eval/[canvasId]`, `/api/eval-bootstrap`), and server actions) walk their
  existing ownership chain (node → canvas → client) — already implemented for storage
  paths (`resolveOwnership`) — and apply the same org check.
* ~~**`/api/ingest-image`** (reference-clipper ingest) loses its deliberate D14 openness:
  session required, and its slug-resolved client gets the same org check.~~
  **No longer applicable (D82, 2026-07-28)** — the reference clipper was retired and
  `/api/ingest-image` deleted. **The browser-extension write path is now
  `moodboard-extension/` → the open `/api/moodboards/*` routes (D81)**, which inherit this
  requirement: session required, and the board's client gets the same org check. Note the
  moodboard surface is *larger* than the old single ingest route — `GET /api/moodboards`
  (the picker index) currently enumerates **every client and board across the platform**, so
  it needs org-scoping, not just a session gate.
* **List queries** (clients home page) filter by `org_id`.

### 6.3 Closing the browser-side leaks

* **RLS on exactly two tables** — `generations` and `client_kb_jobs`, the only tables the
  browser reads (realtime status). Policy: row's org (via its client chain) = the
  authenticated user's org. The browser Supabase client authenticates with the user's
  session, so realtime subscriptions only receive the caller's org's rows.
* All other tables stay RLS-off (never exposed to the browser; service-role only).

### 6.4 Migration & onboarding

* **Migration:** create the Yuvabe org → backfill `clients.org_id` → create the first
  user(s) → set `org_id` not-null.
* **Onboarding a new agency (repeatable):** run seed script (org + user) → send
  credentials → agency creates its own clients/KBs in-app. No redeploy.

---

## 7. Data & artifact inventory — everything, and how it's scoped

Every artifact the app stores or serves, with its pilot scoping. Rule of thumb: **rows
scope via the FK tree; files scope via the server-derived `clients/{clientId}/…` path;
anything platform-shared must be deliberate and flow downward only (§8).**

| Artifact | Lives | Org-scoped how (pilot) |
| :---- | :---- | :---- |
| Client brands, canvases, nodes, edges, version history, generation jobs | Postgres (single FK tree) | `clients.org_id` + chokepoint checks (§6.2) |
| Brand KB (documents, versions, jobs, brand images) | Postgres (`client_kb_*`, `client_brand_images`) + GCS `clients/{id}/kb-documents/…`, `…/brand-images/…` | FK tree + client-prefixed paths |
| Uploaded reference files (File node `.txt`/images), pasted clipboard images, Draw-node sketch PNGs, inline Prompt-node files | GCS `clients/{id}/canvases/{cid}/nodes/{nid}/files/…` | Path is **server-derived** via `resolveOwnership(nodeId)` — never client-supplied |
| Generated images / videos / edit composites | GCS `…/nodes/{nid}/image-gen\|video-gen/…` | Same server-derived path |
| Client logos | GCS `clients/{id}/logo/…` | Client-prefixed path |
| Moodboard captures (browser extension) — *replaced reference-clipper ingests, D81/D82* | `moodboard_items` rows hold **URLs only** (no bytes) until an item is dragged onto a canvas, at which point it takes the same node-file path as uploads | Open `/api/moodboards/*` routes go behind session + org check (§6.2). **`GET /api/moodboards` needs org-scoping specifically** — it enumerates all clients + boards platform-wide today |
| **Drive reference gallery** | **Google Drive, via one platform refresh token (= Yuvabe's account)** | The shipped per-client root (**`clients.drive_root_folder_id`**) becomes the tenancy boundary: `/api/drive/browse` + file/thumbnail proxies are session-guarded and **server-constrained to that root's subtree** (they are obscurity-gated today); the **folder picker** (`/api/drive/folders` — browses the whole platform Drive by design) is **restricted to Yuvabe's org**, so agency roots are set by Yuvabe. `null` root = no gallery. Folder **ID**, never name-matching |
| `image-proxy` streams | No storage — streams GCS bytes for canvas readback | Requires session; only relays URLs the caller already holds (capability-URL risk class, §10) |
| Platform prompts / master-control schemas | Code (`src/prompts/*` etc.) | Platform scope by design — ships to all orgs, downward only (§8) |
| Identity | Was localStorage → becomes the Supabase session + `profiles` row | Per-user, per-org |
| Device-local UI state (canvas viewport prefs etc.) | localStorage | Non-sensitive, device-local — out of scope |

Webhook/cron routes (`/api/webhooks/*`) stay shared-secret server-to-server calls that
act on rows by id; they carry no user session and need no org context.

---

## 8. Learning scopes — what may cross the org boundary

Three scopes of prompts/learnings exist conceptually. Only knowledge flows **downward**;
tenant data never flows up or sideways.

| Scope | Lives | Writable by | Readable by |
| :---- | :---- | :---- | :---- |
| **Platform** (common system prompts, domain playbooks) | Code/config (`src/prompts/*`) | Yuvabe only, hand-curated | All orgs (it ships with the app) |
| **Segment** (e.g. DTC learnings) — *future* | A tag on clients + platform-curated artifacts, when needed | Yuvabe only | All orgs in that segment |
| **Client** (Brand KB, client instruction set) | `client_kb_*` tables | That org | That org only |

**Principle (to be recorded as a D-decision):** shared pools are platform-authored by
hand — generalized by a human, never by a pipeline reading tenant data. "Do you learn
from our data?" → **no.** No schema is built for the segment layer in the pilot.

---

## 9. Billing, credits & limits — org-level metering with a hard cap

**Pilot goal: monitor credit usage per org while the pilot runs** — know what each
agency is consuming, spot runaway cost early, and have the numbers to invoice from.
Generation cost is **already metered**: every succeeded generation writes its provider
cost (USD) to `generations.credits_consumed`, and `src/lib/pricing.ts` owns rates. The
pilot adds the org dimension, visibility, and a ceiling — **no payments in-product**;
Yuvabe invoices off-platform from the metered numbers.

* **Credit = 1 USD of provider cost** (the existing `credits_consumed` unit). Pricing
  markup is a business decision outside the app.
* **`organizations.monthly_credit_limit`** (numeric, `null` = unlimited — Yuvabe's own
  org). Set/changed via the seed script or SQL; no admin UI.
* **Usage is derived on read** (per D9 — no ledger table, no cron): month-to-date usage =
  `SUM(credits_consumed)` over succeeded generations in the org's client tree for the
  current calendar month. Resets implicitly at month boundary.
* **Hard cap at the generate chokepoint.** Before any model-running request that writes a
  `generations` row (image, video, prompt), a `assertOrgWithinBudget(orgId)` check
  rejects with a clear "monthly generation limit reached" error when usage ≥ limit.
  Blocks **generation only** — viewing, editing, parsing, and approvals keep working.
* **Monitoring — org-facing:** a small month-to-date readout (`used / limit`) on the
  clients home page, reusing the existing cost-route pattern. No charts, no per-canvas
  breakdown (the per-canvas cost route already exists for that).
* **Monitoring — Yuvabe-facing:** a DB **view** (`org_credit_usage`: org, month, usage,
  limit) created in the migration, so cross-org consumption is one query in the Supabase
  dashboard. No admin UI in the pilot.
* **Accepted rounding:** an in-flight job that started under the cap may finish over it
  (video especially). The cap is a cost-control guardrail, not an exact meter.

---

## 10. Accepted risks (pilot)

| Risk | Why accepted | Fix (step 2) |
| :---- | :---- | :---- |
| **GCS files remain public URLs.** Paths embed UUIDs, so they are unguessable capability links — but anyone holding a URL can fetch the bytes, and possession of a URL grants indefinite access. | Signed URLs / a proxy touch every render path of every image and video; too much surface for the pilot. Exposure requires a leaked URL, not a browsable listing. | Signed URLs or an authenticated media proxy |
| **No RLS on service-role tables.** A bug in an app-layer check could cross orgs. | All access already funnels through two chokepoints; pilot scale makes audit feasible. | RLS as defense-in-depth |
| **Approval role is cosmetic** (spoofable within an org). | Intra-org trust is acceptable for a 1-user org by definition. | Enforced RBAC with multi-seat |

---

## 11. Out of scope (the 20%)

* Multiple users per org (schema-ready; not built) · invites UI · org-admin UI
* Enforced RBAC (role stays cosmetic, D29)
* Self-serve signup · SSO / Google login
* In-product payments (Stripe), invoices, credit top-ups, plans/tiers
* Usage alerts/emails · per-user or per-client quotas · billing admin UI
* Signed file URLs / media proxy (step 2)
* RLS beyond the two realtime tables
* Org-level learning layer; segment-layer schema
* Agencies connecting their own Drive accounts, or using the folder picker themselves
  (pilot: the picker is Yuvabe-org-only; an agency-shared folder is wired by Yuvabe
  setting that client's `drive_root_folder_id`)
* Client-facing / reviewer access (F4) · cross-org sharing of anything
* Promoting `operator`/`approved_by` text → `user_id` FKs (historical rows stay text)

---

## 12. Success criteria

With two orgs seeded (Yuvabe + a test agency):

1. Logging in as agency user shows **only** that org's clients; Yuvabe's are absent from
   every list, page, and API response.
2. Direct API calls (curl with agency session) against Yuvabe client/canvas/node IDs
   return **404** — reads and writes alike.
3. Realtime: the agency browser session receives generation/KB-job events **only** for
   its own org's rows.
4. The existing Yuvabe workflow (per the MVP PRD §19) works exactly as before after
   migration — same clients, canvases, history.
5. Unauthenticated visits to any page or API route redirect to `/login` / return 401.
6. Onboarding agency #2 requires only: seed script + credentials.
7. **Credits:** the org's home page shows month-to-date usage that matches the sum of
   its succeeded generations; the `org_credit_usage` view reports every org's month
   usage; an org at its limit gets a clear "limit reached" error on generate — while
   viewing, editing, and approving keep working.
8. **Artifacts:** the agency's uploaded and generated files land only under its own
   clients' storage prefixes; the Drive gallery is absent for clients without a
   configured root; Drive browse/file/thumbnail requests outside a client's configured
   subtree are refused; and the folder picker is absent for agency users.

---

## 13. Staging

| Step | Contents | Trigger |
| :---- | :---- | :---- |
| **1 — Pilot (this PRD)** | Login, orgs, `clients.org_id`, chokepoint enforcement (incl. eval + the open `/api/moodboards/*` routes — was `ingest-image`, deleted by D82), RLS on 2 realtime tables, Drive subtree containment + Yuvabe-only folder picker, org credit limit + usage readout + `org_credit_usage` view, migration + seed script | First external agency |
| **2 — Hardening** | Signed URLs / media proxy; RLS defense-in-depth on remaining tables; usage alerts | Pilot feedback / sensitive-asset customer |
| **3 — Multi-seat & billing** | Invites, >1 user per org, enforced roles, `operator` → `user_id` promotion; in-product billing (plans/top-ups) if pilots convert | An agency asks for a second seat / paid conversion |

---

## 14. Decisions recorded (ADR log §7)

* **D42** — Organizations as the tenant layer above `clients`; one FK, tree inheritance.
* **D43** — Supabase Auth (email+password, invite-only); replaces the D29 localStorage
  source behind `useIdentity()`; supersedes D14's "no auth" posture.
* **D44** — App-layer org enforcement at chokepoints with the service-role client; RLS
  only on browser-exposed tables. (Rejected: RLS-everywhere rewrite; per-agency deploys.)
* **D45** — Learning scopes: platform/segment/client; downward flow only; shared pools
  are hand-curated, never pipeline-fed from tenant data.
* **D46** — Pilot accepts public GCS capability URLs; signed access is step 2.
* **D47** — Org-level credits: usage derived on read from `credits_consumed` (no ledger,
  no cron — extends D9); monthly hard cap at the generate chokepoint; `org_credit_usage`
  view for cross-org monitoring; invoicing stays off-platform.
* **D48** — Drive gallery multi-tenancy hardening: the shipped
  `clients.drive_root_folder_id` becomes the tenancy boundary — browse + file/thumbnail
  fetches server-constrained to its subtree; the folder picker is Yuvabe-org-only;
  `null` root hides the gallery; folder ID, never name-matching. `ingest-image` loses
  its D14 openness and joins the org-checked chokepoints. (Rejected: name-matching;
  per-org Drive OAuth.) *(Amended 2026-07-28 — **D82** deleted `/api/ingest-image`; the
  open `/api/moodboards/*` routes (**D81**) inherit that chokepoint clause in its place.
  Decision text left intact as the record of what was decided on 2026-07-15.)*
