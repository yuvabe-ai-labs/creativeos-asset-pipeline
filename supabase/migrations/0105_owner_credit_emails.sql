-- Two emails to a paying agency's owners (D596): credits running low (80% or more of the open
-- credits used), and free credits ending in 3 days with no plan. The hourly check finds both in one
-- read, claims each send here before it goes, and gives the claim back if the send fails. Managed
-- agencies get neither. Safe to re-run.

-- When the owners were last told credits are running low. Credits that arrive after it (a renewal,
-- a top-up, credits Yuvabe adds) start a new credit period, which can be warned once again.
alter table organizations add column if not exists low_credits_warned_at timestamptz;

-- When the owners were told this free grant ends in 3 days; once per grant.
alter table credit_grants add column if not exists ending_warned_at timestamptz;

-- The free grants the check looks at: ending, not yet told.
create index if not exists credit_grants_free_ending_idx on credit_grants (ends_at)
  where kind = 'free' and ending_warned_at is null;

-- Everything to send now, in one read for every agency, at most p_limit rows:
--   low_credits  a paying agency with credits left and p_low_share or more of its open credits used,
--                not told since its newest open credits arrived. The code then applies Billing's own
--                rule (summarizeBilling's "low") to the open grants given here.
--   free_ending  a free grant with credits left ending within p_notice, given at least p_notice
--                before its end (a shorter one was told in the welcome email), not told yet, on an
--                agency with no live plan (active, cancelling, payment due or an approval waiting).
-- Each row has the agency's open grants, its live plan (status, period end) and its owners' login
-- emails; an agency without an owner is left out.
create or replace function billing_owner_emails_due(p_low_share numeric, p_notice interval, p_limit integer)
returns table (
  kind text,
  org_id uuid,
  agency text,
  owner_emails text[],
  grant_id uuid,
  grants jsonb,
  subscription_status text,
  current_period_end timestamptz,
  warned_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with open_grants as (
    select g.org_id, g.id, g.kind, g.credits, g.used, greatest(g.credits - g.used, 0) as left_credits, g.ends_at,
           greatest(g.created_at, g.starts_at) as arrived_at
      from credit_grants g
      join organizations o on o.id = g.org_id and o.billing_mode = 'plans'
     where g.starts_at <= now() and g.ends_at > now()
  ),
  totals as (
    select og.org_id,
           sum(og.credits) as total,
           sum(og.left_credits) as left_credits,
           max(og.arrived_at) as arrived_at,
           jsonb_agg(jsonb_build_object('id', og.id, 'kind', og.kind, 'credits', og.credits, 'used', og.used,
                                        'left', og.left_credits, 'ends_at', og.ends_at)
                     order by og.ends_at) as grants
      from open_grants og
     group by og.org_id
  ),
  due as (
    select 'low_credits'::text as kind, t.org_id, null::uuid as grant_id, t.grants, o.low_credits_warned_at as warned_at,
           now() as sort_at
      from totals t
      join organizations o on o.id = t.org_id
     where t.total > 0 and t.left_credits > 0
       and (t.total - t.left_credits) / t.total >= p_low_share
       and (o.low_credits_warned_at is null or t.arrived_at > o.low_credits_warned_at)
    union all
    select 'free_ending'::text, g.org_id, g.id, t.grants, null::timestamptz, g.ends_at
      from credit_grants g
      join totals t on t.org_id = g.org_id
     where g.kind = 'free' and g.ending_warned_at is null
       and g.starts_at <= now() and g.ends_at > now() and g.ends_at <= now() + p_notice
       and g.ends_at - g.created_at >= p_notice
       and g.credits - g.used > 0
       and not exists (
         select 1 from billing_subscriptions s
          where s.org_id = g.org_id and s.status in ('active', 'cancelling', 'payment_due', 'scheduled')
       )
  )
  select d.kind, d.org_id, o.name, owners.emails, d.grant_id, d.grants, live.status, live.current_period_end, d.warned_at
    from due d
    join organizations o on o.id = d.org_id
    cross join lateral (
      select array_agg(u.email::text order by u.email) as emails
        from org_memberships m
        join auth.users u on u.id = m.user_id
       where m.org_id = d.org_id and m.is_owner and u.email is not null
    ) owners
    left join lateral (
      select s.status, s.current_period_end
        from billing_subscriptions s
       where s.org_id = d.org_id and s.status not in ('ended', 'scheduled')
       limit 1
    ) live on true
   where owners.emails is not null
   order by d.sort_at
   limit p_limit;
$$;

-- Takes the low-credits email for an agency, once: only while it is still as the read saw it
-- (p_seen, null when never told). Returns the time it was taken (to give it back), null when
-- another run took it first.
create or replace function claim_low_credits_email(p_org_id uuid, p_seen timestamptz)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update organizations o
     set low_credits_warned_at = now()
   where o.id = p_org_id and o.low_credits_warned_at is not distinct from p_seen
  returning o.low_credits_warned_at;
$$;

-- The send failed: gives the claim back (to the value before it), so the next run tries again.
-- Only the claim this run took; a newer one is kept.
create or replace function release_low_credits_email(p_org_id uuid, p_claimed timestamptz, p_previous timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update organizations o
     set low_credits_warned_at = p_previous
   where o.id = p_org_id and o.low_credits_warned_at = p_claimed;
$$;

-- Takes the free-credits-ending email for a grant, once. Returns the time it was taken, null when
-- it was already taken.
create or replace function claim_free_ending_email(p_grant_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update credit_grants g
     set ending_warned_at = now()
   where g.id = p_grant_id and g.kind = 'free' and g.ending_warned_at is null
  returning g.ending_warned_at;
$$;

-- The send failed: gives the grant's claim back, so the next run tries again.
create or replace function release_free_ending_email(p_grant_id uuid, p_claimed timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update credit_grants g
     set ending_warned_at = null
   where g.id = p_grant_id and g.ending_warned_at = p_claimed;
$$;

revoke all on function billing_owner_emails_due(numeric, interval, integer) from public, anon, authenticated;
grant execute on function billing_owner_emails_due(numeric, interval, integer) to service_role;
revoke all on function claim_low_credits_email(uuid, timestamptz) from public, anon, authenticated;
grant execute on function claim_low_credits_email(uuid, timestamptz) to service_role;
revoke all on function release_low_credits_email(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function release_low_credits_email(uuid, timestamptz, timestamptz) to service_role;
revoke all on function claim_free_ending_email(uuid) from public, anon, authenticated;
grant execute on function claim_free_ending_email(uuid) to service_role;
revoke all on function release_free_ending_email(uuid, timestamptz) from public, anon, authenticated;
grant execute on function release_free_ending_email(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
