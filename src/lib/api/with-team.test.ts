// src/lib/api/with-team.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.unmock("@/lib/permissions/server");

const m = vi.hoisted(() => ({
  caller: null as unknown,
  impersonation: { isImpersonating: false } as Record<string, unknown>,
  log: vi.fn(async () => undefined),
  org: { id: "org-1", name: "Acme" } as { id: string; name: string } | null,
  client: { id: "c1", org_id: "org-1", name: "Chupps" } as { id: string; org_id: string; name: string } | null,
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(async () => m.caller) }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => m.impersonation) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: m.log }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: vi.fn(async () => m.org) }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(async () => m.client) }));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => "Asha") }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { withTeam } from "./route-helpers";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { accessFromRows } from "@/lib/permissions/model";

const req = (method: string) => new Request("http://x/api/orgs/org-1/people", { method });
const ok = vi.fn(async () => NextResponse.json({ ok: true }));
const caller = (access: unknown, platformRole = "member", orgId = "org-1") => ({ userId: "u1", email: "u1@x.com", platformRole, orgId, mustChangePassword: false, access });

describe("withTeam (spec §6.1, §6.6)", () => {
  beforeEach(() => {
    ok.mockClear();
    m.log.mockClear();
    m.impersonation = { isImpersonating: false };
    m.org = { id: "org-1", name: "Acme" };
    m.client = { id: "c1", org_id: "org-1", name: "Chupps" };
  });

  it("lets the owner manage their own agency", async () => {
    m.caller = caller(testOwnerAccess());
    const res = await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok);
    expect(res.status).toBe(200);
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", orgName: "Acme", viaAdmin: false, actor: { userId: "u1", name: "Asha" } }));
  });

  it("refuses a member with 403, and another agency with 404", async () => {
    m.caller = caller(testAccess({ permissions: ["generate", "share"], clientIds: ["c1"] }));
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(403);
    m.caller = caller(testOwnerAccess("org-2"), "member", "org-2");
    expect((await withTeam(req("GET"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(404);
    expect(ok).not.toHaveBeenCalled();
  });

  it("lets an Invite holder invite on their client, not on another, and never manage the team", async () => {
    m.caller = caller(testAccess({ permissions: [], clientIds: [], clients: { c1: ["invite"], c2: [] } }));
    await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c1" }), { need: "invite" }, ok);
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ canManage: false, viaAdmin: false }));
    ok.mockClear();
    m.client = { id: "c2", org_id: "org-1", name: "Bata" };
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c2" }), { need: "invite" }, ok)).status).toBe(403);
    m.client = { id: "c3", org_id: "org-1", name: "Not theirs" };
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c3" }), { need: "invite" }, ok)).status).toBe(404);
    m.client = { id: "c1", org_id: "org-1", name: "Chupps" };
    // Remove from a client, resend, cancel: manage_team, owner only.
    expect((await withTeam(req("DELETE"), Promise.resolve({ orgId: "org-1", clientId: "c1" }), { need: "manage_team" }, ok)).status).toBe(403);
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(403);
    expect(ok).not.toHaveBeenCalled();
  });

  it("refuses inviting without Invite", async () => {
    m.caller = caller(testAccess({ permissions: ["generate", "approve", "share", "delete"], clientIds: ["c1"] }));
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c1" }), { need: "invite" }, ok)).status).toBe(403);
    expect((await withTeam(req("GET"), Promise.resolve({ orgId: "org-1" }), { need: "invite" }, ok)).status).toBe(403);
    expect(ok).not.toHaveBeenCalled();
  });

  it("lets an Invite holder read the people list with no client named, and tells the handler they can't manage", async () => {
    m.caller = caller(testAccess({ permissions: ["invite"], clientIds: ["c1"] }));
    await withTeam(req("GET"), Promise.resolve({ orgId: "org-1" }), { need: "invite" }, ok);
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ canManage: false }));
    m.caller = caller(testOwnerAccess());
    await withTeam(req("GET"), Promise.resolve({ orgId: "org-1" }), { need: "invite" }, ok);
    expect(ok).toHaveBeenLastCalledWith(expect.objectContaining({ canManage: true }));
  });

  it("lets a super admin manage any agency from Admin, writing each change to the audit log", async () => {
    m.caller = caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
    const handler = vi.fn(async (ctx: { logAdmin: (a: string, d?: Record<string, unknown>) => Promise<void> }) => {
      await ctx.logAdmin("remove_person", { userId: "u7" });
      return NextResponse.json({ ok: true });
    });
    const res = await withTeam(req("DELETE"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, handler as never);
    expect(res.status).toBe(200);
    expect(m.log).toHaveBeenCalledWith({ operatorId: "u1", targetOrgId: "org-1", eventType: "admin_action", detail: { action: "remove_person", userId: "u7" } });
  });

  it("keeps view-as rules while the super admin views as that agency (read-only blocks writes)", async () => {
    m.caller = caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
    m.impersonation = { isImpersonating: true, operatorId: "u1", targetOrgId: "org-1", elevated: false };
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(403);
  });

  it("answers 404 for a client of another agency, and hands over the client otherwise", async () => {
    m.caller = caller(testOwnerAccess());
    m.client = { id: "c9", org_id: "org-2", name: "Other" };
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c9" }), { need: "manage_team" }, ok)).status).toBe(404);
    m.client = { id: "c1", org_id: "org-1", name: "Chupps" };
    await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c1" }), { need: "manage_team" }, ok);
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ client: expect.objectContaining({ id: "c1" }) }));
  });

  it("answers 404 for an agency that does not exist", async () => {
    m.caller = caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
    m.org = null;
    expect((await withTeam(req("GET"), Promise.resolve({ orgId: "nope" }), { need: "manage_team" }, ok)).status).toBe(404);
  });
});
