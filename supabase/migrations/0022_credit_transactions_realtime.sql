-- Add credit_transactions to the Realtime publication so the header's live "used this
-- month" display (HeaderCredits, sub-plan 3G) can subscribe to new ledger rows. Same
-- defensive pattern as migration 0014's addition of `generations` — safe to run whether or
-- not the table is already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'credit_transactions'
  ) then
    alter publication supabase_realtime add table credit_transactions;
  end if;
end $$;
