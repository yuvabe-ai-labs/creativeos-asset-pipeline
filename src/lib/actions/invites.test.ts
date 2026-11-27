import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  getInvitationByToken: vi.fn(), createLogin: vi.fn(), deleteLogin: vi.fn(), acceptInvitation: vi.fn(),
  notifySignedUp: vi.fn(async () => undefined), signIn: vi.fn(async () => ({ error: null })),
  getUser: vi.fn(async () => ({ data: { user: null as { email: string } | null }, error: null })),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("@/lib/db/people", () => ({ getInvitationByToken: m.getInvitationByToken, createLogin: m.createLogin, deleteLogin: m.deleteLogin, acceptInvitation: m.acceptInvitation }));
vi.mock("@/lib/people/ops", () => ({ notifySignedUp: m.notifySignedUp }));
vi.mock("@/lib/supabase/ssr-server", () => ({ createSSRServerClient: vi.fn(async () => ({ auth: { signInWithPassword: m.signIn, getUser: m.getUser } })) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import { acceptInviteAction } from "./invites";

const form = (name: string, password: string, email?: string, confirmPassword = password) => {
  const f = new FormData();
  f.set("name", name);
  f.set("password", password);
  f.set("confirmPassword", confirmPassword);
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

  // A new member is always waiting (accept_invitation gives no access), so they go straight to
  // onboarding rather than through home's own redirect.
  it("sends a new member straight to onboarding and the owner home", async () => {
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).rejects.toThrow();
    expect(m.redirect).toHaveBeenLastCalledWith("/onboarding");
    m.acceptInvitation.mockResolvedValue({ orgId: "org-1", clientId: null, asOwner: true, invitedBy: "admin-1" });
    await expect(acceptInviteAction("tok", undefined, form("Asha", "longenough"))).rejects.toThrow();
    expect(m.redirect).toHaveBeenLastCalledWith("/");
  });

  it("goes to sign-in when signing in after the sign-up fails", async () => {
    m.signIn.mockResolvedValueOnce({ error: { message: "down" } } as never);
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).rejects.toThrow();
    expect(m.redirect).toHaveBeenLastCalledWith("/login");
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

  it("refuses a confirmation that doesn't match, before anything is created (D598)", async () => {
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough", undefined, "longenougH"))).toEqual({ error: "Passwords don't match." });
    const missing = form("Ravi", "longenough");
    missing.delete("confirmPassword");
    expect(await acceptInviteAction("tok", undefined, missing)).toEqual({ error: "Passwords don't match." });
    expect(m.createLogin).not.toHaveBeenCalled();
    expect(m.getInvitationByToken).not.toHaveBeenCalled();
  });

  it("refuses a link that is no longer valid", async () => {
    m.getInvitationByToken.mockResolvedValue({ ...invitation, open: false });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    m.getInvitationByToken.mockResolvedValue(null);
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    expect(m.createLogin).not.toHaveBeenCalled();
  });

  it("deletes the new account when the link was used in the meantime", async () => {
    m.acceptInvitation.mockResolvedValue(null);
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    expect(m.deleteLogin).toHaveBeenCalledWith("u-new");
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it("a passing failure while accepting asks them to try again, deletes the new account, and never logs the token", async () => {
    m.acceptInvitation.mockRejectedValue(new Error("connection failure"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await acceptInviteAction("secret-tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "Something went wrong. Try again." });
    expect(m.deleteLogin).toHaveBeenCalledWith("u-new");
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret-tok");
    expect(m.signIn).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("refuses an email that already has a login", async () => {
    m.createLogin.mockResolvedValue({ ok: false, reason: "email_exists" });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This email already belongs to another agency." });
    expect(m.acceptInvitation).not.toHaveBeenCalled();
  });

  it("any other failure creating the login asks them to try again, in plain words", async () => {
    m.createLogin.mockResolvedValue({ ok: false, reason: "failed" });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "Something went wrong. Try again." });
    expect(m.acceptInvitation).not.toHaveBeenCalled();
  });

  it("a failed invitation read asks them to try again rather than showing the error page", async () => {
    m.getInvitationByToken.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "Something went wrong. Try again." });
    expect(m.createLogin).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("refuses someone signed in as another email, without touching their session", async () => {
    m.getUser.mockResolvedValueOnce({ data: { user: { email: "other@x.com" } }, error: null });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({
      error: "This invite is for p@x.com. Sign out, then create your account with that email.",
    });
    expect(m.createLogin).not.toHaveBeenCalled();
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it("refuses a password longer than 72 characters", async () => {
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "a".repeat(73)))).toEqual({ error: "Password must be 72 characters or fewer." });
    expect(m.createLogin).not.toHaveBeenCalled();
  });
});
