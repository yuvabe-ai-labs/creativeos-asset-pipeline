import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is checked by hand on staging (spec "Checking the SQL"); this pins the rules that keep the
// ledger safe: one agency at a time, end-date order, repeat calls change nothing, server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0067_credit_grants.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};
const ADMIN = ["admin_set_billing_mode", "admin_grant_credits", "admin_take_back_credits", "admin_set_grant_end"];
const FUNCTIONS = ["reserve_credits_v2", "settle_credits", "refund_credits", "credit_balance", ...ADMIN];

describe("migration 0067", () => {
  it("keeps every existing agency managed and standard", () => {
    expect(SQL).toContain("billing_mode text not null default 'managed'");
    expect(SQL).toContain("plan_type text not null default 'standard'");
  });

  it("turns on RLS for the new tables and lets owners read only their grants", () => {
    for (const t of ["credit_grants", "credit_grant_uses", "billing_log"]) {
      expect(SQL, t).toContain(`alter table ${t} enable row level security;`);
    }
    expect(SQL).toContain('create policy "owners read" on credit_grants for select');
    expect(SQL.match(/create policy/g)?.length).toBe(1);
  });

  it("indexes what the functions filter on", () => {
    expect(SQL).toContain("on credit_grants (org_id, ends_at)");
    expect(SQL).toContain("on credit_grants (payment_id)");
    expect(SQL).toContain("on credit_grant_uses (grant_id)");
    expect(SQL).toContain("on billing_log (org_id)");
  });

  it("locks the agency first in each function that writes", () => {
    expect(fn("reserve_credits_v2")).toContain("from organizations where id = p_org_id for update");
    for (const name of ["settle_credits", "refund_credits"]) {
      expect(fn(name), name).toContain("perform 1 from organizations where id = p_org_id for update");
    }
  });

  it("uses the grant that ends first, first", () => {
    for (const name of ["reserve_credits_v2", "settle_credits", "credit_balance"]) {
      expect(fn(name), name).toContain("order by g.ends_at, g.created_at");
    }
  });

  it("keeps today's monthly limit for managed agencies", () => {
    const body = fn("reserve_credits_v2");
    expect(body).toContain("if v_mode = 'managed' then");
    expect(body).toContain("date_trunc('month', now() at time zone 'utc') at time zone 'utc'");
    expect(body).toContain("return 'limit';");
  });

  it("says why a paying agency was refused", () => {
    const body = fn("reserve_credits_v2");
    for (const r of ["used_up", "free_ended", "no_credits"]) expect(body).toContain(`return '${r}';`);
  });

  it("changes nothing when a run is settled or refunded twice", () => {
    for (const name of ["settle_credits", "refund_credits"]) {
      expect(fn(name), name).toContain("type in ('refund', 'consumption')");
      expect(fn(name), name).toContain("return false;");
    }
  });

  it("runs only for the server", () => {
    for (const name of FUNCTIONS) {
      expect(fn(name), name).toContain("security definer");
      expect(fn(name), name).toContain("set search_path = public");
      expect(SQL, name).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(SQL, name).toMatch(new RegExp(`grant execute on function ${name}\\([^)]*\\) to service_role;`));
    }
  });

  it("logs each admin change in the same transaction, after locking the agency", () => {
    for (const name of ADMIN) {
      const body = fn(name);
      expect(body, name).toMatch(/from organizations where id = (p_org_id|v_org) for update/);
      expect(body, name).toContain("insert into billing_log (org_id, actor_id, action, before, after, reason)");
    }
  });

  it("lets Admin write only free or added credits", () => {
    expect(fn("admin_grant_credits")).toContain("if p_kind not in ('free', 'admin') then");
  });

  it("never takes back more than is left", () => {
    const body = fn("admin_take_back_credits");
    expect(body).toContain("p_credits > greatest(v_grant.credits - v_grant.used, 0)");
    expect(body).toContain("return 'too_many';");
  });

  it("keeps a moved end date after the grant starts", () => {
    expect(fn("admin_set_grant_end")).toContain("greatest(p_ends_at, v_grant.starts_at + interval '1 second')");
  });

  it("leaves the old reserve_credits in place for the release in between", () => {
    expect(SQL).not.toMatch(/drop function[^;]*reserve_credits\(/);
  });
});
