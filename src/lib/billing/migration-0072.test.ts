import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the top-up payment rules: credits once, ending with the plan month, test payments unchanged.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0072_top_ups.sql"), "utf8");
const body = SQL.slice(SQL.indexOf("create or replace function record_razorpay_payment("), SQL.indexOf("$$;"));

describe("migration 0072", () => {
  it("marks a payment paid once", () => {
    expect(body).toContain("where bp.razorpay_order_id = p_order_id for update");
    expect(body).toContain("if not found or v_row.status = 'paid' then");
  });

  it("ends a top-up with the plan month, after its own days, or in 30 days so it is never lost", () => {
    expect(body).toContain("when v_valid_days is not null then now() + make_interval(days => v_valid_days)");
    expect(body).toContain("when v_period_end is not null and v_period_end > now() then v_period_end");
    expect(body).toContain("else now() + interval '30 days'");
    expect(body).toContain("values (v_row.org_id, 'topup', v_row.credits, now(), v_ends,");
  });

  it("keeps the test top-up's adjustment", () => {
    expect(body).toContain("values (v_row.org_id, -v_row.credits, 'adjustment');");
  });

  it("runs only for the server", () => {
    expect(body).toContain("security definer");
    expect(SQL).toContain("revoke all on function record_razorpay_payment(text, text) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function record_razorpay_payment(text, text) to service_role;");
  });
});
