-- D537: a record-only row (D532) logs a provider call that charges no credits. Many of those
-- calls (Copilot, KB extraction, website research) belong to no node, avatar or script.
alter table generations drop constraint if exists generations_owner_check;
alter table generations
  add constraint generations_owner_check
  check (node_id is not null or avatar_id is not null or script_id is not null or record_only);
