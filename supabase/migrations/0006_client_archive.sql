-- Client soft delete (archive). NULL = active, timestamp = archived.
-- Reversible: unarchive sets archived_at back to NULL. No data is destroyed.
alter table clients add column archived_at timestamptz;

-- Supports both list filters: `archived_at is null` (active) and
-- `archived_at is not null order by archived_at desc` (archived tab).
create index clients_archived_at_idx on clients (archived_at);
