-- Live credits after a payment (D586): add credit_grants and billing_subscriptions to the Realtime
-- publication, so the header's popover and the workspace bar hear new credits (a top-up, a plan
-- payment, free credits) and plan changes (paid, payment due, cancelled) without a reload. Owners
-- receive them through the "owners read" policies of 0091 and 0092; members receive nothing.
-- Same defensive pattern as 0022: safe to run whether or not a table is already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'credit_grants'
  ) then
    alter publication supabase_realtime add table credit_grants;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'billing_subscriptions'
  ) then
    alter publication supabase_realtime add table billing_subscriptions;
  end if;
end $$;
