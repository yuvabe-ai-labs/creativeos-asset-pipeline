import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the usage read: charged credits only, one agency, one period, indexed, server only.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0073_usage_by.sql"), "utf8");
const body = SQL.slice(SQL.indexOf("create or replace function org_credit_usage_by("), SQL.indexOf("$$;"));

describe("migration 0073", () => {
  it("indexes an agency's runs by time", () => {
    expect(SQL).toContain("on generations (org_id, created_at)");
  });

  it("sums what was charged, for one agency and period", () => {
    expect(body).toContain("sum(g.credits_charged) as credits");
    expect(body).toContain("where g.org_id = p_org_id");
    expect(body).toContain("g.created_at >= p_from");
    expect(body).toContain("g.created_at < p_to");
  });

  it("groups by member, client or canvas, runs off a canvas included", () => {
    expect(body).toContain("when 'member' then g.user_id");
    expect(body).toContain("when 'client' then g.client_id");
    expect(body).toContain("else n.canvas_id");
    expect(body).toContain("left join nodes n on n.id = g.node_id");
  });

  it("runs only for the server", () => {
    expect(body).toContain("security definer");
    expect(SQL).toContain("revoke all on function org_credit_usage_by(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function org_credit_usage_by(uuid, timestamptz, timestamptz, text) to service_role;");
  });
});
