import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0101_admin_agency_activity.sql"), "utf8");

describe("migration 0101", () => {
  it("adds admin_agency_activity as a re-runnable, service-role-only definer function", () => {
    expect(SQL).toContain("create or replace function admin_agency_activity()");
    expect(SQL).toContain("returns table (org_id uuid, owner_email text, member_count integer, last_run_at timestamptz)");
    expect(SQL).toMatch(/security definer\s+set search_path = public/);
    expect(SQL).toContain("revoke all on function admin_agency_activity() from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function admin_agency_activity() to service_role;");
    expect(SQL.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });

  it("reads each agency's values by its own lookups, the owner's email from the login", () => {
    expect(SQL).toContain("join auth.users u on u.id = m.user_id");
    expect(SQL).toContain("where m.org_id = o.id and m.is_owner");
    expect(SQL).toContain("(select max(g.created_at) from generations g where g.org_id = o.id)");
  });
});
