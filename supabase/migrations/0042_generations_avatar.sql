-- A generation can belong to an avatar instead of a canvas node (D291). See
-- docs/superpowers/specs/2026-09-29-client-avatars-design.md §3.5 and §7.
--
-- The credit ledger, the monthly cap, the stuck-reservation sweep and the admin generations
-- table all key on `generations`, so Studio images join it rather than getting a second
-- ledger. Existing rows are untouched: every one already has a node_id.

alter table generations alter column node_id drop not null;

-- Cascade, mirroring node_id: an avatar only ever disappears when its client is deleted, and
-- its generations go with it. `set null` would leave a row owned by nothing and trip the
-- check below in the middle of that delete.
alter table generations
  add column if not exists avatar_id uuid references client_avatars(id) on delete cascade;

create index if not exists generations_avatar_id_idx on generations (avatar_id);

-- Every generation is owned by a node or an avatar.
alter table generations drop constraint if exists generations_owner_check;
alter table generations
  add constraint generations_owner_check check (node_id is not null or avatar_id is not null);
