import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  getInvitationByToken: vi.fn(), createLogin: vi.fn(), deleteLogin: vi.fn(), acceptInvitation: vi.fn(),
  notifySignedUp: vi.fn(async () => undefined), signIn: vi.fn(async () => ({ error: null })),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("@/lib/db/people", () => ({ getInvitationByToken: m.getInvitationByToken, createLogin: m.createLogin, deleteLogin: m.deleteLogin, acceptInvitation: m.acceptInvitation }));
vi.mock("@/lib/people/ops", () => ({ notifySignedUp: m.notifySignedUp }));
vi.mock("@/lib/supabase/ssr-server", () => ({ createSSRServerClient: vi.fn(async () => ({ auth: { signInWithPassword: m.signIn } })) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import { acceptInviteAction } from "./invites";

const form = (name: string, password: string, email?: string) => {
  const f = new FormData();
  f.set("name", name);
  f.set("password", password);
  if (email) f.set("email", email);
  return f;
};
const invitation = { id: "i1", orgId: "org-1", orgName: "Acme", email: "p@x.com", asOwner: false, clientName: "Chupps", inviterName: "Asha", open: true };

describe("acceptInviteAction (spec §6.3)", () => {
  beforeEach(() => {
    for (const fn of Object.values(m)) if ("mockClear" in fn) fn.mockClear();
    m.getInvitationByToken.mockResolvedValue(invitation);
    m.createLogin.mockResolvedValue({ ok: true, userId: "u-new" });
    m.acceptInvitation.mockResolvedValue({ orgId: "org-1", clientId: "c1", asOwner: false, invitedBy: "owner-1" });
  });

  it("creates the account, accepts in one step, signs them in, tells the owner and inviter, and goes home", async () => {
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).rejects.toThrow("REDIRECT /");
    expect(m.createLogin).toHaveBeenCalledWith("p@x.com", "longenough");
    expect(m.getInvitationByToken).toHaveBeenCalledWith("tok");
    expect(m.acceptInvitation).toHaveBeenCalledWith("tok", "u-new", "Ravi");
    expect(m.signIn).toHaveBeenCalledWith({ email: "p@x.com", password: "longenough" });
    expect(m.notifySignedUp).toHaveBeenCalledWith({ orgId: "org-1", orgName: "Acme", userId: "u-new", name: "Ravi", invitedBy: "owner-1" });
  });

  it("uses the invitation's email, never one sent with the form", async () => {
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough", "attacker@evil.com"))).rejects.toThrow("REDIRECT /");
    expect(m.createLogin).toHaveBeenCalledWith("p@x.com", "longenough");
    expect(m.signIn).toHaveBeenCalledWith({ email: "p@x.com", password: "longenough" });
  });

  it("someone invited by an Invite holder signs up the same way and waits; the holder is the inviter told", async () => {
    // accept_invitation (plan 3) creates every member invite's membership Signed up, with a client
    // row and no permissions, whoever sent it; the owner gives access on the Team page.
    m.acceptInvitation.mockResolvedValue({ orgId: "org-1", clientId: "c1", asOwner: false, invitedBy: "holder-1" });
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).rejects.toThrow("REDIRECT /");
    expect(m.notifySignedUp).toHaveBeenCalledWith(expect.objectContaining({ invitedBy: "holder-1" }));
  });

  it("sends no signed-up notice for the owner's own invite", async () => {
    m.acceptInvitation.mockResolvedValue({ orgId: "org-1", clientId: null, asOwner: true, invitedBy: "admin-1" });
    await expect(acceptInviteAction("tok", undefined, form("Asha", "longenough"))).rejects.toThrow("REDIRECT /");
    expect(m.notifySignedUp).not.toHaveBeenCalled();
  });

  it("a failed notice never fails the sign-up", async () => {
    m.notifySignedUp.mockRejectedValueOnce(new Error("mail down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).rejects.toThrow("REDIRECT /");
    err.mockRestore();
  });

  it("refuses a short password or a missing name before anything is created", async () => {
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "short"))).toEqual({ error: "Password must be at least 8 characters." });
    expect(await acceptInviteAction("tok", undefined, form("", "longenough"))).toEqual({ error: "Enter your name." });
    expect(m.createLogin).not.toHaveBeenCalled();
  });

  it("refuses a link that is no longer valid", async () => {
    m.getInvitationByToken.mockResolvedValue({ ...invitation, open: false });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    m.getInvitationByToken.mockResolvedValue(null);
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    expect(m.createLogin).not.toHaveBeenCalled();
  });

  it("deletes the new account when accepting fails (used in the meantime), without logging the token", async () => {
    m.acceptInvitation.mockRejectedValue(new Error("This invite link is no longer valid."));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await acceptInviteAction("secret-tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    expect(m.deleteLogin).toHaveBeenCalledWith("u-new");
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret-tok");
    expect(m.signIn).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("refuses an email that already has a login", async () => {
    m.createLogin.mockResolvedValue({ ok: false });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This email already belongs to another agency." });
    expect(m.acceptInvitation).not.toHaveBeenCalled();
  });
});
