import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is checked by hand on staging (spec "Checking"); this pins the rules that keep the catalog
// safe to grow into: fixed prices, one live plan per agency, server-only reads, indexed lookups.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0092_billing_catalog.sql"), "utf8");
const TABLES = ["billing_products", "billing_prices", "billing_settings", "billing_discounts", "billing_accounts", "billing_subscriptions", "razorpay_events"];

describe("migration 0092", () => {
  it("turns on RLS for every new table; owners read only their plan and billing details", () => {
    for (const t of TABLES) expect(SQL, t).toContain(`alter table ${t} enable row level security;`);
    expect(SQL).toContain('create policy "owners read" on billing_subscriptions for select');
    expect(SQL).toContain('create policy "owners read" on billing_accounts for select');
    expect(SQL.match(/create policy/g)?.length).toBe(2);
  });

  it("never lets a price change once written", () => {
    expect(SQL).toContain("create trigger billing_prices_fixed before update on billing_prices");
    for (const col of ["product_id", "currency", "amount_minor", "list_amount_minor", "interval_months", "credits", "credits_every_months", "valid_days"]) {
      expect(SQL, col).toContain(`new.${col} is distinct from old.${col}`);
    }
  });

  it("supports monthly to yearly plans with credits arriving inside the period, and top-ups", () => {
    expect(SQL).toContain("interval_months % credits_every_months = 0");
    expect(SQL).toContain("(interval_months is null and credits_every_months is null)");
    expect(SQL).toContain("valid_days integer");
  });

  it("allows a custom plan for one agency", () => {
    expect(SQL).toMatch(/create table billing_products \([\s\S]*org_id uuid references organizations\(id\) on delete cascade/);
  });

  it("keeps one live subscription per agency", () => {
    expect(SQL).toContain("create unique index billing_subscriptions_one_live_idx on billing_subscriptions (org_id) where status <> 'ended';");
  });

  it("stores each webhook once by its event id", () => {
    expect(SQL).toContain("event_id text primary key");
  });

  it("records what each payment was charged with, keeping old rows as the test top-up", () => {
    for (const col of ["price_id", "subscription_id", "discount_id", "currency", "discount_minor", "tax_minor", "total_minor", "inr_per_usd", "razorpay_invoice_id"]) {
      expect(SQL, col).toContain(`add column ${col} `);
    }
    expect(SQL).toContain("add column kind text not null default 'test'");
    expect(SQL).toContain("check (status in ('created', 'paid', 'failed', 'refunded'))");
  });

  it("indexes every foreign key it adds", () => {
    const found: string[] = [];
    for (const m of SQL.matchAll(/(?:add column )?(\w+) uuid (?:not null )?references (\w+)\(/g)) {
      const col = m[1];
      const table = [...SQL.slice(0, m.index).matchAll(/(?:create table|alter table) (\w+)/g)].at(-1)![1];
      if (col === "created_by" || (table === "billing_accounts" && col === "org_id")) continue; // auth users; the primary key
      found.push(`${table}.${col}`);
      const indexed = SQL.includes(`on ${table} (${col})`) || SQL.includes(`on ${table} (${col},`);
      expect(indexed, `${table}.${col}`).toBe(true);
    }
    expect(found.length).toBe(14);
  });

  it("starts with one settings row at the planning rate", () => {
    expect(SQL).toMatch(/insert into billing_settings \(inr_per_usd[^;]*values \(100,/);
  });
});
