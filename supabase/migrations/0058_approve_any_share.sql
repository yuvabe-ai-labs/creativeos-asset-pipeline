-- supabase/migrations/0058_approve_any_share.sql
-- D385: the client may approve any share, not only a full one (supersedes D350's "Approve only on
-- a full share"). Same function as 0054 with the scope check removed; every other check stays, in
-- the same order: 'not_found', 'stale' (a newer version exists), 'already' (a second tap: no
-- second line), 'not_in_review'. 'ok' moves the script to Approved and records who.

create or replace function script_review_approve(
  p_review_id uuid,
  p_version_number int,
  p_actor_name text
) returns text
language plpgsql
as $$
declare
  v_script_id uuid;
  v_stage text;
  v_latest int;
begin
  select script_id into v_script_id from script_reviews where id = p_review_id;
  if v_script_id is null then
    return 'not_found';
  end if;
  select stage into v_stage
    from client_scripts
   where id = v_script_id and archived_at is null
     for update;
  if v_stage is null then
    return 'not_found';
  end if;
  select number into v_latest
    from script_review_versions
   where review_id = p_review_id
   order by number desc
   limit 1;
  if v_latest is null or v_latest <> p_version_number then
    return 'stale';
  end if;
  if v_stage = 'approved' then
    return 'already';
  end if;
  if v_stage <> 'in_review' then
    return 'not_in_review';
  end if;
  update client_scripts
     set stage = 'approved', approved_at = now(), updated_at = now()
   where id = v_script_id;
  insert into script_review_events (script_id, kind, version_number, actor_kind, actor_name)
  values (v_script_id, 'approved', p_version_number, 'client', p_actor_name);
  return 'ok';
end;
$$;
