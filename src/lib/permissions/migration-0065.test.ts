// src/lib/permissions/migration-0065.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SQL is only checked by hand on staging (docs/auth-production-migration.md); this pins what the
// permission tests of 17 November found missing: the browser's direct reads follow the client list.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0065_client_scoped_reads.sql"), "utf8");
// The statements without the comments, for counts that the explanations would throw off.
const CODE = SQL.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");
const policy = (table: string) => {
  const start = SQL.indexOf(`create policy "org isolation" on ${table} for select`);
  expect(start, table).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf(";", start)).replace(/\s+/g, " ");
};

describe("migration 0065", () => {
  it("lists the clients a person may see: every client of an agency they own, or one they're on after access is given", () => {
    const fn = SQL.slice(SQL.indexOf("create or replace function auth_client_ids()"));
    const body = fn.slice(0, fn.indexOf("$$;"));
    expect(body).toContain("where m.user_id = auth.uid() and m.is_owner");
    expect(body).toContain("where mc.user_id = auth.uid() and m.access_given_at is not null");
  });

  it("scopes each client-owned table to those clients, keeping the agency check first", () => {
    const scoped: [string, string][] = [
      ["canvases", "client_id in (select auth_client_ids())"],
      ["client_kb_jobs", "client_id in (select auth_client_ids())"],
      ["generations", "generation_client_id(node_id, avatar_id, script_id) in (select auth_client_ids())"],
      ["node_versions", "node_client_id(node_id) in (select auth_client_ids())"],
      ["node_version_decisions", "version_client_id(version_id) in (select auth_client_ids())"],
      ["node_version_annotations", "decision_client_id(decision_id) in (select auth_client_ids())"],
      ["moodboard_items", "moodboard_client_id(moodboard_id) in (select auth_client_ids())"],
    ];
    for (const [table, rule] of scoped) {
      const p = policy(table);
      expect(p, table).toContain("org_id in (select auth_org_ids()) and");
      expect(p, table).toContain(rule);
      expect(SQL, table).toContain(`drop policy if exists "org isolation" on ${table};`);
    }
  });

  it("leaves the credit ledger to owners only", () => {
    const p = policy("credit_transactions");
    expect(p).toContain("m.user_id = auth.uid() and m.org_id = credit_transactions.org_id and m.is_owner");
  });

  it("pins search_path on every definer function and lets the browser's role call them inside policies", () => {
    const definers = CODE.match(/security definer/g) ?? [];
    expect(definers.length).toBe(6);
    expect((CODE.match(/security definer set search_path = public/g) ?? []).length).toBe(definers.length);
    expect(SQL).toContain("execute format('revoke all on function %s from public, anon', f);");
    expect(SQL).toContain("execute format('grant execute on function %s to authenticated, service_role', f);");
    for (const f of ["auth_client_ids()", "node_client_id(uuid)", "version_client_id(uuid)", "decision_client_id(uuid)", "moodboard_client_id(uuid)", "generation_client_id(uuid, uuid, uuid)"]) {
      expect(SQL, f).toContain(`'${f}'`);
    }
  });

  it("adds no tables and reloads the API schema", () => {
    expect(SQL).not.toMatch(/create table/);
    expect(SQL.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
