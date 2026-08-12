-- Stage 4 impersonation audit trail (D81). Append-only: one row per event
-- (session_started / elevated_mode_entered / write_action / session_ended), never
-- updated or deleted. No end-user read path exists or is planned — this is a support/
-- compliance trail, not app data — so RLS is enabled with zero policies, same as
-- org_memberships' Stage-1 pattern: the app's own access goes through the service-role
-- client (createServerSupabase()), which bypasses RLS regardless. This only closes the
-- direct-REST path, matching 0017_default_deny_rls.sql's rationale for every other table.
--
-- Verification queries (run after migration applies):
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name = 'impersonation_audit_log';
-- -- expect 1 row
--
-- select tablename, rowsecurity from pg_tables where tablename = 'impersonation_audit_log';
-- -- expect rowsecurity = true
--
-- select policyname from pg_policies where tablename = 'impersonation_audit_log';
-- -- expect 0 rows (zero policies, deliberate — service-role only)

create table impersonation_audit_log (
  id             uuid primary key default gen_random_uuid(),
  operator_id    uuid not null references auth.users(id),
  target_org_id  uuid not null references organizations(id),
  event_type     text not null check (event_type in (
                   'session_started', 'elevated_mode_entered', 'write_action', 'session_ended'
                 )),
  detail         jsonb,
  occurred_at    timestamptz not null default now()
);

create index impersonation_audit_log_operator_idx on impersonation_audit_log(operator_id);
create index impersonation_audit_log_target_org_idx on impersonation_audit_log(target_org_id);

alter table impersonation_audit_log enable row level security;
