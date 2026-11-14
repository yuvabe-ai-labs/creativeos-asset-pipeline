// src/app/api/orgs/[orgId]/write-routes.test.ts
// The people write routes through the real withTeam: who may call each, where the client comes
// from, and what reaches the audit log (spec §6.2, §6.6).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.unmock("@/lib/permissions/server");

const m = vi.hoisted(() => ({
  caller: null as unknown,
  impersonation: { isImpersonating: false } as Record<string, unknown>,
  log: vi.fn(async () => undefined),
  client: { id: "cA", org_id: "org-1", name: "Chupps" } as { id: string; org_id: string; name: string } | null,
  ops: {
    makeOwner: vi.fn(async () => ({ ok: true, value: null })),
    cancelInvite: vi.fn(async () => ({ ok: true, value: { email: "p@x.com" } })),
    resendInvite: vi.fn(async () => ({ ok: true, value: { invite: { id: "i1", email: "p@x.com" }, link: "https://app.example/invite/new", emailed: true } })),
    inviteToClient: vi.fn(async (_a: unknown, client: { id: string }, email: string) => ({ ok: true, value: { invite: { id: "i2", email, clientId: client.id }, link: "l", emailed: true } })),
    removeFromClient: vi.fn(async () => ({ ok: true, value: null })),
  },
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(async () => m.caller) }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => m.impersonation) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: m.log }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: vi.fn(async () => ({ id: "org-1", name: "Acme" })) }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(async () => m.client) }));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => "Asha") }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/people/ops", () => m.ops);

import { POST as makeOwnerPOST } from "./people/[userId]/owner/route";
import { DELETE as cancelDELETE } from "./invites/[inviteId]/route";
import { POST as resendPOST } from "./invites/[inviteId]/resend/route";
import { POST as invitePOST } from "./clients/[clientId]/invites/route";
import { DELETE as removeFromClientDELETE } from "./clients/[clientId]/members/[userId]/route";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { accessFromRows } from "@/lib/permissions/model";

const caller = (access: unknown, platformRole = "member", orgId = "org-1") => ({ userId: "u1", email: "u1@x.com", platformRole, orgId, mustChangePassword: false, access });
const superAdmin = () => caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
const inviteHolderOnA = () => caller(testAccess({ permissions: [], clientIds: [], clients: { cA: ["invite"] } }));
const post = (body?: unknown) => new Request("http://x", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const del = () => new Request("http://x", { method: "DELETE" });
const ownerParams = { params: Promise.resolve({ orgId: "org-1", userId: "u7" }) };

describe("people write routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.impersonation = { isImpersonating: false };
    m.client = { id: "cA", org_id: "org-1", name: "Chupps" };
  });

  describe("Make owner (Admin only, spec §6.6)", () => {
    it("is a 404 for the agency's own owner", async () => {
      m.caller = caller(testOwnerAccess());
      const res = await makeOwnerPOST(post(), { params: Promise.resolve({ orgId: "org-1", userId: "u7" }) });
      expect(res.status).toBe(404);
      expect(m.ops.makeOwner).not.toHaveBeenCalled();
    });

    it("is a 404 for a super admin on the agency path (viewing as that agency, elevated)", async () => {
      m.caller = superAdmin();
      m.impersonation = { isImpersonating: true, operatorId: "u1", targetOrgId: "org-1", elevated: true };
      const res = await makeOwnerPOST(post(), { params: Promise.resolve({ orgId: "org-1", userId: "u7" }) });
      expect(res.status).toBe(404);
      expect(m.ops.makeOwner).not.toHaveBeenCalled();
      // The elevated write gate records the attempt as a write_action; no ownership change is logged.
      expect(m.log).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: "admin_action" }));
    });

    it("moves ownership from Admin and logs it as an admin action", async () => {
      m.caller = superAdmin();
      const res = await makeOwnerPOST(post(), ownerParams);
      expect(res.status).toBe(200);
      expect(m.ops.makeOwner).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", viaAdmin: true }), "u7");
      expect(m.log).toHaveBeenCalledWith({ operatorId: "u1", targetOrgId: "org-1", eventType: "admin_action", detail: { action: "make_owner", userId: "u7" } });
    });
  });

  describe("manage_team routes refuse an Invite holder", () => {
    it("cancel, resend and remove from a client", async () => {
      m.caller = inviteHolderOnA();
      const inviteParams = { params: Promise.resolve({ orgId: "org-1", inviteId: "i1" }) };
      expect((await cancelDELETE(del(), inviteParams)).status).toBe(403);
      expect((await resendPOST(post(), { params: Promise.resolve({ orgId: "org-1", inviteId: "i1" }) })).status).toBe(403);
      expect((await removeFromClientDELETE(del(), { params: Promise.resolve({ orgId: "org-1", clientId: "cA", userId: "u7" }) })).status).toBe(403);
      expect(m.ops.cancelInvite).not.toHaveBeenCalled();
      expect(m.ops.resendInvite).not.toHaveBeenCalled();
      expect(m.ops.removeFromClient).not.toHaveBeenCalled();
    });
  });

  describe("audit detail names the person affected (spec §6.6)", () => {
    it("cancel and resend from Admin log the invite's email", async () => {
      m.caller = superAdmin();
      await cancelDELETE(del(), { params: Promise.resolve({ orgId: "org-1", inviteId: "i1" }) });
      expect(m.log).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { action: "cancel_invite", inviteId: "i1", email: "p@x.com" } }));
      await resendPOST(post(), { params: Promise.resolve({ orgId: "org-1", inviteId: "i1" }) });
      expect(m.log).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { action: "resend_invite", inviteId: "i1", email: "p@x.com" } }));
    });
  });

  describe("Invite someone new (spec §6.2)", () => {
    it("takes the client from the URL, never from the body", async () => {
      m.caller = inviteHolderOnA();
      const res = await invitePOST(post({ email: "new@x.com", clientId: "cB" }), { params: Promise.resolve({ orgId: "org-1", clientId: "cA" }) });
      expect(res.status).toBe(200);
      expect(m.ops.inviteToClient).toHaveBeenCalledWith(expect.anything(), { id: "cA", name: "Chupps" }, "new@x.com", expect.anything());
    });

    it("refuses an Invite holder on a client where they lack Invite", async () => {
      m.caller = caller(testAccess({ permissions: [], clientIds: [], clients: { cA: ["invite"], cB: ["generate"] } }));
      m.client = { id: "cB", org_id: "org-1", name: "Bata" };
      const res = await invitePOST(post({ email: "new@x.com" }), { params: Promise.resolve({ orgId: "org-1", clientId: "cB" }) });
      expect(res.status).toBe(403);
      expect(m.ops.inviteToClient).not.toHaveBeenCalled();
    });
  });
});
