# Billing catalog schema: ready for every plan shape we expect

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Migration:** 0092 · **Map:**
`2026-11-19-billing-phase-1-design.md` (pieces 3 to 7 build on it)

## Goal

One schema that phase 1 uses as it is and later work only fills in: custom plans for one agency,
monthly, quarterly, half-yearly and yearly plans with their own prices, yearly plans whose credits
arrive monthly, top-ups that end with the plan month or after their own number of days, discount
codes, price changes that apply from the next payment, invoices with GST, and other currencies.
0092 adds tables and columns only. No behaviour changes; nothing reads them until piece 3.

## Rules the schema follows

1. **A price is never edited.** Its amount, credits, currency and interval are fixed once written
   (a trigger refuses changes). A new price is a new row; the old one is hidden. A subscription
   points at the price it bought, so a change applies from the next payment by moving the
   subscription to the new price at renewal. Razorpay plans are fixed the same way, so one price
   row maps to one Razorpay plan.
2. **Amounts are explicit, in the currency's smallest unit, before tax.** A yearly price is its own
   number (for example ₹1,08,000), not a formula. The suggested price (credits × rate × margin) is
   a helper in Admin, not a stored rule. `list_amount_minor` holds the undiscounted figure for
   "save 10%" labels.
3. **Credits stay tied to dollars** (1,000 credits = $1 of AI cost). The rupee rate is used to
   suggest prices and to check margins. It never changes how many credits a run costs.
4. **Every payment keeps what it was charged with:** price, discount, tax, total and the rate in
   force, so reports and refunds match what the owner paid.
5. **Credits are always grants** (0091). A plan with monthly credit drops writes one grant a month,
   whatever its billing interval; a top-up writes one grant with its own end.

## Tables (migration 0092)

### billing_products

What is sold: a plan or a top-up pack.

| Column | Notes |
|---|---|
| `id` uuid PK | |
| `kind` | `plan` or `topup` |
| `name`, `description` | shown to owners |
| `org_id` → organizations cascade, nullable | **Custom plan:** only this agency sees it. Null: every paying agency |
| `features` jsonb, default `{}` | later limits such as members or storage |
| `sort` int, `active` bool | `active = false` hides it from new purchases; current subscribers keep it |

Indexes: `(kind, active)`, `org_id`.

### billing_prices

How a product is paid for. A product has one price per interval (and per currency).

| Column | Notes |
|---|---|
| `id` uuid PK, `product_id` → billing_products cascade | |
| `currency` | `INR` default, three capital letters |
| `amount_minor` bigint > 0 | paise for INR, before tax |
| `list_amount_minor` bigint, nullable | undiscounted figure for "save X%", must be ≥ the amount |
| `interval_months` int, nullable | plans: 1 monthly, 3 quarterly, 6 half-yearly, 12 yearly. Null for a top-up |
| `credits` numeric > 0 | credits in each drop (plan) or in the pack (top-up) |
| `credits_every_months` int, nullable | plans: how often credits arrive. 1 = monthly drops (a yearly plan gets 12). Equal to `interval_months` = all at once. Must divide `interval_months` |
| `valid_days` int, nullable | top-ups: null = end with the current plan period's credits; a number = end that many days after purchase |
| `razorpay_plan_id` text unique, nullable | set when the Razorpay plan is made (on first purchase) |
| `active` bool | hidden from new purchases when false |

Checks: plans have `interval_months` and `credits_every_months`, top-ups have neither. Trigger
`billing_prices_fixed` refuses changes to `product_id`, `currency`, `amount_minor`,
`list_amount_minor`, `interval_months`, `credits`, `credits_every_months`, `valid_days`.
Index: `(product_id, active)`.

### billing_settings

The pricing inputs over time; the latest row with `effective_from <= now()` is in force.

`id`, `inr_per_usd` numeric > 0 (the planning rate, D575), `plan_margin_pct`, `topup_margin_pct`,
`min_margin_pct` (Admin warns below it), `effective_from` timestamptz, `created_by`, `note`. Seeded
with one row: ₹100, 1%, 20%, 10% (examples until the real figures are set). Index:
`effective_from`.

### billing_discounts

Discount codes and agency-specific discounts.

`id`, `code` text unique nullable (null: applied by Yuvabe, not typed), `percent_off` (0–100] or
`amount_off_minor` (exactly one), `currency`, `product_id` / `price_id` nullable (what it applies
to; both null: anything), `org_id` nullable (only this agency), `cycles` int nullable (how many
payments it applies to; null: forever), `max_redemptions`, `redeemed_count` default 0,
`starts_at`, `ends_at`, `active`, `created_by`, `created_at`. Index: `org_id`.

### billing_accounts

An agency's billing details, one row per paying agency.

`org_id` PK → organizations cascade, `razorpay_customer_id` text unique, `legal_name`, `gstin`,
`billing_email`, `address` jsonb, `updated_at`.

### billing_subscriptions

An agency's plan.

| Column | Notes |
|---|---|
| `id`, `org_id` → organizations cascade | |
| `price_id` → billing_prices (no delete) | what is being paid now |
| `next_price_id` → billing_prices, nullable | change of plan or interval from the next payment |
| `discount_id` → billing_discounts, nullable; `discount_cycles_left` int, nullable | |
| `status` | `created`, `active`, `payment_due` (failed, or waiting for the owner's approval above ₹15,000), `cancelling` (cancelled, works until the period ends), `ended` |
| `current_period_start`, `current_period_end` | the paid period |
| `next_credit_at` | when the next credit drop is due (monthly drops inside a longer period) |
| `cancel_at_period_end` bool | |
| `razorpay_subscription_id` text unique, nullable | |
| `created_at`, `updated_at`, `ended_at` | |

One live subscription per agency: unique `org_id` where status is not `ended`. Indexes: `status`,
`next_credit_at` (the drop job), `price_id`, `next_price_id`, `discount_id`.

### razorpay_events

Every webhook stored once: `event_id` text PK, `type`, `payload` jsonb, `received_at`,
`processed_at`, `error`. Index: `processed_at` where null (the retry sweep).

### Changes to existing tables

- `billing_payments` (0090) gains: `kind` (`test`, `plan`, `renewal`, `topup`; existing rows are
  `test`), `price_id`, `subscription_id`, `discount_id`, `currency` (default `INR`),
  `discount_minor`, `tax_minor`, `total_minor`, `inr_per_usd`, `razorpay_invoice_id`. `status`
  also allows `failed` and `refunded`. `amount_paise` stays the amount before discount and tax.
  Indexes on the new foreign keys.
- `credit_grants` (0091) gains `price_id` and `subscription_id` (which purchase a grant came from),
  with indexes.

## Who can read

RLS on for every new table. Owners read their own `billing_subscriptions` and `billing_accounts`
(the owner rule of 0065). Products, prices, settings, discounts and events: server only (screens
read them through the server).

## What each future feature needs then

| Feature | Data | Code still to write |
|---|---|---|
| Quarterly, half-yearly, yearly plans | price rows with `interval_months` 3, 6, 12 | plan picker shows intervals; Razorpay plan per price |
| Yearly plan, credits monthly | `credits_every_months = 1` | the drop job writes a grant at `next_credit_at` |
| Discounts for longer plans | explicit amounts, `list_amount_minor` | "save X%" label |
| Discount codes | `billing_discounts` | code box at checkout; Razorpay offer or reduced first payment |
| Custom plan for one agency | product with `org_id`, `plan_type = custom` | Admin form; plan picker includes it |
| Top-ups with their own validity | `valid_days` | grant end = purchase + days |
| Price change from next payment | new price row, `next_price_id` | renewal moves the subscription; owner notice |
| Other currencies | `currency` on prices and payments | price rows per currency; Razorpay international |
| GST invoices | `billing_accounts.gstin`, payment tax fields | pass GSTIN to Razorpay |
| Margin warning | `billing_settings` history | Admin compares with today's rate |

## Scale

Every list or lookup has an index on the column it filters by, foreign keys included. A run still
touches only the agency's few open grants (0091). The catalog is small (tens of rows). Payments
and events grow by a few rows per agency per month.

## Checking

Text tests pin the checks, the trigger, the one-live-subscription index, RLS and the indexes. By
hand on staging after applying: insert a monthly and a yearly price; try to change a price's
amount (refused); insert two live subscriptions for one agency (refused).
