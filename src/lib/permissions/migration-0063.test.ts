// src/lib/permissions/migration-0063.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is only checked by hand on staging (docs/auth-production-migration.md); this pins what the
// code and the review's C2 / I4 fixes depend on.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0063_close_views_and_count_resends.sql"), "utf8");

describe("migration 0063", () => {
  it("takes the three owner-rights views away from the public API", () => {
    for (const view of ["review_queue_items", "org_credit_usage", "stuck_reservations"]) {
      expect(SQL, view).toContain(`revoke all on ${view} from anon, authenticated;`);
      // A later re-grant would still read through the tables' own RLS, not the owner's rights.
      expect(SQL, view).toContain(`alter view ${view} set (security_invoker = true);`);
    }
  });

  it("closes org_review_counts to the public too, and drops the uncalled function", () => {
    expect(SQL).toContain("revoke all on function org_review_counts(uuid) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function org_review_counts(uuid) to service_role;");
    expect(SQL).toContain("drop function if exists org_review_counts_for_types(uuid, text[]);");
  });

  it("keeps the daily invite count on the agency row: no new table", () => {
    expect(SQL).toMatch(/alter table organizations\s+add column if not exists invite_window_start timestamptz,\s+add column if not exists invite_window_count int not null default 0;/);
    expect(SQL).not.toMatch(/create table/);
    expect(SQL).not.toContain("org_invitation_sends");
  });

  it("takes a send in one guarded update: a fresh 24-hour window, or one more below the limit", () => {
    const fn = SQL.slice(SQL.indexOf("create or replace function take_invite_send(p_org_id uuid, p_limit int)"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toContain("returns boolean");
    expect(body.match(/update organizations/g)).toHaveLength(1);
    expect(body).toContain("invite_window_start <= now() - interval '1 day' then now()");
    expect(body).toContain("invite_window_start <= now() - interval '1 day' then 1");
    expect(body).toContain("else invite_window_count + 1 end");
    expect(body).toMatch(/where id = p_org_id\s+and \(invite_window_start is null\s+or invite_window_start <= now\(\) - interval '1 day'\s+or invite_window_count < p_limit\);/);
    expect(body).toContain("return found;");
  });

  it("pins search_path on every security definer function and keeps them for the service role", () => {
    const definers = SQL.match(/security definer/g) ?? [];
    const pinned = SQL.match(/security definer set search_path = public/g) ?? [];
    expect(definers.length).toBe(1);
    expect(pinned.length).toBe(definers.length);
    expect(SQL).toContain("revoke all on function take_invite_send(uuid, int) from public, anon, authenticated;");
    expect(SQL).toContain("grant execute on function take_invite_send(uuid, int) to service_role;");
  });

  it("reloads the API schema", () => {
    expect(SQL).toContain("notify pgrst, 'reload schema';");
  });
});
