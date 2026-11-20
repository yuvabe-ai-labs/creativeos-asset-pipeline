-- Billing piece 3: Admin writes the catalog (spec 2026-11-21-plans-and-prices-design.md, D519).
-- Each function makes its change and its billing_log row in one transaction. Catalog and settings
-- changes belong to no agency, so billing_log.org_id becomes nullable.

alter table billing_log alter column org_id drop not null;

-- 21 November: Rs 100 to the dollar for planning and for margin checks; warn below 15%. The
-- margins are examples until the real prices are set. The 0068 row stays as history.
insert into billing_settings (inr_per_usd, plan_margin_pct, topup_margin_pct, min_margin_pct, note)
values (100, 20, 25, 15, 'Rs 100 to the dollar; warn below 15% (21 Nov). Margins are examples');

-- New pricing inputs: a new row, so the history stays.
create or replace function admin_save_billing_settings(
  p_inr_per_usd numeric,
  p_plan_margin_pct numeric,
  p_topup_margin_pct numeric,
  p_min_margin_pct numeric,
  p_actor uuid,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into billing_settings (inr_per_usd, plan_margin_pct, topup_margin_pct, min_margin_pct, created_by, note)
  values (p_inr_per_usd, p_plan_margin_pct, p_topup_margin_pct, p_min_margin_pct, p_actor, p_note)
  returning id into v_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (null, p_actor, 'settings', null,
          jsonb_build_object('inr_per_usd', p_inr_per_usd, 'plan_margin_pct', p_plan_margin_pct,
                             'topup_margin_pct', p_topup_margin_pct, 'min_margin_pct', p_min_margin_pct),
          p_note);
  return v_id;
end;
$$;

-- Add a plan or top-up pack (p_id null), or change its name, description, order or visibility.
-- Its kind never changes.
create or replace function admin_save_product(
  p_id uuid,
  p_kind text,
  p_name text,
  p_description text,
  p_sort integer,
  p_active boolean,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before billing_products%rowtype;
  v_id uuid;
begin
  if p_id is null then
    insert into billing_products (kind, name, description, sort, active)
    values (p_kind, p_name, p_description, coalesce(p_sort, 0), coalesce(p_active, true))
    returning id into v_id;

    insert into billing_log (org_id, actor_id, action, before, after, reason)
    values (null, p_actor, 'product', null,
            jsonb_build_object('product_id', v_id, 'kind', p_kind, 'name', p_name), null);
    return v_id;
  end if;

  select * into v_before from billing_products where id = p_id for update;
  if not found then
    return null;
  end if;

  update billing_products
     set name = p_name, description = p_description, sort = coalesce(p_sort, sort),
         active = coalesce(p_active, active), updated_at = now()
   where id = p_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (null, p_actor, 'product',
          jsonb_build_object('product_id', p_id, 'name', v_before.name, 'active', v_before.active),
          jsonb_build_object('product_id', p_id, 'name', p_name, 'active', coalesce(p_active, v_before.active)),
          null);
  return p_id;
end;
$$;

-- Add a price. With p_replaces, the old price (same product) is hidden and every live
-- subscription on it moves to the new price from its next payment, unless it already chose
-- another. Returns the new price and how many subscriptions moved.
create or replace function admin_add_price(
  p_product_id uuid,
  p_amount_minor bigint,
  p_list_amount_minor bigint,
  p_interval_months integer,
  p_credits numeric,
  p_credits_every_months integer,
  p_valid_days integer,
  p_replaces uuid,
  p_actor uuid,
  p_reason text
) returns table (new_price_id uuid, moved_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old billing_prices%rowtype;
  v_new uuid;
  v_moved integer := 0;
begin
  if p_replaces is not null then
    select * into v_old from billing_prices where id = p_replaces for update;
    if not found then
      raise exception 'admin_add_price: price % not found', p_replaces;
    end if;
    if v_old.product_id <> p_product_id then
      raise exception 'admin_add_price: a new price replaces one on the same product';
    end if;
  end if;

  insert into billing_prices (product_id, amount_minor, list_amount_minor, interval_months, credits, credits_every_months, valid_days)
  values (p_product_id, p_amount_minor, p_list_amount_minor, p_interval_months, p_credits, p_credits_every_months, p_valid_days)
  returning id into v_new;

  if p_replaces is not null then
    update billing_prices set active = false where id = p_replaces;

    update billing_subscriptions s
       set next_price_id = v_new, updated_at = now()
     where s.status <> 'ended'
       and ((s.price_id = p_replaces and s.next_price_id is null) or s.next_price_id = p_replaces);
    get diagnostics v_moved = row_count;
  end if;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (null, p_actor, 'price',
          case when p_replaces is null then null
               else jsonb_build_object('price_id', p_replaces, 'amount_minor', v_old.amount_minor, 'credits', v_old.credits) end,
          jsonb_build_object('price_id', v_new, 'product_id', p_product_id, 'amount_minor', p_amount_minor,
                             'credits', p_credits, 'interval_months', p_interval_months, 'moved', v_moved),
          p_reason);

  return query select v_new, v_moved;
end;
$$;

-- Hide a price from new purchases, or show it again. Current subscribers keep it.
create or replace function admin_set_price_active(
  p_price_id uuid,
  p_active boolean,
  p_actor uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was boolean;
begin
  select active into v_was from billing_prices where id = p_price_id for update;
  if not found or v_was = p_active then
    return false;
  end if;

  update billing_prices set active = p_active where id = p_price_id;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (null, p_actor, 'price_active',
          jsonb_build_object('price_id', p_price_id, 'active', v_was),
          jsonb_build_object('price_id', p_price_id, 'active', p_active), null);
  return true;
end;
$$;

-- Live subscriptions per price, for "agencies on this price" (one grouped query).
create or replace function billing_price_subscriber_counts()
returns table (price_id uuid, subscribers integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.price_id, count(*)::integer
    from billing_subscriptions s
   where s.status <> 'ended'
   group by s.price_id;
$$;

revoke all on function admin_save_billing_settings(numeric, numeric, numeric, numeric, uuid, text) from public, anon, authenticated;
grant execute on function admin_save_billing_settings(numeric, numeric, numeric, numeric, uuid, text) to service_role;
revoke all on function admin_save_product(uuid, text, text, text, integer, boolean, uuid) from public, anon, authenticated;
grant execute on function admin_save_product(uuid, text, text, text, integer, boolean, uuid) to service_role;
revoke all on function admin_add_price(uuid, bigint, bigint, integer, numeric, integer, integer, uuid, uuid, text) from public, anon, authenticated;
grant execute on function admin_add_price(uuid, bigint, bigint, integer, numeric, integer, integer, uuid, uuid, text) to service_role;
revoke all on function admin_set_price_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function admin_set_price_active(uuid, boolean, uuid) to service_role;
revoke all on function billing_price_subscriber_counts() from public, anon, authenticated;
grant execute on function billing_price_subscriber_counts() to service_role;

notify pgrst, 'reload schema';
