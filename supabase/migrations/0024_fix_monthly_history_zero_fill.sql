-- Fix org_monthly_credit_history (migration 0023): the original version only returned
-- months that had at least one transaction, so an org with usage in just one recent month
-- got a chart with a single giant bar instead of a real 6-month trend with empty months
-- rendered as zero. generate_series produces the full month series first; the actual sums
-- are LEFT JOINed on, defaulting to 0 via coalesce for months with no activity.
create or replace function org_monthly_credit_history(p_org_id uuid, p_months int default 6)
returns table(month timestamptz, credits_used numeric)
language sql stable
as $$
  select
    months.month,
    coalesce(sum(t.amount), 0) as credits_used
  from generate_series(
    date_trunc('month', now() at time zone 'utc') at time zone 'utc'
      - make_interval(months => p_months - 1),
    date_trunc('month', now() at time zone 'utc') at time zone 'utc',
    interval '1 month'
  ) as months(month)
  left join credit_transactions t
    on t.org_id = p_org_id
    and date_trunc('month', t.created_at at time zone 'utc') at time zone 'utc' = months.month
  group by months.month
  order by months.month asc
$$;
