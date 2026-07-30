-- Drops a pre-existing, unrecorded policy that silently defeated 0014's org-isolation
-- policy on generations. Not in any prior migration — likely a leftover from the
-- pre-auth era (D14, "whole app open"), never cleaned up when login was added.
-- qual = true, roles = {public}: unconditional read access for anyone with the public
-- anon key, including unauthenticated requests, bypassing the app entirely. Since
-- Postgres OR's permissive RLS policies together, this made 0014's "org isolation"
-- policy on generations functionally inert — satisfying either policy is enough.
drop policy if exists "anon_read_generations" on generations;
