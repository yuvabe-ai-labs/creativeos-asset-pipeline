// src/lib/permissions/migration-0062.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS } from "./model";

// The migration was never applied anywhere, so it is rewritten rather than corrected (spec §3).
// SQL is only checked by hand on staging (spec §11); this pins what the code depends on.
const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0062_permission_based_access.sql"), "utf8");

describe("migration 0062", () => {
  it("allows exactly the six permissions, in the code's order, wherever permissions are stored", () => {
    const lists = [...SQL.matchAll(/permissions <@ array\[([^\]]+)\]::text\[\]/g)].map((m) =>
      m[1].split(",").map((s) => s.trim().replace(/'/g, "")),
    );
    expect(lists).toHaveLength(2);
    for (const list of lists) expect(list).toEqual([...PERMISSIONS]);
  });

  it("has no presets, per-person ticks or all-clients flag", () => {
    for (const gone of ["role_presets", "role_preset_permissions", "membership_permission_changes", "all_clients", "preset_id"]) {
      expect(SQL, gone).not.toContain(gone);
    }
  });

  it("keeps one owner per agency with a unique index, and one agency per person", () => {
    expect(SQL).toMatch(/create unique index if not exists org_memberships_one_owner\s+on org_memberships \(org_id\) where is_owner;/);
    expect(SQL).not.toMatch(/drop index[^;]*one_org_per_user/);
  });

  it("protects the owner at the end of the transaction", () => {
    expect(SQL).toMatch(/create constraint trigger org_memberships_keep_owner\s+after update or delete on org_memberships\s+deferrable initially deferred/);
    expect(SQL).toContain("The agency owner can''t be removed.");
  });

  it("ties every member invitation to a client and the owner's to none", () => {
    expect(SQL).toContain("check ((client_id is null) = as_owner)");
  });

  it("defines the functions the code calls, each for the service role only", () => {
    for (const fn of [
      "get_membership_access(uuid)",
      "transfer_agency_owner(uuid, uuid)",
      "create_agency_with_owner_invite(text, text, text, text, uuid)",
      "accept_invitation(text, uuid, text)",
      "list_agency_people(uuid)",
      "find_user_by_email(text)",
    ]) {
      expect(SQL, fn).toContain(`revoke all on function ${fn} from public, anon, authenticated;`);
      expect(SQL, fn).toContain(`grant execute on function ${fn} to service_role;`);
    }
  });

  it("sets search_path on every security definer function", () => {
    const definers = SQL.match(/security definer/g) ?? [];
    const pinned = SQL.match(/security definer set search_path = public/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned.length).toBe(definers.length);
  });

  it("stores each invite link's token as issued, unique, with no hash", () => {
    expect(SQL).toMatch(/^\s+token\s+text not null,$/m);
    expect(SQL).toContain("create unique index if not exists org_invitations_token_key on org_invitations (token);");
    expect(SQL).not.toMatch(/token_hash|sha256/);
  });

  it("lets the audit log record changes made from Admin", () => {
    expect(SQL).toContain("'admin_action'");
  });
});
