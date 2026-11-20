# Billing piece 3: plans, packs and prices in Admin

**Date:** 2026-11-21 · **Branch:** `feat/razorpay-test` · **Map:** `2026-11-19-billing-phase-1-design.md`
(piece 3) · **Builds on:** the catalog schema (0068, D518) · **Migration:** 0069

## Goal

Yuvabe sets the plans, top-up packs and their prices in Admin, sees each price's real margin, and
is warned when a price earns less than the minimum. Nothing is sold yet (pieces 4 and 5).

## Decided (21 November)

- **Rate:** ₹100 to the dollar is both the planning rate and the cost rate Admin checks margins
  with. Our real cost today is about ₹95 to ₹97 (market rate plus the card fee), so ₹100 sits a
  little above it.
- **Minimum margin: 15%.** Below it, Admin shows a warning on the price.
- 0069 adds a settings row: ₹100, plan margin 20%, top-up margin 25%, minimum 15%. The margins are examples until the real prices are set; the 0068 seed row (1%, 20%, 10%) stays as history.

## Pricing math (`src/lib/billing/pricing.ts`)

- 1,000 credits = $1 of AI cost, so the cost of `c` credits at rate `r` is `c × r / 10` paise.
- A plan price's credits per period = `credits × interval_months / credits_every_months`.
- **Real margin** = amount ÷ cost − 1, shown as a whole percent.
- **Suggested amount** = cost × (1 + margin), rounded up to a whole rupee. It fills the amount box
  in the price dialog; Yuvabe can type another figure.
- Prices are shown before GST with "+ 18% GST".

## The screen: Admin › Plans and prices (`/admin/plans`)

Admin gets a section nav at the top of its pages: **Agencies** · **Plans and prices**.

1. **Pricing settings:** rate (₹ per $), plan margin, top-up margin, minimum margin, and when they
   were last changed. **Change** opens a dialog with the four values and a note; saving writes a
   new `billing_settings` row (the history stays). Margins already shown move to the new rate.
2. **Plans:** each plan with its prices. A price row: interval (Monthly), amount + GST, credits
   (and how often they arrive), real margin (warning below the minimum), agencies on it, and
   **Hidden** when inactive. Actions:
   - **Add a plan:** name, description.
   - **Edit** a plan: name, description, order, hidden.
   - **Add a price** to a plan: interval, amount, credits, (later) full price for "save X%".
   - **New price** on a price: the same fields, prefilled. Saving adds the new price, hides the
     old one, and moves every agency on the old price to the new one from its next payment. The
     dialog says how many agencies that is before saving.
   - **Hide / Show** a price.
3. **Top-up packs:** the same, with "Lasts until the plan month ends" (phase 1) instead of an
   interval.

Phase 1 offers only monthly intervals in the price dialog (`PLAN_INTERVALS = [1]`); quarterly,
half-yearly and yearly are added to that list when piece 5 supports them. Custom plans for one
agency (`org_id`) and discount codes have no screen yet; the schema is ready for both.

## Database (migration 0069; 0067 and 0068 are applied)

- `billing_log.org_id` becomes nullable: catalog and settings changes are logged with no agency.
- Functions, each writing its `billing_log` row in the same transaction; `security definer`,
  `set search_path = public`, `service_role` only:
  - `admin_save_billing_settings(p_inr_per_usd, p_plan_margin_pct, p_topup_margin_pct,
    p_min_margin_pct, p_actor, p_note) returns uuid`
  - `admin_save_product(p_id, p_kind, p_name, p_description, p_sort, p_active, p_actor) returns
    uuid`: `p_id` null adds; otherwise updates name, description, sort and active (kind stays).
  - `admin_add_price(p_product_id, p_amount_minor, p_list_amount_minor, p_interval_months,
    p_credits, p_credits_every_months, p_valid_days, p_replaces, p_actor, p_reason) returns table
    (price_id uuid, moved integer)`: with `p_replaces`, the old price must be on the same product;
    it is hidden and live subscriptions on it move to the new price from their next payment
    (`next_price_id`, unless they already chose another).
  - `admin_set_price_active(p_price_id, p_active, p_actor) returns boolean`
  - `billing_price_subscriber_counts() returns table (price_id uuid, subscribers integer)`: live
    subscriptions per price, counted in the database.

## Calls on load

`/admin/plans` loads in one `Promise.all`: products with their prices (one query, embedded), the
settings in force (one query), subscriber counts (one RPC). The catalog is tens of rows; counts
are grouped in the database, so the page stays three calls however many agencies subscribe.

## Code

- `src/lib/billing/pricing.ts`: `costMinor`, `periodCredits`, `realMarginPct`, `suggestAmountMinor`,
  `intervalLabel`, `PLAN_INTERVALS`, `GST_PCT`.
- `src/lib/billing/catalog-schema.ts`: zod for rupee amounts (`"10,100"` → 1010000 paise),
  percents, product and price forms.
- `src/lib/db/billing-catalog.ts`: `getCatalog()`, `getBillingSettings()`,
  `getSubscriberCounts()`, and one function per RPC.
- `src/lib/actions/billing-catalog.ts`: super admin only, parse, call, `revalidatePath("/admin/plans")`.
- `src/app/admin/plans/page.tsx` (server) and components in `src/components/admin/plans/`, reusing
  `BillingChangeDialog` and `SegmentedChoice` from piece 2.

## Testing

Pricing math (cost, margin, suggestion, interval credits); form parsing; data functions send the
right arguments; actions are super admin only with plain errors; migration text tests for the new
functions (locks, logs, server only, replace moves subscriptions); static render of the page
(margin warning below the minimum, hidden prices, agencies on a price).
