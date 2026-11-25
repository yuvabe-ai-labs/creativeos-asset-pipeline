import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is checked by hand on staging; this pins the catalog write rules: every change logged in the
// same transaction, a new price replaces the old for its subscribers, server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0093_billing_catalog_admin.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};
const WRITERS = ["admin_save_billing_settings", "admin_save_product", "admin_add_price", "admin_set_price_active"];
const FUNCTIONS = [...WRITERS, "billing_price_subscriber_counts"];

describe("migration 0093", () => {
  it("lets catalog changes be logged without an agency", () => {
    expect(SQL).toContain("alter table billing_log alter column org_id drop not null;");
  });

  it("logs every catalog change in the same transaction", () => {
    for (const name of WRITERS) {
      expect(fn(name), name).toContain("insert into billing_log (org_id, actor_id, action, before, after, reason)");
    }
  });

  it("replaces a price only on the same product, hiding the old and moving its subscribers", () => {
    const body = fn("admin_add_price");
    expect(body).toContain("from billing_prices where id = p_replaces for update");
    expect(body).toContain("if v_old.product_id <> p_product_id then");
    expect(body).toContain("update billing_prices set active = false where id = p_replaces;");
    expect(body).toContain("set next_price_id = v_new");
    expect(body).toContain("where s.status <> 'ended'");
    expect(body).toContain("(s.price_id = p_replaces and s.next_price_id is null) or s.next_price_id = p_replaces");
  });

  it("counts subscribers in the database, not per row on the page", () => {
    const body = fn("billing_price_subscriber_counts");
    expect(body).toContain("group by s.price_id");
    expect(body).toContain("where s.status <> 'ended'");
  });

  it("runs only for the server", () => {
    for (const name of FUNCTIONS) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
  });

  it("sets the 21 November pricing: Rs 100, 15% minimum margin", () => {
    expect(SQL).toMatch(/insert into billing_settings \(inr_per_usd, plan_margin_pct, topup_margin_pct, min_margin_pct, note\)\s+values \(100, 20, 25, 15,/);
  });
});
