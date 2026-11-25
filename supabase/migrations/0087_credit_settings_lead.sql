-- D548: a credit settings row can't be deleted in its last 2 minutes before it starts. Other servers
-- keep the old catalog for up to a minute, so a row that is about to start may already be in use.
-- Same trigger as 0086; only the delete check changes. The message keeps the 0086 text.
create or replace function credit_settings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'credit_settings rows are never edited; add a new row';
  end if;
  if old.effective_from <= now() + interval '2 minutes' then
    raise exception 'credit settings that have started cannot be deleted';
  end if;
  return old;
end;
$$;
