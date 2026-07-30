-- Stage 3 (Credit System) reservation RPC. See
-- docs/superpowers/specs/2026-07-24-credit-system-design.md §4.
--
-- Atomic check-and-insert: a single plpgsql function call is one transaction, so locking
-- the org row for its duration serializes concurrent reservation attempts for the same org
-- — the sum-then-insert below can't race. Same acquire-lock-in-plpgsql shape as
-- acquire_canvas_lock (migration 0010).
create or replace function reserve_credits(
  p_org_id uuid,
  p_generation_id uuid,
  p_amount numeric
) returns boolean
language plpgsql
as $$
declare
  v_limit numeric;
  v_used numeric;
begin
  select monthly_credit_limit into v_limit
    from organizations
   where id = p_org_id
     for update;

  -- A null monthly_credit_limit (Yuvabe's own org, or any org intentionally left
  -- uncapped) always proceeds — no sum needed.
  if v_limit is not null then
    select coalesce(sum(amount), 0) into v_used
      from credit_transactions
     where org_id = p_org_id
       and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';

    if v_used + p_amount > v_limit then
      return false;
    end if;
  end if;

  insert into credit_transactions (org_id, generation_id, amount, type)
  values (p_org_id, p_generation_id, p_amount, 'reservation');

  return true;
end;
$$;
