import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins what the price approvals read and write (D595).
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0104_price_approvals.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.search(new RegExp(`create (or replace )?function ${name}\\(`));
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("migration 0104", () => {
  it("adds the four columns re-runnably and the scheduled status", () => {
    for (const col of ["ends_unless_approved_at", "approval_reminded_at", "approved_at", "starts_at"]) {
      expect(SQL).toContain(`alter table billing_subscriptions add column if not exists ${col} timestamptz;`);
    }
    expect(SQL).toContain("check (status in ('created', 'scheduled', 'active', 'payment_due', 'cancelling', 'ended'))");
    expect(SQL).toContain("drop constraint if exists billing_subscriptions_status_check");
  });

  it("keeps one live plan per agency and at most one approval beside it", () => {
    expect(SQL).toContain("drop index if exists billing_subscriptions_one_live_idx;");
    expect(SQL).toMatch(/create unique index if not exists billing_subscriptions_one_live_idx on billing_subscriptions \(org_id\)\s+where status not in \('ended', 'scheduled'\);/);
    expect(SQL).toMatch(/create unique index if not exists billing_subscriptions_one_scheduled_idx on billing_subscriptions \(org_id\)\s+where status = 'scheduled';/);
    expect(SQL).toContain("create index if not exists billing_subscriptions_ends_unless_approved_idx");
  });

  it("gives a UPI or mandate refusal an end date at least 7 days away, never earlier than before", () => {
    const body = fn("record_plan_move");
    expect(body).toContain("if p_refused in ('upi', 'emandate') then");
    expect(body).toContain("while v_ends < now() + interval '7 days' loop");
    expect(body).toContain("v_ends := v_ends + interval '1 month';");
    expect(body).toContain("v_ends := greatest(v_ends, v_sub.ends_unless_approved_at);");
    expect(body).toContain("ends_unless_approved_at = v_ends");
    expect(body).toContain("'ends_at', v_ends");
  });

  it("records an approval once and clears the live plan's ask", () => {
    const body = fn("record_price_approval");
    expect(body).toContain("v_new.status <> 'scheduled' or v_new.approved_at is not null then");
    expect(body).toContain("set next_price_id = null");
    expect(body).toContain("'price_approved'");
  });

  it("makes an approval the plan when it starts, ending the one it replaces first", () => {
    expect(fn("billing_end_replaced_subscription")).toContain("s.status not in ('ended', 'scheduled')");
    for (const name of ["set_subscription_status", "record_subscription_charge"]) {
      const body = fn(name);
      expect(body, name).toContain("perform billing_end_replaced_subscription(v_sub.org_id, v_sub.id);");
      expect(body, name).toContain("approved_at = coalesce(s.approved_at, now())");
    }
    expect(fn("set_subscription_status")).toContain("if p_status not in ('active', 'payment_due', 'ended') then");
  });

  it("logs a plan that ended without approval and ends the unfinished approvals with it", () => {
    const body = fn("billing_subscriptions_on_end");
    expect(body).toContain("x.approved_at is not null and x.status <> 'ended'");
    expect(body).toContain("x.status = 'scheduled' and x.approved_at is null");
    expect(body).toContain("'price_not_approved'");
    expect(SQL).toContain("for each row when (new.status = 'ended' and old.status <> 'ended')");
  });

  it("moves approvals on a replaced price and lists the plans in their final cycle for Admin", () => {
    expect(fn("admin_save_offer")).toContain("where s.status in ('created', 'scheduled', 'active', 'payment_due')");
    expect(SQL).toContain("drop function if exists admin_price_moves();");
    const moves = fn("admin_price_moves");
    expect(moves).toContain("(s.status = 'cancelling' and s.ends_unless_approved_at is not null)");
    expect(moves).toContain("first_end timestamptz");
    expect(moves).toContain("'ends_at', s.ends_unless_approved_at");
  });

  it("asks again the plans 0103 refused as UPI or mandate", () => {
    expect(SQL).toMatch(/set next_price_refused = null, updated_at = now\(\)\s+where s\.next_price_refused in \('upi', 'emandate'\)/);
  });

  it("runs only for the server", () => {
    for (const name of ["billing_end_replaced_subscription", "set_subscription_status", "record_subscription_charge", "record_plan_move", "record_price_approval", "admin_save_offer", "admin_price_moves"]) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
    expect(fn("billing_subscriptions_on_end")).toContain("set search_path = public");
    expect(SQL.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
