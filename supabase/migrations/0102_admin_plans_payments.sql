-- Admin › Plans and prices shows each offer's health, and Admin › Payments is a searchable ledger
-- with counts by status (D592). Two read-only functions and one index. Safe to re-run.

-- Admin › Payments lists every status now, "Not finished" (checkout started, never paid) included,
-- newest first. Replaces 0100's index, which left started checkouts out.
create index if not exists billing_payments_admin_created_at_idx on billing_payments (created_at desc)
  where kind <> 'test';
drop index if exists billing_payments_listed_created_at_idx;

-- Every price's agencies and money, grouped in the database (one row per price that has either):
--   agencies       plans that are running: active, cancelling (ending) or payment due. A checkout
--                  that was never paid ('created') and an ended plan are not on the price.
--   monthly_minor  what the active ones pay each month, before GST.
--   paid_count, paid_minor  payments for the price since p_since, GST included.
-- Replaces billing_price_subscriber_counts() on the page (that one counts 'created' too).
create or replace function admin_offer_health(p_since timestamptz)
returns table (
  price_id uuid,
  agencies integer,
  active integer,
  ending integer,
  due integer,
  monthly_minor bigint,
  paid_count integer,
  paid_minor bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with subs as (
    select s.price_id,
           count(*)::integer as agencies,
           (count(*) filter (where s.status = 'active'))::integer as active,
           (count(*) filter (where s.status = 'cancelling'))::integer as ending,
           (count(*) filter (where s.status = 'payment_due'))::integer as due,
           coalesce(round(sum(pr.amount_minor::numeric / greatest(coalesce(pr.interval_months, 1), 1))
                            filter (where s.status = 'active')), 0)::bigint as monthly_minor
      from billing_subscriptions s
      join billing_prices pr on pr.id = s.price_id
     where s.status in ('active', 'cancelling', 'payment_due')
     group by s.price_id
  ), paid as (
    select bp.price_id,
           count(*)::integer as paid_count,
           sum(coalesce(bp.total_minor, bp.amount_paise))::bigint as paid_minor
      from billing_payments bp
     where bp.status = 'paid' and bp.kind <> 'test' and bp.price_id is not null
       and bp.created_at >= p_since
     group by bp.price_id
  )
  select coalesce(s.price_id, p.price_id),
         coalesce(s.agencies, 0), coalesce(s.active, 0), coalesce(s.ending, 0), coalesce(s.due, 0),
         coalesce(s.monthly_minor, 0), coalesce(p.paid_count, 0), coalesce(p.paid_minor, 0)
    from subs s
    full outer join paid p on p.price_id = s.price_id;
$$;

-- Payments by status for Admin › Payments' tabs and totals: how many and how much (GST included),
-- in [p_from, p_to) by when the payment was started (null: no bound), for agencies whose name
-- contains p_query (null: every agency). The caller escapes \ % and _ in p_query.
create or replace function admin_payment_totals(p_from timestamptz, p_to timestamptz, p_query text)
returns table (status text, payments integer, total_minor bigint)
language sql
stable
security definer
set search_path = public
as $$
  select bp.status,
         count(*)::integer,
         coalesce(sum(coalesce(bp.total_minor, bp.amount_paise)), 0)::bigint
    from billing_payments bp
    join organizations o on o.id = bp.org_id
   where bp.kind <> 'test'
     and (p_from is null or bp.created_at >= p_from)
     and (p_to is null or bp.created_at < p_to)
     and (p_query is null or o.name ilike '%' || p_query || '%')
   group by bp.status;
$$;

revoke all on function admin_offer_health(timestamptz) from public, anon, authenticated;
grant execute on function admin_offer_health(timestamptz) to service_role;
revoke all on function admin_payment_totals(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function admin_payment_totals(timestamptz, timestamptz, text) to service_role;

notify pgrst, 'reload schema';
