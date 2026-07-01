-- D29: maker-checker approval flag on the uniform version envelope (D4), so every
-- node type gets sign-off at once. Flag only — no gating/triggering/enforcement yet
-- (see docs/superpowers/specs/2026-06-29-approval-flag-design.md).
--
-- approval_status: the sign-off gate (distinct from `decision`, the D22 quality signal).
-- approved_by: soft identity of the CHECKER (name now; upgrades to a user_id FK with auth).
-- approved_at: when the current status was set.
-- The existing `note` column carries "changes requested" feedback; the existing `operator`
-- column now records the MAKER (filled at generation time).

alter table node_versions
  add column approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'changes_requested')),
  add column approved_by text,
  add column approved_at timestamptz;

-- NOT NULL DEFAULT backfills existing rows to 'pending' automatically; no data step needed.
