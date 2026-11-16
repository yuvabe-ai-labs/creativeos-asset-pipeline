import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  resolveCallerContext: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  getOrgById: vi.fn(), getDisplayName: vi.fn(), logImpersonationEvent: vi.fn(),
  createAgency: vi.fn(), resendOwnerInvite: vi.fn(), inviteOwner: vi.fn(),
  revalidatePath: vi.fn(), updateOrgCreditLimit: vi.fn(), resetMemberPassword: vi.fn(),
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: m.resolveCallerContext }));
vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: m.getOrgById, updateOrgCreditLimit: m.updateOrgCreditLimit, resetMemberPassword: m.resetMemberPassword, generateTempPassword: () => "generated-pw" }));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: m.getDisplayName }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: m.logImpersonationEvent }));
vi.mock("@/lib/people/ops", () => ({ createAgency: m.createAgency, resendOwnerInvite: m.resendOwnerInvite, inviteOwner: m.inviteOwner }));

import { createAgencyAction, inviteOwnerAction, resendOwnerInviteAction, resetMemberPasswordAction, updateOrgCreditLimitAction } from "./admin";

const ORG = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const ownerInvite = { id: "oi1", email: "o@x.com", clientId: null, clientName: null, asOwner: true, sentAt: "s", expiresAt: "e", invitedByName: null, link: "https://app.example/invite/new" };
const form = (name: string, email: string) => { const f = new FormData(); f.set("name", name); f.set("email", email); return f; };

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear();
  m.resolveCallerContext.mockResolvedValue({ userId: "admin-1", platformRole: "super_admin" });
  m.getOrgById.mockResolvedValue({ id: ORG, name: "Acme" });
  m.getDisplayName.mockResolvedValue("Yuva");
});

describe("admin actions are the super admin's only (D505)", () => {
  it("answers anyone else with not found and touches nothing", async () => {
    m.resolveCallerContext.mockResolvedValue({ userId: "u1", platformRole: "member" });
    await expect(resendOwnerInviteAction(ORG)).rejects.toThrow("NOT_FOUND");
    await expect(inviteOwnerAction(ORG, "o@x.com")).rejects.toThrow("NOT_FOUND");
    await expect(createAgencyAction(undefined, form("Acme", "o@x.com"))).rejects.toThrow("NOT_FOUND");
    expect(m.resendOwnerInvite).not.toHaveBeenCalled();
    expect(m.inviteOwner).not.toHaveBeenCalled();
    expect(m.createAgency).not.toHaveBeenCalled();
  });
});

describe("resendOwnerInviteAction", () => {
  it("resends and audits with the person affected", async () => {
    m.resendOwnerInvite.mockResolvedValue({ ok: true, value: { invite: ownerInvite, link: ownerInvite.link, emailed: true } });
    expect(await resendOwnerInviteAction(ORG)).toEqual({ link: ownerInvite.link, emailed: true });
    expect(m.resendOwnerInvite).toHaveBeenCalledWith({ orgId: ORG, orgName: "Acme" }, { userId: "admin-1", name: "Yuva" });
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "resend_owner_invite", email: "o@x.com" } });
  });

  it("refuses an id that isn't an agency id without reading anything", async () => {
    expect(await resendOwnerInviteAction("not-a-uuid")).toEqual({ error: "Agency not found." });
    expect(m.getOrgById).not.toHaveBeenCalled();
  });

  it("answers plainly when the database read fails", async () => {
    m.getOrgById.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resendOwnerInviteAction(ORG)).toEqual({ error: "Could not send the invite." });
  });

  it("passes a refusal through and audits nothing", async () => {
    m.resendOwnerInvite.mockResolvedValue({ ok: false, status: 404, error: "That invite isn't open any more." });
    expect(await resendOwnerInviteAction(ORG)).toEqual({ error: "That invite isn't open any more." });
    expect(m.logImpersonationEvent).not.toHaveBeenCalled();
  });
});

describe("inviteOwnerAction (spec §6.6)", () => {
  it("creates the owner invite, audits with the agency and the email, and refreshes the list", async () => {
    m.inviteOwner.mockResolvedValue({ ok: true, value: { invite: ownerInvite, link: ownerInvite.link, emailed: false } });
    expect(await inviteOwnerAction(ORG, " O@X.com ")).toEqual({ email: "o@x.com", link: ownerInvite.link, emailed: false });
    expect(m.inviteOwner).toHaveBeenCalledWith({ orgId: ORG, orgName: "Acme" }, " O@X.com ", { userId: "admin-1", name: "Yuva" });
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "invite_owner", email: "o@x.com" } });
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("brings the other-agency refusal to the dialog", async () => {
    m.inviteOwner.mockResolvedValue({ ok: false, status: 409, error: "This email already belongs to another agency." });
    expect(await inviteOwnerAction(ORG, "o@x.com")).toEqual({ error: "This email already belongs to another agency." });
    expect(m.logImpersonationEvent).not.toHaveBeenCalled();
  });

  it("refuses an id that isn't an agency id, and an unknown agency", async () => {
    expect(await inviteOwnerAction("nope", "o@x.com")).toEqual({ error: "Agency not found." });
    m.getOrgById.mockResolvedValue(null);
    expect(await inviteOwnerAction(ORG, "o@x.com")).toEqual({ error: "Agency not found." });
    expect(m.inviteOwner).not.toHaveBeenCalled();
  });

  it("answers plainly when the database fails", async () => {
    m.getOrgById.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await inviteOwnerAction(ORG, "o@x.com")).toEqual({ error: "Could not send the invite." });
  });
});

describe("createAgencyAction", () => {
  it("brings the other-agency refusal to the dialog", async () => {
    m.createAgency.mockResolvedValue({ ok: false, status: 409, error: "This email already belongs to another agency." });
    expect(await createAgencyAction(undefined, form("Acme", "o@x.com"))).toEqual({ error: "This email already belongs to another agency." });
    expect(m.logImpersonationEvent).not.toHaveBeenCalled();
  });

  it("answers plainly when reading the admin's name fails", async () => {
    m.getDisplayName.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await createAgencyAction(undefined, form("Acme", "o@x.com"))).toEqual({ error: "Could not create the agency." });
  });

  const created = { ok: true, value: { orgId: ORG, link: "https://app.example/invite/tok", emailed: true } };
  const withLimit = (limit: string) => { const f = form("Acme", "o@x.com"); f.set("creditLimit", limit); return f; };

  it("leaves a new agency unlimited by default, and logs that with the create", async () => {
    m.createAgency.mockResolvedValue(created);
    expect(await createAgencyAction(undefined, form("Acme", "o@x.com"))).toEqual({ result: { ...created.value, email: "o@x.com" } });
    expect(m.updateOrgCreditLimit).not.toHaveBeenCalled();
    expect(m.logImpersonationEvent).toHaveBeenCalledTimes(1);
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "create_agency", email: "o@x.com", limit: null } });
  });

  it("saves the chosen limit right after the agency is created, in one audit entry", async () => {
    m.createAgency.mockResolvedValue(created);
    m.updateOrgCreditLimit.mockResolvedValue(undefined);
    expect(await createAgencyAction(undefined, withLimit(" 500 "))).toEqual({ result: { ...created.value, email: "o@x.com" } });
    expect(m.updateOrgCreditLimit).toHaveBeenCalledWith(ORG, 500);
    expect(m.updateOrgCreditLimit.mock.invocationCallOrder[0]).toBeGreaterThan(m.createAgency.mock.invocationCallOrder[0]);
    expect(m.logImpersonationEvent).toHaveBeenCalledTimes(1);
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "create_agency", email: "o@x.com", limit: 500 } });
  });

  it("refuses a limit that isn't a number before creating anything", async () => {
    for (const bad of ["-5", "abc"]) {
      expect(await createAgencyAction(undefined, withLimit(bad))).toEqual({ error: "Credit limit must be a non-negative number, or blank for unlimited." });
    }
    expect(m.createAgency).not.toHaveBeenCalled();
  });

  it("still shows the owner's link when the limit couldn't be saved, and says so", async () => {
    m.createAgency.mockResolvedValue(created);
    m.updateOrgCreditLimit.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await createAgencyAction(undefined, withLimit("500"))).toEqual({ result: { ...created.value, email: "o@x.com", limitNotSaved: true } });
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "create_agency", email: "o@x.com", limit: null } });
  });
});

describe("the other admin writes are audit-logged", () => {
  it("logs a password reset with the person affected", async () => {
    m.resetMemberPassword.mockResolvedValue(undefined);
    expect(await resetMemberPasswordAction(ORG, "u7", "")).toEqual({ result: { tempPassword: "generated-pw" } });
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "reset_password", userId: "u7" } });
  });

  it("logs nothing when the reset fails", async () => {
    m.resetMemberPassword.mockRejectedValue(new Error("x"));
    expect(await resetMemberPasswordAction(ORG, "u7", "")).toEqual({ error: "Failed to reset password." });
    expect(m.logImpersonationEvent).not.toHaveBeenCalled();
  });

  it("logs a credit limit change with the new limit", async () => {
    m.updateOrgCreditLimit.mockResolvedValue(undefined);
    expect(await updateOrgCreditLimitAction(ORG, " 500 ")).toEqual({});
    expect(m.logImpersonationEvent).toHaveBeenCalledWith({ operatorId: "admin-1", targetOrgId: ORG, eventType: "admin_action", detail: { action: "credit_limit", limit: 500 } });
  });
});
