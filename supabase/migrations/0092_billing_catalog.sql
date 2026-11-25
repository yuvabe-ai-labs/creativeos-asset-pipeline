-- Billing catalog (spec 2026-11-21-billing-catalog-schema-design.md, D577). Tables and columns
-- only: nothing reads them until piece 3. Ready for custom plans, monthly to yearly intervals,
-- monthly credit drops inside longer plans, top-ups with their own validity, discounts, price
-- changes from the next payment, GST invoices and other currencies.

-- What is sold: a plan or a top-up pack. org_id set = a custom plan only that agency sees.
create table billing_products (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'topup')),
  name text not null,
  description text,
  org_id uuid references organizations(id) on delete cascade,
  features jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_products_kind_active_idx on billing_products (kind, active);
create index billing_products_org_id_idx on billing_products (org_id);

-- How a product is paid for. Fixed once written (trigger below): a change is a new row.
create table billing_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references billing_products(id) on delete cascade,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor > 0),
  list_amount_minor bigint check (list_amount_minor is null or list_amount_minor >= amount_minor),
  interval_months integer check (interval_months is null or interval_months between 1 and 36),
  credits numeric not null check (credits > 0),
  credits_every_months integer,
  valid_days integer check (valid_days is null or valid_days > 0),
  razorpay_plan_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- A plan has an interval and a credit cadence that divides it; a top-up has neither.
  check (
    (interval_months is null and credits_every_months is null)
    or (interval_months is not null and credits_every_months is not null
        and credits_every_months > 0 and interval_months % credits_every_months = 0
        and valid_days is null)
  )
);

create index billing_prices_product_id_active_idx on billing_prices (product_id, active);

create or replace function billing_prices_fixed() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is distinct from old.product_id
     or new.currency is distinct from old.currency
     or new.amount_minor is distinct from old.amount_minor
     or new.list_amount_minor is distinct from old.list_amount_minor
     or new.interval_months is distinct from old.interval_months
     or new.credits is distinct from old.credits
     or new.credits_every_months is distinct from old.credits_every_months
     or new.valid_days is distinct from old.valid_days then
    raise exception 'billing_prices are fixed once written: add a new price instead';
  end if;
  return new;
end;
$$;

create trigger billing_prices_fixed before update on billing_prices
  for each row execute function billing_prices_fixed();

-- Pricing inputs over time; the latest row with effective_from <= now() is in force.
create table billing_settings (
  id uuid primary key default gen_random_uuid(),
  inr_per_usd numeric not null check (inr_per_usd > 0),
  plan_margin_pct numeric not null check (plan_margin_pct >= 0),
  topup_margin_pct numeric not null check (topup_margin_pct >= 0),
  min_margin_pct numeric not null check (min_margin_pct >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index billing_settings_effective_from_idx on billing_settings (effective_from);

-- Examples until the real figures are set (D575: a fixed $1 = Rs 100 planning rate).
insert into billing_settings (inr_per_usd, plan_margin_pct, topup_margin_pct, min_margin_pct, note)
values (100, 1, 20, 10, 'Starting values; examples until the real prices are set');

-- Discount codes (code set) and discounts Yuvabe applies to one agency (code null).
create table billing_discounts (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  percent_off numeric check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  amount_off_minor bigint check (amount_off_minor is null or amount_off_minor > 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  product_id uuid references billing_products(id) on delete cascade,
  price_id uuid references billing_prices(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  cycles integer check (cycles is null or cycles > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((percent_off is null) <> (amount_off_minor is null)),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index billing_discounts_org_id_idx on billing_discounts (org_id);
create index billing_discounts_product_id_idx on billing_discounts (product_id);
create index billing_discounts_price_id_idx on billing_discounts (price_id);

-- An agency's billing details for Razorpay and GST invoices.
create table billing_accounts (
  org_id uuid primary key references organizations(id) on delete cascade,
  razorpay_customer_id text unique,
  legal_name text,
  gstin text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  billing_email text,
  address jsonb,
  updated_at timestamptz not null default now()
);

-- An agency's plan. One live subscription per agency (index below).
create table billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  price_id uuid not null references billing_prices(id),
  next_price_id uuid references billing_prices(id),
  discount_id uuid references billing_discounts(id) on delete set null,
  discount_cycles_left integer,
  status text not null default 'created'
    check (status in ('created', 'active', 'payment_due', 'cancelling', 'ended')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_credit_at timestamptz,
  cancel_at_period_end boolean not null default false,
  razorpay_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create unique index billing_subscriptions_one_live_idx on billing_subscriptions (org_id) where status <> 'ended';
create index billing_subscriptions_org_id_idx on billing_subscriptions (org_id);
create index billing_subscriptions_status_idx on billing_subscriptions (status);
create index billing_subscriptions_next_credit_at_idx on billing_subscriptions (next_credit_at);
create index billing_subscriptions_price_id_idx on billing_subscriptions (price_id);
create index billing_subscriptions_next_price_id_idx on billing_subscriptions (next_price_id);
create index billing_subscriptions_discount_id_idx on billing_subscriptions (discount_id);

-- Every Razorpay webhook, stored once by its event id.
create table razorpay_events (
  event_id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create index razorpay_events_unprocessed_idx on razorpay_events (received_at) where processed_at is null;

-- Payments keep what they were charged with. Existing rows are the test top-up.
alter table billing_payments
  add column kind text not null default 'test' check (kind in ('test', 'plan', 'renewal', 'topup')),
  add column price_id uuid references billing_prices(id) on delete set null,
  add column subscription_id uuid references billing_subscriptions(id) on delete set null,
  add column discount_id uuid references billing_discounts(id) on delete set null,
  add column currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  add column discount_minor bigint not null default 0 check (discount_minor >= 0),
  add column tax_minor bigint not null default 0 check (tax_minor >= 0),
  add column total_minor bigint,
  add column inr_per_usd numeric,
  add column razorpay_invoice_id text;

alter table billing_payments drop constraint if exists billing_payments_status_check;
alter table billing_payments add constraint billing_payments_status_check
  check (status in ('created', 'paid', 'failed', 'refunded'));

create index billing_payments_price_id_idx on billing_payments (price_id);
create index billing_payments_subscription_id_idx on billing_payments (subscription_id);
create index billing_payments_discount_id_idx on billing_payments (discount_id);

-- Which purchase a grant came from.
alter table credit_grants
  add column price_id uuid references billing_prices(id) on delete set null,
  add column subscription_id uuid references billing_subscriptions(id) on delete set null;

create index credit_grants_price_id_idx on credit_grants (price_id);
create index credit_grants_subscription_id_idx on credit_grants (subscription_id);

alter table billing_products enable row level security;
alter table billing_prices enable row level security;
alter table billing_settings enable row level security;
alter table billing_discounts enable row level security;
alter table billing_accounts enable row level security;
alter table billing_subscriptions enable row level security;
alter table razorpay_events enable row level security;

create policy "owners read" on billing_subscriptions for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = billing_subscriptions.org_id and m.is_owner
  ));

create policy "owners read" on billing_accounts for select
  using (exists (
    select 1 from org_memberships m
     where m.user_id = auth.uid() and m.org_id = billing_accounts.org_id and m.is_owner
  ));

notify pgrst, 'reload schema';
