-- Restoring a version moved ONLY `nodes.active_version_id` (src/lib/db/versions.ts's
-- setActiveVersion). But the org Realtime channel every live surface subscribes to —
-- the badge, the senior's queue counts, the maker's inbox — listens on `node_versions`
-- (D159/D179). So a restore emitted no event at all: the restoring client patched its own
-- store and everyone else stayed stale until a reload. TC-106/TC-107.
--
-- This column gives setActiveVersion a row to touch on the newly-active version, which
-- emits the UPDATE those subscribers already handle. It is the EVENT CARRIER first and a
-- timestamp second — nothing reads it yet.
--
-- The default backfills existing rows to now() rather than their true last-write time.
-- That is deliberate and harmless: no consumer reads this as history, and a nullable
-- column would just push a null check onto every future reader.

alter table node_versions
  add column updated_at timestamptz not null default now();
