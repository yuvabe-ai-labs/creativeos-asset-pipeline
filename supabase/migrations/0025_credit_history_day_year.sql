-- Day and year granularity for the admin Generations tab's usage trend chart (previously
-- month-only, migration 0023/0024). Same generate_series + LEFT JOIN zero-fill shape as
-- org_monthly_credit_history — a period with no transactions still renders as a zero bar
-- instead of being silently absent from the series.

create or replace function org_daily_credit_history(p_org_id uuid, p_days int default 30)
returns table(day timestamptz, credits_used numeric)
language sql stable
as $$
  select
    days.day,
    coalesce(sum(t.amount), 0) as credits_used
  from generate_series(
    date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      - make_interval(days => p_days - 1),
    date_trunc('day', now() at time zone 'utc') at time zone 'utc',
    interval '1 day'
  ) as days(day)
  left join credit_transactions t
    on t.org_id = p_org_id
    and date_trunc('day', t.created_at at time zone 'utc') at time zone 'utc' = days.day
  group by days.day
  order by days.day asc
$$;

create or replace function org_yearly_credit_history(p_org_id uuid, p_years int default 5)
returns table(year timestamptz, credits_used numeric)
language sql stable
as $$
  select
    years.year,
    coalesce(sum(t.amount), 0) as credits_used
  from generate_series(
    date_trunc('year', now() at time zone 'utc') at time zone 'utc'
      - make_interval(years => p_years - 1),
    date_trunc('year', now() at time zone 'utc') at time zone 'utc',
    interval '1 year'
  ) as years(year)
  left join credit_transactions t
    on t.org_id = p_org_id
    and date_trunc('year', t.created_at at time zone 'utc') at time zone 'utc' = years.year
  group by years.year
  order by years.year asc
$$;
