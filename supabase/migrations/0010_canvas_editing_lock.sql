-- D33: pessimistic single-writer canvas lock. One SESSION (a per-tab uuid, not a
-- person) edits a canvas at a time; the holder heartbeats and a lapsed lock is
-- stealable. See docs/superpowers/specs/2026-07-01-canvas-pessimistic-lock-design.md.

alter table canvases
  add column editing_session_id  uuid,
  add column editing_name        text,      -- holder's soft-identity name, for the banner
  add column editing_heartbeat_at timestamptz;

-- Atomic acquire / stale take-over in ONE statement (no read-then-write race).
-- Claims the lock iff it is free, already ours, or stale. Returns true when acquired.
create or replace function acquire_canvas_lock(
  p_canvas_id uuid,
  p_session_id uuid,
  p_name text,
  p_stale_seconds int
) returns boolean
language plpgsql
as $$
begin
  update canvases
     set editing_session_id  = p_session_id,
         editing_name        = p_name,
         editing_heartbeat_at = now()
   where id = p_canvas_id
     and (editing_session_id is null
          or editing_session_id = p_session_id
          or editing_heartbeat_at < now() - make_interval(secs => p_stale_seconds));
  return found; -- FOUND is true iff the UPDATE affected a row
end;
$$;
