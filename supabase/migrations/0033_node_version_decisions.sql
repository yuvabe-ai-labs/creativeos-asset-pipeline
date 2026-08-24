-- D173: append-only log of every real approve/reject decision, kept ALONGSIDE (never
-- instead of) node_versions' own current-state columns. D159's review_queue_items view,
-- and everything built on it (counts, the review drawer, the navbar inbox), reads only
-- those columns and is untouched by this table.
--
-- D174: only 'approved'/'changes_requested' are logged. A reset to 'pending' ("Undo")
-- clears current state so a version can be re-decided; it is not itself an event worth a
-- history row.

create table node_version_decisions (
  id                 uuid primary key default gen_random_uuid(),
  version_id         uuid not null references node_versions(id) on delete cascade,
  org_id             uuid not null references organizations(id),
  status             text not null check (status in ('approved', 'changes_requested')),
  note               text,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decided_at         timestamptz not null default now()
);

-- Every read of this table asks "every decision for these version ids, newest first" —
-- src/lib/db/decisions.ts's getDecisionsByVersionIds.
create index node_version_decisions_version_idx
  on node_version_decisions (version_id, decided_at desc);

-- R2.4/R11.5 precedent: migration 0030's "org isolation" policy on node_versions, same
-- shape. Writes go through the service-role client inside setVersionApprovalAction, which
-- already gates on the caller's resolved role (D166) — no write policy needed.
alter table node_version_decisions enable row level security;

create policy "org isolation" on node_version_decisions for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );
