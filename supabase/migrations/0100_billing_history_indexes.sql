-- Billing's history lists a page at a time (D588): each page is one filtered, sorted, counted read,
-- so each gets an index that serves the filter and the newest-first sort together. Safe to re-run.

-- An agency's billing log, newest first. Replaces the org_id-only index (this one leads with it).
create index if not exists billing_log_org_id_created_at_idx on billing_log (org_id, created_at desc);
drop index if exists billing_log_org_id_idx;

-- An agency's payments, newest first. Replaces the org_id-only index.
create index if not exists billing_payments_org_id_created_at_idx on billing_payments (org_id, created_at desc);
drop index if exists billing_payments_org_id_idx;

-- Admin › Payments: payments across agencies that went through or failed (not started, not test).
create index if not exists billing_payments_listed_created_at_idx on billing_payments (created_at desc)
  where status <> 'created' and kind <> 'test';

-- Admin › Payments: plans renewing or ending soon, by status then the end of the paid month.
create index if not exists billing_subscriptions_status_period_end_idx on billing_subscriptions (status, current_period_end);
