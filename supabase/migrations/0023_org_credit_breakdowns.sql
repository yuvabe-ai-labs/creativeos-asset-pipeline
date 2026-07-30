-- Stage 3 (Credit System) admin usage breakdown functions, sub-plan 3F. See
-- docs/superpowers/specs/2026-07-26-admin-usage-dashboard-research.md for the SaaS patterns
-- this is based on (Anthropic Console's daily/monthly cost views, Vercel's usage-by-category
-- breakdown). Parameterized queries — a plain view (like org_credit_usage, migration 0019)
-- can't take arguments, so these are SQL functions instead.
--
-- Relies on the same "plain sum is correct" property org_credit_usage already does (design
-- spec §4): every generation's reservation is always eventually cancelled by exactly one
-- refund or matched by one consumption, so summing every row in a CLOSED month nets to the
-- real total. The current (still-open) month can be transiently off for any generation still
-- `running` — accepted, same as everywhere else this property is relied on.

-- Last N months' totals (default 6), oldest first — for the trend chart. UTC month
-- boundaries, matching org_credit_usage's own convention.
create or replace function org_monthly_credit_history(p_org_id uuid, p_months int default 6)
returns table(month timestamptz, credits_used numeric)
language sql stable
as $$
  select date_trunc('month', created_at at time zone 'utc') at time zone 'utc' as month,
         sum(amount) as credits_used
  from credit_transactions
  where org_id = p_org_id
    and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
                       - make_interval(months => p_months - 1)
  group by month
  order by month asc
$$;

-- Credits used by generation type (image/video/prompt), for one specific month window.
-- Joins to generations for `type` — credit_transactions itself has no notion of generation
-- type, only generation_id.
create or replace function org_credit_breakdown_by_type(
  p_org_id uuid,
  p_month_start timestamptz,
  p_month_end timestamptz
)
returns table(type text, credits numeric)
language sql stable
as $$
  select g.type, sum(t.amount) as credits
  from credit_transactions t
  join generations g on g.id = t.generation_id
  where t.org_id = p_org_id
    and t.created_at >= p_month_start
    and t.created_at < p_month_end
  group by g.type
  order by credits desc
$$;

-- Credits used by model (e.g. "openai:gpt-image-2"), for one specific month window.
create or replace function org_credit_breakdown_by_model(
  p_org_id uuid,
  p_month_start timestamptz,
  p_month_end timestamptz
)
returns table(model text, credits numeric)
language sql stable
as $$
  select g.model_used as model, sum(t.amount) as credits
  from credit_transactions t
  join generations g on g.id = t.generation_id
  where t.org_id = p_org_id
    and t.created_at >= p_month_start
    and t.created_at < p_month_end
  group by g.model_used
  order by credits desc
$$;
