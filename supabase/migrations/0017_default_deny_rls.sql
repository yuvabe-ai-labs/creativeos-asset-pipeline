-- URGENT: closes a live exposure. Every one of these tables had RLS disabled with the
-- anon/authenticated roles' default Supabase grants still in place — meaning anyone with
-- the public anon key (embedded in every page the site serves) could SELECT/INSERT/
-- UPDATE/DELETE/TRUNCATE any row directly via Supabase's REST API, with NO login
-- required, completely bypassing proxy.ts, the DAL, withClient/withCanvas/withNode, and
-- every isolation mechanism built in Stage 1/2A/2B. Confirmed via
-- information_schema.role_table_grants on staging, 2026-07-23.
--
-- Fix: enable RLS with ZERO policies on each. This is a default-deny, not a set of
-- per-org policies to design/maintain — the app's own real DB access always goes
-- through the service-role client (createServerSupabase()), which bypasses RLS
-- entirely regardless of policies. Nothing in the app changes. This only removes the
-- direct-REST-API path that nothing was ever supposed to use.
--
-- org_id-bearing tables (canvases, client_kb_jobs, generations) already got RLS with a
-- real org-scoped policy in 0014 — this migration is for everything else that was still
-- wide open.

alter table clients enable row level security;
alter table nodes enable row level security;
alter table node_versions enable row level security;
alter table edges enable row level security;
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table org_memberships enable row level security;
alter table client_brand_images enable row level security;
alter table client_kb_documents enable row level security;
alter table client_kb_versions enable row level security;
