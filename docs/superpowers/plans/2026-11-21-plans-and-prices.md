# Plans and prices (billing piece 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yuvabe manages plans, top-up packs, prices and pricing settings in Admin, with each price's real margin and a warning below the minimum.

**Architecture:** Migration 0069 adds the catalog write functions (each logs in the same transaction) and a settings row. Pure pricing math in `src/lib/billing/pricing.ts`. The `/admin/plans` server page loads the catalog, settings and subscriber counts in three parallel calls; changes go through super-admin server actions and `revalidatePath`, as on the agency page.

**Tech Stack:** Supabase Postgres, Next.js server actions, zod, shadcn (Base UI), Vitest.

Spec: `docs/superpowers/specs/2026-11-21-plans-and-prices-design.md`.

## Global Constraints

- 0067 and 0068 are applied: never edit them. Never apply migrations or run SQL. Never push. No AI attribution in commits.
- shadcn primitives only; reuse `BillingChangeDialog` and `SegmentedChoice` (piece 2).
- Plain copy, no vendor names. Amounts typed in whole rupees, stored in paise.
- Phase 1 plan intervals: monthly only (`PLAN_INTERVALS = [1]`).

---

### Task 1: Migration 0069
- [ ] Text test `src/lib/billing/migration-0069.test.ts`: the five functions are definer, search_path, service role only; writes log to `billing_log`; replace checks the same product, hides the old price and moves live subscriptions; `billing_log.org_id` nullable; settings row 100/20/25/15. Fails.
- [ ] Write `supabase/migrations/0069_billing_catalog_admin.sql`. Passes. Commit.

### Task 2: Pricing math, parsing, data layer, actions
- [ ] Tests for `pricing.ts` (cost of 100,000 credits at ₹100 = ₹10,000; real margin of ₹12,000 = 20%; suggestion at 20% = ₹12,000; a yearly price with monthly drops counts 12 drops; labels), `catalog-schema.ts` (rupees with commas, percents, refusals), `billing-catalog.ts` (RPC arguments, catalog embed, counts map), `actions/billing-catalog.ts` (super admin only, plain errors, revalidate). Fail.
- [ ] Implement; add the actions to the coverage allowlist. Pass; tsc. Commit.

### Task 3: The Plans and prices page
- [ ] Static render tests: settings shown; price rows with amount, + GST, credits, margin; warning below the minimum; Hidden; agencies on a price; empty states. Fail.
- [ ] Implement `src/app/admin/plans/page.tsx`, `src/components/admin/admin-section-nav.tsx` (on both admin pages), `src/components/admin/plans/*`. Pass; tsc. Commit.

### Task 4: Docs and a browser check
- [ ] Schema map (functions, `billing_log.org_id`), migration guide 0069, ADR D519.
- [ ] Open `/admin/plans` and an agency's Billing tab on the dev server (reads only). Commit.
