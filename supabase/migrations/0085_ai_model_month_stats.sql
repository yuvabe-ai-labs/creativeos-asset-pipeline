-- D547: this month's runs, provider cost, credits and unpriced runs per model, in one query for
-- the super admin's models page. A run is any generations row (record-only rows included: they
-- are what a free feature cost us). Unpriced: no price row, or the bill had meters the row did
-- not price. Apply before the Plan 4 code deploys; harmless before.
create index if not exists generations_created_at_idx on generations (created_at);

create or replace function ai_model_month_stats(p_from timestamptz, p_to timestamptz)
returns table(model_id text, runs bigint, cost_usd numeric, credits numeric, unpriced bigint)
language sql stable
as $$
  select g.model_used as model_id,
         count(*) as runs,
         coalesce(sum(g.cost_usd), 0) as cost_usd,
         coalesce(sum(g.credits_charged), 0) as credits,
         count(*) filter (
           where g.model_price_id is null
              or (jsonb_typeof(g.provider_bill -> 'unpriced') = 'array'
                  and jsonb_array_length(g.provider_bill -> 'unpriced') > 0)
         ) as unpriced
  from generations g
  where g.created_at >= p_from and g.created_at < p_to and g.model_used is not null
  group by g.model_used
$$;
