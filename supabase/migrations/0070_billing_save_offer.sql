-- Admin adds or edits a plan or top-up pack and its price in one step (spec
-- 2026-11-21-plans-and-prices-design.md, "One step", D520). One transaction: the product, its price
-- for the interval, and the billing_log rows.
--
-- Adding (p_product_id null): the product and its first price.
-- Editing: name, description and visibility change in place. When the amount or credits differ
-- from the price in force for that interval, a new price is added, the old one is hidden and live
-- subscriptions on it move to the new one from their next payment (prices are fixed, D518).

create or replace function admin_save_offer(
  p_product_id uuid,
  p_kind text,
  p_name text,
  p_description text,
  p_active boolean,
  p_amount_minor bigint,
  p_credits numeric,
  p_interval_months integer,
  p_actor uuid,
  p_reason text
) returns table (product_id uuid, price_changed boolean, moved_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product billing_products%rowtype;
  v_price billing_prices%rowtype;
  v_product_id uuid;
  v_new_price uuid;
  v_changed boolean := false;
  v_moved integer := 0;
begin
  if p_product_id is null then
    insert into billing_products (kind, name, description, active)
    values (p_kind, p_name, p_description, coalesce(p_active, true))
    returning id into v_product_id;

    insert into billing_prices (product_id, amount_minor, interval_months, credits, credits_every_months)
    values (v_product_id, p_amount_minor, p_interval_months, p_credits,
            case when p_interval_months is null then null else 1 end)
    returning id into v_new_price;

    insert into billing_log (org_id, actor_id, action, before, after, reason)
    values (null, p_actor, 'offer', null,
            jsonb_build_object('product_id', v_product_id, 'kind', p_kind, 'name', p_name, 'price_id', v_new_price,
                               'amount_minor', p_amount_minor, 'credits', p_credits, 'interval_months', p_interval_months),
            p_reason);
    return query select v_product_id, true, 0;
    return;
  end if;

  select * into v_product from billing_products bp where bp.id = p_product_id for update;
  if not found then
    raise exception 'admin_save_offer: product % not found', p_product_id;
  end if;

  update billing_products bp
     set name = p_name, description = p_description, active = coalesce(p_active, bp.active), updated_at = now()
   where bp.id = p_product_id;

  -- The price in force for this interval: the newest active one.
  select * into v_price
    from billing_prices pr
   where pr.product_id = p_product_id and pr.active
     and pr.interval_months is not distinct from p_interval_months
   order by pr.created_at desc
   limit 1
   for update;

  if not found or v_price.amount_minor <> p_amount_minor or v_price.credits <> p_credits then
    v_changed := true;
    insert into billing_prices (product_id, amount_minor, interval_months, credits, credits_every_months)
    values (p_product_id, p_amount_minor, p_interval_months, p_credits,
            case when p_interval_months is null then null else 1 end)
    returning id into v_new_price;

    if v_price.id is not null then
      update billing_prices pr set active = false where pr.id = v_price.id;
      update billing_subscriptions s
         set next_price_id = v_new_price, updated_at = now()
       where s.status <> 'ended'
         and ((s.price_id = v_price.id and s.next_price_id is null) or s.next_price_id = v_price.id);
      get diagnostics v_moved = row_count;
    end if;
  end if;

  insert into billing_log (org_id, actor_id, action, before, after, reason)
  values (null, p_actor, 'offer',
          jsonb_build_object('product_id', p_product_id, 'name', v_product.name, 'active', v_product.active,
                             'price_id', v_price.id, 'amount_minor', v_price.amount_minor, 'credits', v_price.credits),
          jsonb_build_object('product_id', p_product_id, 'name', p_name, 'active', coalesce(p_active, v_product.active),
                             'price_id', coalesce(v_new_price, v_price.id), 'amount_minor', p_amount_minor,
                             'credits', p_credits, 'moved', v_moved),
          p_reason);

  return query select p_product_id, v_changed, v_moved;
end;
$$;

revoke all on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) from public, anon, authenticated;
grant execute on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) to service_role;

notify pgrst, 'reload schema';
