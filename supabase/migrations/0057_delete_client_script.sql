-- supabase/migrations/0057_delete_client_script.sql
-- Delete a script for good (D384, spec 2026-10-19-delete-script-design.md). Supersedes D360's
-- archive-only delete for unwritten scripts. A script is erased with everything that cascades from
-- it (copilot chat, panel takes and picks, their generations, review rows), unless something still
-- depends on it. Checked in this order, the first that applies wins:
--   'has_canvas' a canvas was started from it (D372's link)
--   'shared'     it has a client review link (made on the first share; it never expires)
--   'drawing'    a panel draw is under way: erasing mid-draw would orphan the charge and refund a
--                draw the provider was already paid for. A take still 'running' after the panel
--                route's maxDuration (300 s) is dead, so it never blocks for good.
-- Storage is never touched: canvases reference panel image files directly (Fan out, gallery drags,
-- frozen Script-node storyboards), so the files stay (spec §3 "What is kept").
-- A script D360 already archived is 'not_found': it stays hidden, as before.

create or replace function delete_client_script(p_client_id uuid, p_script_id uuid)
returns text
language plpgsql
as $$
begin
  -- The row lock comes before the checks. A concurrent canvas, review or take insert takes
  -- FOR KEY SHARE on this row for its foreign-key check, so it queues behind this delete (and
  -- then fails: the script is gone) or this delete queues behind it (and then sees it). Never
  -- "script gone, canvas unlinked".
  perform 1
     from client_scripts
    where id = p_script_id and client_id = p_client_id and archived_at is null
      for update;
  if not found then
    return 'not_found';
  end if;

  if exists (select 1 from canvases where source_script_id = p_script_id) then
    return 'has_canvas';
  end if;
  if exists (select 1 from script_reviews where script_id = p_script_id) then
    return 'shared';
  end if;
  if exists (
    select 1 from script_panel_takes
     where script_id = p_script_id
       and status = 'running'
       and created_at > now() - interval '5 minutes'
  ) then
    return 'drawing';
  end if;

  delete from client_scripts where id = p_script_id;
  return 'deleted';
end;
$$;
