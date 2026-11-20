import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the one-step plan save: product, price and log together; a changed price is a new row that
// replaces the old one for its subscribers; server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0070_billing_save_offer.sql"), "utf8");
const body = SQL.slice(SQL.indexOf("create or replace function admin_save_offer("), SQL.indexOf("$$;"));

describe("migration 0070", () => {
  it("adds a product with its first price and logs it", () => {
    expect(body).toContain("insert into billing_products (kind, name, description, active)");
    expect(body).toContain("insert into billing_prices (product_id, amount_minor, interval_months, credits, credits_every_months)");
    expect(body.match(/insert into billing_log/g)?.length).toBe(2);
  });

  it("adds a new price only when the amount or credits change, hiding the old and moving its subscribers", () => {
    expect(body).toContain("v_price.amount_minor <> p_amount_minor or v_price.credits <> p_credits");
    expect(body).toContain("update billing_prices pr set active = false where pr.id = v_price.id;");
    expect(body).toContain("(s.price_id = v_price.id and s.next_price_id is null) or s.next_price_id = v_price.id");
  });

  it("qualifies every column, since the returned names are variables too", () => {
    expect(body).not.toMatch(/\bwhere (id|product_id|status|price_id) /);
  });

  it("runs only for the server", () => {
    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = public");
    expect(SQL).toContain("revoke all on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function admin_save_offer(uuid, text, text, text, boolean, bigint, numeric, integer, uuid, text) to service_role;");
  });
});
