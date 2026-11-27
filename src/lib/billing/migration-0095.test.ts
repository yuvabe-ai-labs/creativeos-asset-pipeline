import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the monthly plan rules: a charge is recorded once and grants the month's credits; a failed
// payment stops runs; server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0095_monthly_plans.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("migration 0095", () => {
  it("records each Razorpay payment once", () => {
    const body = fn("record_subscription_charge");
    expect(body).toContain("for update");
    expect(body).toContain("where bp.razorpay_payment_id = p_payment_id");
    expect(body.match(/return false;/g)?.length).toBe(2);
  });

  it("charges the plan Razorpay charged, so a scheduled change lands on the next payment", () => {
    const body = fn("record_subscription_charge");
    expect(body).toContain("where pr.razorpay_plan_id = p_razorpay_plan_id");
    expect(body).toContain("price_id = v_price.id");
    expect(body).toContain("next_price_id = case when s.next_price_id = v_price.id then null else s.next_price_id end");
  });

  it("writes the month's plan credits ending with the paid period, and keeps a cancelled plan cancelling", () => {
    const body = fn("record_subscription_charge");
    expect(body).toContain("values (v_sub.org_id, 'plan', v_price.credits, now(), p_period_end, v_payment, v_price.id, v_sub.id,");
    expect(body).toContain("case when s.status = 'cancelling' then 'cancelling' else 'active' end");
  });

  it("keeps the amount before tax, the tax, the total and the rate on the payment", () => {
    const body = fn("record_subscription_charge");
    expect(body).toContain("greatest(p_total_minor - v_price.amount_minor, 0), p_total_minor, v_rate");
  });

  it("stops AI runs while a payment is due, before looking at credits", () => {
    const body = fn("reserve_credits_v2");
    const due = body.indexOf("return 'payment_due';");
    expect(due).toBeGreaterThan(-1);
    expect(due).toBeLessThan(body.indexOf("from credit_grants g"));
    expect(body).toContain("if v_mode = 'managed' then");
  });

  it("runs only for the server", () => {
    for (const name of ["record_subscription_charge", "set_subscription_status"]) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
  });
});
