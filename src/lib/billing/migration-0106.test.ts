import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Usage page's reads (D597): the ledger's charges, one agency, India days, server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0106_usage_overview.sql"), "utf8");
const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$$;", start));
};

describe("migration 0106", () => {
  it("reads charges from the ledger, which keeps them when a run is deleted", () => {
    for (const name of ["org_usage_overview", "org_usage_runs"]) {
      const body = fn(name);
      expect(body).toContain("from credit_transactions t");
      expect(body).toContain("t.org_id = p_org_id");
      expect(body).toContain("t.type = 'consumption'");
      expect(body).toContain("t.amount > 0");
    }
    expect(fn("org_usage_overview")).toContain("left join generations g on g.id = t.generation_id");
    expect(fn("org_usage_overview")).toContain("t.generation_id is null as removed");
  });

  it("returns every section the page needs in one read, days in India time", () => {
    const body = fn("org_usage_overview");
    for (const section of ["'day'", "'model'", "'member'", "'client'", "'canvas'", "'previous'", "'pace'"]) expect(body).toContain(`select ${section}`);
    expect(body).toContain("at time zone 'Asia/Kolkata'");
    expect(body).toContain("now() - interval '7 days'");
  });

  it("lists a group's runs newest first, bounded, with the count", () => {
    const body = fn("org_usage_runs");
    expect(body).toContain("when 'kind' then g.type = any(p_types)");
    expect(body).toContain("is not distinct from p_key");
    expect(body).toContain("order by r.created_at desc");
    expect(body).toContain("limit least(greatest(p_limit, 1), 100)");
    expect(body).toContain("count(*) over ()");
  });

  it("runs only for the server", () => {
    for (const name of ["org_usage_overview", "org_usage_runs"]) {
      expect(fn(name)).toContain("security definer");
      expect(fn(name)).toContain("set search_path = public");
    }
    expect(SQL).toContain("revoke all on function org_usage_overview(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function org_usage_overview(uuid, timestamptz, timestamptz, timestamptz) to service_role;");
    expect(SQL).toContain("revoke all on function org_usage_runs(uuid, timestamptz, timestamptz, text, text, text[], integer, integer) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function org_usage_runs(uuid, timestamptz, timestamptz, text, text, text[], integer, integer) to service_role;");
    expect(SQL.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
