import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the failed-payment rules: states only move forward, a due payment knows when it started,
// a late charge never moves the period back.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0098_payment_due_rules.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("migration 0098", () => {
  it("records when a payment became due, indexed for the 30-day end", () => {
    expect(SQL).toContain("alter table billing_subscriptions add column payment_due_since timestamptz;");
    expect(SQL).toContain("on billing_subscriptions (payment_due_since)");
  });

  it("keeps an ended plan ended and ignores a late payment-due for a period already paid", () => {
    const body = fn("set_subscription_status");
    expect(body).toContain("if not found or v_sub.status = 'ended' then");
    expect(body).toContain("p_period_end < v_sub.current_period_end");
    expect(body).toContain("current_period_end = greatest(s.current_period_end, p_period_end)");
  });

  it("starts the due date once and clears it when no longer due", () => {
    expect(fn("set_subscription_status")).toContain("payment_due_since = case when p_status = 'payment_due' then coalesce(s.payment_due_since, now()) else null end");
    expect(fn("record_subscription_charge")).toContain("payment_due_since = null");
  });

  it("moves the plan forward only for the latest period's charge, still recording older ones once", () => {
    const body = fn("record_subscription_charge");
    expect(body).toContain("where bp.razorpay_payment_id = p_payment_id");
    expect(body).toContain("v_latest := v_sub.current_period_end is null or p_period_end >= v_sub.current_period_end;");
    expect(body).toContain("if v_latest and v_sub.status <> 'ended' then");
    expect(body).toContain("least(now(), p_period_end - interval '1 second'), p_period_end");
  });

  it("runs only for the server", () => {
    for (const name of ["set_subscription_status", "record_subscription_charge"]) {
      expect(fn(name), name).toContain("security definer");
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
  });
});
