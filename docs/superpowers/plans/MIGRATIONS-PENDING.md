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

---

## After applying the batch

Run the verify queries for each migration above, then work the M1 Acceptance checklist in
`2026-08-21-internal-approval-m1.md` — it is written as the post-migration pass and is not
runnable before this point.

Then delete this file. It tracks a temporary state, and a stale "pending" list is worse
than none.
