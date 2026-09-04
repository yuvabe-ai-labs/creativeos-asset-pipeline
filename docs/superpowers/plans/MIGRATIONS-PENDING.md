# Migrations pending application — internal approval workflow

**Operator decision (2026-08-21):** migrations for this feature are written and committed as
their tasks land, but applied to the database in **one batch at the end**, not per task.

Until the batch runs, treat the schema as if applied. Unit tests, lint and typecheck all
pass without it (they mock Supabase and the query builder is untyped over column names).
**Manual browser verification will fail** with `column "..." does not exist` — that is the
pending migration, not a bug in the code. Do not work around it.

Apply through the Supabase SQL editor (paste + Run), in this order. There is no
`supabase db push` in this project.

---

## Pending

- [ ] **`0030_approval_workflow.sql`** — M1
      `node_versions.org_id` + 3-hop backfill + BEFORE INSERT trigger + `(org_id,
      approval_status)` index; `org isolation` SELECT policy; `supabase_realtime`
      membership; `operator_user_id` / `approved_by_user_id`.
      Verify queries: `docs/auth-production-migration.md` § "Migration 0030".
      **Blocks:** approval enforcement, maker attribution, all M2 realtime.

- [ ] **`0031_review_queue.sql`** — M2
      `review_queue_items` view + `org_review_counts(p_org_id)` RPC.
      **Depends on 0030** (selects `node_versions.org_id` and `operator_user_id`) —
      apply in order. Both statements are `create or replace`, so it is safe to re-run.
      Verify queries: `docs/auth-production-migration.md` § "Migration 0031".
      **Blocks:** every pending count, the review drawer, the navbar inbox.

- [x] **`0035_review_annotations.sql`** — D209–D217 — **APPLIED 2026-09-04**
      `node_version_annotations` table + org-isolation RLS. **No storage bucket** (D217):
      overlay and frame PNGs go to GCS through `src/lib/storage`, like every other
      generated asset, so `mask_path`/`frame_path` are GCS object paths.
      Feature: review annotations (region + note feedback on a changes_requested decision).

- [x] **`0036_annotation_bounds.sql`** — D218 (supersedes D216) — **APPLIED 2026-09-04**
      Adds nullable `bounds jsonb` to `node_version_annotations`. **Depends on 0035.**
      Without it, stored pins stack at the media's left edge instead of sitting on the
      region they label. Pure additive `alter table` — safe to run on live data; rows
      written before it keep the stack fallback.

- [x] **`0037_annotation_no_stored_frame.sql`** — D219 — **APPLIED 2026-09-04**
      Relaxes 0035's CHECK so `kind='video-frame'` no longer requires `frame_path`.
      **Depends on 0035.** Without it, EVERY video annotation insert fails the constraint.
      Drops and recreates one named constraint — verify the name is
      `node_version_annotations_check` first (`\d node_version_annotations`); it is the
      auto-generated name for 0035's single table-level check.

---

## Status: all three milestones are code-complete (2026-08-23)

M1, M2 and M3 are all implemented and committed. **Both migrations below are still
unapplied**, which is the only thing standing between the branch and a working feature.

## After applying the batch

1. Apply `0030`, then `0031`, in that order — 0031's view selects columns 0030 creates.
2. Run the verify queries for each (see `docs/auth-production-migration.md`).
3. Work the acceptance checklists, which are all written as post-migration passes:
   - `2026-08-21-internal-approval-m1.md` § M1 Acceptance — seats, enforcement, attribution
   - `2026-08-21-internal-approval-m2.md` § M2 Acceptance — counts and live updates
   - `2026-08-21-internal-approval-m3.md` § M3 Acceptance — drawer, lock, navbar
4. Together those cover PRD §7's eight success criteria.

**Until they are applied**, every surface that reads a count, the drawer, and the navbar
inbox will error with `relation "review_queue_items" does not exist` or
`column "org_id" does not exist`. That is this file, not a bug — do not work around it.

Then delete this file. It tracks a temporary state, and a stale "pending" list is worse
than none.
