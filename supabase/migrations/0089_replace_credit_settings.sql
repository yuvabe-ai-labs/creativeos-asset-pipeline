-- D549: replace a credit settings change that hasn't started, in one transaction, as
-- replace_ai_model_price (0088) does for prices. The Credits page saves a change on the IST day of a
-- scheduled one this way. Apply before the 5b code deploys; harmless before.

-- Deletes the scheduled row and inserts the new one, or neither. A row starting in the next 2 minutes
-- (or started) is refused by the where clause before the guard trigger (0087), with a message the app
-- maps to plain copy ("only credit settings that have not started can be replaced"). The table's own
-- checks (margin 0 to 200, step 1, 5 or 10, one row per start) still apply to the insert.
create or replace function replace_credit_settings(
  p_cancel_id uuid,
  p_effective_from timestamptz,
  p_margin_percent numeric,
  p_round_step integer,
  p_note text,
  p_created_by uuid
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  if p_effective_from is null or p_effective_from < now() - interval '60 seconds' then
    raise exception 'credit settings cannot start in the past';
  end if;
  delete from credit_settings
  where id = p_cancel_id and effective_from > now() + interval '2 minutes';
  if not found then
    raise exception 'only credit settings that have not started can be replaced';
  end if;
  insert into credit_settings (effective_from, margin_percent, round_step, note, created_by)
  values (p_effective_from, p_margin_percent, p_round_step, p_note, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function replace_credit_settings(uuid, timestamptz, numeric, integer, text, uuid) from public, anon, authenticated;
grant execute on function replace_credit_settings(uuid, timestamptz, numeric, integer, text, uuid) to service_role;
