-- Forward-looking additions to generations, per explicit request — not backfilled for
-- existing rows (nullable), populated going forward only:
--   client_id: a closer join target than the node_id -> canvas -> client chain, for
--     future client-scoped generation queries.
--   output_snapshot: the completed output (image URL / video URL / prompt text) mirrored
--     directly onto the generations row, so it's readable without joining node_versions.
alter table generations add column client_id uuid references clients(id);
alter table generations add column output_snapshot text;
create index generations_client_id_idx on generations (client_id);
