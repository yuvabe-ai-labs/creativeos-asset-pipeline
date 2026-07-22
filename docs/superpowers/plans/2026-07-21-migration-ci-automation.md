# Migration CI Automation — Implementation Plan (PARKED — implement later)

> **STATUS: PARKED (2026-07-21).** Deferred by decision — not the current step. Stage 1 (1A→1D)
> proceeds first with **manual migration application via the Supabase dashboard SQL editor**, as
> written in the 1A plan. Pick this plan up afterward to remove the manual step. Nothing here is
> blocking; the tasks and gotchas below are captured so the work is ready to resume as-is.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop applying migrations by hand. Adopt the Supabase CLI + a GitHub Actions workflow so merging to `staging` auto-applies pending migrations to the staging database, and merging to `main` applies them to production behind a manual approval gate.

**Architecture:** The repo's `supabase/migrations/NNNN_*.sql` files are already the Supabase CLI's format. CI uses `supabase db push --db-url <secret>` — no project linking, no committed config; the target DB is chosen by which branch was merged. Applied migrations are tracked in each database's `supabase_migrations.schema_migrations` table, so only new files run and nothing double-applies. Two separate Supabase projects (staging + production); production is gated by a GitHub Environment with a required reviewer.

**Tech Stack:** Supabase CLI, GitHub Actions, PostgreSQL (Supabase). Two projects.

**Parent:** `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md` (runs before 1A). **Decision to record:** ADR log.

## Global Constraints

- **DB connection strings are secrets — never commit them.** They contain the database password. GitHub Actions secrets + local untracked use only.
- **Use the direct connection or *session* pooler (port 5432)** for migrations — NOT the transaction pooler (port 6543), which doesn't support all migration statements. Get it from Supabase dashboard → Project Settings → Database → Connection string.
- **Migrations are forward-only and reviewed in PR.** CI applies; humans review the SQL before merge. Destructive changes still get the guard pattern used in 0013.
- **Baseline is one-time, per environment.** The existing hand-applied `0001`–`0011` must be marked applied on both DBs before the first automated push, or CI will try to re-run them.
- **Verify CLI specifics during execution, don't assume.** Exact flag names (non-interactive confirm) and how the CLI treats the numeric version scheme are confirmed by a dry run in Task 1 — this plan flags where.

## Steps are marked **[Claude]** (I do it — files, commits) or **[You]** (dashboard/secret/CLI-against-your-DB actions I can't reach; paste results back).

## File Structure

**New / changed files**
| File | Responsibility |
|---|---|
| `package.json` | Add `supabase` devDependency + `db:push` helper scripts |
| `supabase/migrations/0008_touch_canvas_updated_at.sql` → renamed | Resolve the duplicate `0008` version |
| `.github/workflows/db-migrate.yml` | The migration workflow (staging auto, prod gated) |
| ADR log `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | Record the decision (D86) |
| `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md` | Add this prerequisite row + note 1A's apply mechanism change |

---

## Task 1: Install the Supabase CLI locally + observe current remote state

**Files:**
- Modify: `package.json`

- [ ] **Step 1 [Claude]: Add the CLI + helper scripts**

Run: `npm install --save-dev supabase`

Then add to `package.json` `scripts` (these read the DB URL from an env var so no secret is ever hardcoded):

```json
"db:push:staging": "supabase db push --db-url \"$STAGING_SUPABASE_DB_URL\"",
"db:migrations": "supabase migration list --db-url \"$STAGING_SUPABASE_DB_URL\""
```

- [ ] **Step 2 [You]: Get the staging DB connection string**

Supabase dashboard → the **staging** project → Project Settings → Database → Connection string → **Direct connection** (or Session pooler, port 5432). It looks like:
`postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`
Export it in your shell (do not commit): `export STAGING_SUPABASE_DB_URL="postgresql://…"`

- [ ] **Step 3 [You]: Dry-run to observe state (this reveals the 0008 collision + what the remote knows)**

Run: `npx supabase migration list --db-url "$STAGING_SUPABASE_DB_URL"`
Paste the output back. Expected: a table of Local vs Remote migration versions. We are looking for:
  - whether the two `0008_*` files are flagged as a duplicate/collision, and
  - which versions the remote already has (likely none tracked, since all were applied by hand).

This output decides the exact rename in Task 2 and confirms the baseline set in Task 4.

- [ ] **Step 4 [Claude]: Commit the tooling**

```bash
git add package.json package-lock.json
git commit -m "chore(db): add supabase CLI + migration helper scripts"
```

---

## Task 2: Resolve the duplicate `0008` migration version

**Files:**
- Rename: `supabase/migrations/0008_touch_canvas_updated_at.sql` → `supabase/migrations/0014_touch_canvas_updated_at.sql`

**Interfaces:**
- Produces: a unique version per migration file (required for CLI tracking).

- [ ] **Step 1 [Claude]: Rename the collided file to a unique version**

The CLI derives the version from the numeric prefix, so `0008_touch...` and `0008_client_kb_jobs...` both parse to version `0008`. Give the touch-trigger file an unused unique number. It is already applied everywhere and will be baselined as applied (Task 4), so its ordinal position is cosmetic — `0014` avoids renumbering the applied `0009`–`0011`.

Run:
```bash
git mv supabase/migrations/0008_touch_canvas_updated_at.sql supabase/migrations/0014_touch_canvas_updated_at.sql
```

Add a header comment to the renamed file's top explaining the non-chronological number:
```sql
-- Renumbered from 0008 → 0014 to resolve a duplicate-0008 version when adopting the
-- Supabase CLI. Already applied to all environments; baselined as applied. Position is
-- historical-cosmetic only (see docs/superpowers/plans/2026-07-21-migration-ci-automation.md).
```

- [ ] **Step 2 [You]: Confirm the collision is gone**

Run: `npx supabase migration list --db-url "$STAGING_SUPABASE_DB_URL"`
Expected: no duplicate-version warning; local versions are all unique (`0001`–`0011`, `0014`, plus `0012`/`0013` once 1A lands).

> **If Step 1 of Task 1 showed the CLI rejects the numeric scheme entirely** (insists on 14-digit timestamps), STOP and raise it — the fallback is converting all versions to timestamp format, a larger change we'd plan separately. The dry run tells us; we don't guess.

- [ ] **Step 3 [Claude]: Commit**

```bash
git add supabase/migrations/
git commit -m "chore(db): renumber duplicate 0008 touch migration to 0014"
```

---

## Task 3: Create GitHub secrets + the production approval gate

**Files:** none (GitHub settings)

- [ ] **Step 1 [You]: Add repository secrets**

GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
  - `STAGING_SUPABASE_DB_URL` = the staging connection string (Task 1 Step 2)
  - `PRODUCTION_SUPABASE_DB_URL` = the **production** project's connection string (same place, prod project, port 5432)

- [ ] **Step 2 [You]: Create the gated production Environment**

GitHub repo → Settings → Environments → New environment → name it **`production`** → enable **Required reviewers** and add yourself (and anyone else who should approve prod migrations). Save.

This is what makes a merge to `main` *pause and wait for a click* before touching the prod database.

- [ ] **Step 3 [You]: Confirm**

Settings → Environments shows `production` with a required reviewer; Settings → Secrets shows both DB URL secrets. Reply "secrets + environment set" when done.

---

## Task 4: Baseline the existing migrations (one-time, both DBs)

**Files:** none (CLI against your databases)

**Interfaces:**
- Consumes: the unique-version set from Task 2.
- Produces: each database's `schema_migrations` history knows `0001`–`0011` + `0014` are already applied, so automation starts clean at `0012`.

- [ ] **Step 1 [You]: Baseline staging**

Mark every already-applied version as applied on staging (adjust the list to match Task 1's dry-run output):

```bash
npx supabase migration repair --status applied \
  0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0014 \
  --db-url "$STAGING_SUPABASE_DB_URL"
```
Then verify: `npx supabase migration list --db-url "$STAGING_SUPABASE_DB_URL"`
Expected: those versions show as applied on the remote; only `0012`/`0013` (once 1A is written) remain pending.

- [ ] **Step 2 [You]: Baseline production**

Same command with `export PRODUCTION_SUPABASE_DB_URL="…"` then:
```bash
npx supabase migration repair --status applied \
  0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0014 \
  --db-url "$PRODUCTION_SUPABASE_DB_URL"
```
Verify the same way. Expected: identical applied set on prod.

> Note: if the dry run in Task 1 showed the remote already tracks some versions, only baseline the ones it doesn't. Repairing an already-applied version is harmless (idempotent).

---

## Task 5: The migration workflow

**Files:**
- Create: `.github/workflows/db-migrate.yml`

- [ ] **Step 1 [Claude]: Write the workflow**

Create `.github/workflows/db-migrate.yml`:

```yaml
name: Database migrations

on:
  push:
    branches: [staging, main]
    paths: ["supabase/migrations/**"]
  workflow_dispatch: {} # allow manual runs too

jobs:
  staging:
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Push migrations to staging
        run: supabase db push --db-url "${{ secrets.STAGING_SUPABASE_DB_URL }}"

  production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production # ← required-reviewer gate; run pauses here for approval
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Push migrations to production
        run: supabase db push --db-url "${{ secrets.PRODUCTION_SUPABASE_DB_URL }}"
```

> **Verify during execution:** if `supabase db push` prompts for confirmation in CI (non-TTY), add its non-interactive flag to the `run:` line (check `supabase db push --help` — likely `--yes`). The Task 6 dry test surfaces this before it matters for prod.

- [ ] **Step 2 [Claude]: Commit**

```bash
git add .github/workflows/db-migrate.yml
git commit -m "ci(db): auto-apply migrations on staging; gated on production"
```

---

## Task 6: Record the decision + update the tracker

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append D86)
- Modify: `docs/superpowers/plans/2026-07-21-auth-stage-1-index.md`

- [ ] **Step 1 [Claude]: Append ADR D86**

Add to the ADR log (§7), after D83:

```markdown
### D86 — Migrations run through the Supabase CLI in CI; staging auto, production gated *(recorded 2026-07-21)*

**Decision.** Adopt the Supabase CLI over hand-applied SQL. A GitHub Actions workflow runs
`supabase db push` against the staging DB on merge to `staging` (automatic) and the production
DB on merge to `main` (behind a required-reviewer GitHub Environment). Two separate Supabase
projects; DB connection strings are Actions secrets. The pre-existing hand-applied 0001–0011
are baselined once per environment; the duplicate `0008` version is renumbered to `0014`.

**Why.** Removes manual, error-prone SQL-editor pasting and the "did I run prod?" risk; makes
migration state auditable and reproducible while keeping a human checkpoint before production.

**Rejected.** Running migrations at app boot (instance races, build-time DB access); a separate
migration tool (Drizzle/Prisma) when the repo already uses the CLI's file format; fully
automatic prod apply (no human gate for destructive changes).

**Originated →** `2026-07-21-migration-ci-automation.md`.
```

- [ ] **Step 2 [Claude]: Update the Stage 1 index tracker**

In `2026-07-21-auth-stage-1-index.md`, add a prerequisite row above 1A:
`| **1-0 (prereq)** | Migration CI automation (Supabase CLI + gated Actions) | Working; migrations now automated | 2026-07-21-migration-ci-automation.md | status |`
and add a note under it: once this lands, migration files are applied by **pushing the branch**, not dashboard paste — so 1A's apply steps become "commit → push to `staging` → CI applies → verify," and prod is reached later via the gated `main` merge.

- [ ] **Step 3 [Claude]: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md docs/superpowers/plans/2026-07-21-auth-stage-1-index.md
git commit -m "docs(db): record migration-CI decision (D86) + update Stage 1 tracker"
```

---

## Final verification

- [ ] `npx supabase migration list --db-url "$STAGING_SUPABASE_DB_URL"` shows a clean, unique version history with 0001–0011 + 0014 applied
- [ ] Same for production
- [ ] Both DB URL secrets + the `production` Environment (with reviewer) exist in GitHub
- [ ] `.github/workflows/db-migrate.yml` committed
- [ ] **Live pipeline test (happens naturally during 1A):** when 1A's `0012`/`0013` merge to `staging`, the Actions run applies them automatically; confirm via the run log + `migration list`. The first `main` merge will pause for your approval before applying to prod.

## Self-Review notes

- **"Automate on push, don't do prod by hand"** → Task 5 workflow: staging auto, prod gated; branch chooses the DB.
- **Existing hand-applied history** → Task 4 baseline (both envs), one-time.
- **Duplicate 0008 discovered** → Task 2 renumber to 0014; flagged, not hand-waved.
- **Honest uncertainties** (CLI numeric-version acceptance, non-interactive push flag) → surfaced as explicit dry-run/verify steps in Tasks 1, 2, 5, not assumed.
- **Reshapes 1A** → Task 6 Step 2 notes 1A now applies via branch push, not dashboard paste.
