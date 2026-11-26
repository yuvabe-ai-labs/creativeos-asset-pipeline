import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins what Admin › Plans and prices and Admin › Payments read (D592).
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0102_admin_plans_payments.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("migration 0102", () => {
  it("indexes the payments ledger with started checkouts, and drops the index that left them out", () => {
    expect(SQL).toContain("create index if not exists billing_payments_admin_created_at_idx on billing_payments (created_at desc)");
    expect(SQL).toContain("where kind <> 'test';");
    expect(SQL).toContain("drop index if exists billing_payments_listed_created_at_idx;");
    expect(SQL).not.toMatch(/create index (?!if not exists)/);
  });

  it("counts only running plans on a price, and what the active ones bring each month", () => {
    const body = fn("admin_offer_health");
    expect(body).toContain("where s.status in ('active', 'cancelling', 'payment_due')");
    expect(body).toContain("filter (where s.status = 'cancelling')");
    expect(body).toContain("filter (where s.status = 'payment_due')");
    expect(body).toContain("greatest(coalesce(pr.interval_months, 1), 1)");
    expect(body).toContain("bp.status = 'paid' and bp.kind <> 'test'");
    expect(body).toContain("bp.created_at >= p_since");
    expect(body).toContain("full outer join paid p on p.price_id = s.price_id");
  });

  it("totals payments by status for a date range and an agency search, test top-ups left out", () => {
    const body = fn("admin_payment_totals");
    expect(body).toContain("where bp.kind <> 'test'");
    expect(body).toContain("(p_from is null or bp.created_at >= p_from)");
    expect(body).toContain("(p_to is null or bp.created_at < p_to)");
    expect(body).toContain("(p_query is null or o.name ilike '%' || p_query || '%')");
    expect(body).toContain("group by bp.status");
  });

  it("runs only for the server", () => {
    for (const name of ["admin_offer_health", "admin_payment_totals"]) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
    expect(SQL.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
