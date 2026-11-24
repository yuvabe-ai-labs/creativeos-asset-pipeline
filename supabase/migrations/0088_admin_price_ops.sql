-- D549: the super admin's price and model operations from plan 5b. Replace a price that hasn't
-- started in one transaction, write a kind's model order in one statement, and this month's runs per
-- agency per model in one grouped query. Apply before the 5b code deploys; harmless before.

-- Deletes the future row of p_model_id and inserts the new one, or neither. The guard trigger from
-- 0076 still refuses to delete a started row; the where clause refuses first, with a message the app
-- maps to plain copy ("only a price that has not started can be replaced").
create or replace function replace_ai_model_price(
  p_cancel_id uuid,
  p_model_id text,
  p_effective_from timestamptz,
  p_lines jsonb,
  p_estimate jsonb,
  p_source_url text,
  p_note text,
  p_created_by uuid
) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  delete from ai_model_prices
  where id = p_cancel_id and model_id = p_model_id and effective_from > now();
  if not found then
    raise exception 'only a price that has not started can be replaced';
  end if;
  insert into ai_model_prices (model_id, effective_from, lines, estimate, source_url, note, created_by)
  values (p_model_id, p_effective_from, p_lines, p_estimate, p_source_url, p_note, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;

-- Writes sort_order 0..n-1 in the order given. p_ids must name every model of p_kind once; rows
-- whose order is already right are not written.
create or replace function reorder_ai_models(p_kind text, p_ids text[]) returns void
language plpgsql as $$
begin
  -- Two reorders of one kind at once run one after the other.
  perform 1 from ai_models where kind = p_kind for update;
  if coalesce(cardinality(p_ids), 0) = 0
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x)
     or cardinality(p_ids) <> (select count(*) from ai_models where kind = p_kind)
     or exists (
       select 1 from unnest(p_ids) as x
       where not exists (select 1 from ai_models m where m.id = x and m.kind = p_kind)
     ) then
    raise exception 'the order must name every model of this kind once';
  end if;
  update ai_models m
  set sort_order = (o.ord - 1)::integer
  from unnest(p_ids) with ordinality as o(id, ord)
  where m.id = o.id and m.sort_order is distinct from (o.ord - 1)::integer;
end;
$$;

-- D547's month stats (0085) per agency as well: one row per model per agency with runs that month.
-- Uses generations_created_at_idx from 0085.
create or replace function ai_model_month_runs_by_org(p_from timestamptz, p_to timestamptz)
returns table(model_id text, org_id uuid, org_name text, runs bigint, cost_usd numeric, credits numeric)
language sql stable
as $$
  select g.model_used as model_id,
         g.org_id,
         o.name as org_name,
         count(*) as runs,
         coalesce(sum(g.cost_usd), 0) as cost_usd,
         coalesce(sum(g.credits_charged), 0) as credits
  from generations g
  join organizations o on o.id = g.org_id
  where g.created_at >= p_from and g.created_at < p_to and g.model_used is not null
  group by g.model_used, g.org_id, o.name
$$;

-- Only the server (service role) calls these.
revoke execute on function replace_ai_model_price(uuid, text, timestamptz, jsonb, jsonb, text, text, uuid) from public, anon, authenticated;
revoke execute on function reorder_ai_models(text, text[]) from public, anon, authenticated;
revoke execute on function ai_model_month_runs_by_org(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function replace_ai_model_price(uuid, text, timestamptz, jsonb, jsonb, text, text, uuid) to service_role;
grant execute on function reorder_ai_models(text, text[]) to service_role;
grant execute on function ai_model_month_runs_by_org(timestamptz, timestamptz) to service_role;
