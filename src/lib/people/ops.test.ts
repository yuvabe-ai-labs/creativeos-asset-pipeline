// src/lib/people/ops.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  findLoginByEmail: vi.fn(), findOpenInviteByEmail: vi.fn(), takeInviteSend: vi.fn(), insertInvitation: vi.fn(),
  replaceInvitationToken: vi.fn(), revokeInvitation: vi.fn(), getMembership: vi.fn(), getMemberships: vi.fn(),
  setMemberPermissions: vi.fn(), deleteMembership: vi.fn(), deleteLogin: vi.fn(), addPeopleToClient: vi.fn(), removePersonFromClient: vi.fn(),
  transferOwner: vi.fn(), loginEmails: vi.fn(), ownerIds: vi.fn(), listOrgSlugs: vi.fn(),
  createAgencyWithOwnerInvite: vi.fn(), getOpenOwnerInvite: vi.fn(), insertOwnerInvitation: vi.fn(),
  hasOpenInviteElsewhere: vi.fn(), openInviteSentAt: vi.fn(),
}));
vi.mock("@/lib/db/people", () => db);
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send", () => ({ sendEmail }));

import {
  addToClient, cancelInvite, createAgency, inviteOwner, inviteToClient, makeOwner, notifySignedUp,
  removeFromClient, removePerson, resendInvite, resendOwnerInvite, updatePermissions,
} from "./ops";

const agency = { orgId: "org-1", orgName: "Acme" };
const client = { id: "c1", name: "Chupps" };
const by = { userId: "owner-1", name: "Asha" };
const invite = { id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "s", expiresAt: "e", invitedByName: null, link: "https://app.example/invite/stored" };

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset();
  sendEmail.mockReset().mockResolvedValue({ sent: true });
  process.env.APP_URL = "https://app.example";
  db.findLoginByEmail.mockResolvedValue(null);
  db.findOpenInviteByEmail.mockResolvedValue(null);
  db.takeInviteSend.mockResolvedValue(true);
  db.insertInvitation.mockResolvedValue(invite);
  db.hasOpenInviteElsewhere.mockResolvedValue(false);
  db.removePersonFromClient.mockResolvedValue(true);
  // An open invite last sent an hour ago: Resend may go ahead.
  db.openInviteSentAt.mockResolvedValue(new Date(Date.now() - 3_600_000).toISOString());
});

const LOGIN_NO_AGENCY = "This email already has a CreativeOS login. Ask Yuvabe to move it to your agency.";
const LOGIN_NO_AGENCY_ADMIN = "This email already has a CreativeOS login that isn't in any agency.";
const OTHER_AGENCY = "This email already belongs to another agency.";

describe("inviteToClient (spec §6.2)", () => {
  it("creates the invite for this client, emails the link and returns it", async () => {
    const r = await inviteToClient(agency, client, "  P@X.com ", by);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.insertInvitation).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", clientId: "c1", email: "p@x.com", invitedBy: "owner-1" }));
    expect(db.insertInvitation.mock.calls[0][0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.value.link).toBe("https://app.example/invite/stored");
    expect(sendEmail.mock.calls[0][0].text).toContain("https://app.example/invite/stored");
    expect(r.value.emailed).toBe(true);
    expect(sendEmail.mock.calls[0][0].subject).toBe("You're invited to Acme");
  });

  it("still creates the invite and returns the link when email is not set up", async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
    const r = await inviteToClient(agency, client, "p@x.com", by);
    expect(r.ok && r.value.emailed).toBe(false);
    expect(db.insertInvitation).toHaveBeenCalled();
  });

  it("records an Invite holder as the inviter, and names them in the email", async () => {
    const holder = { userId: "holder-1", name: "Meera" };
    await inviteToClient(agency, client, "p@x.com", holder);
    expect(db.insertInvitation).toHaveBeenCalledWith(expect.objectContaining({ invitedBy: "holder-1" }));
    expect(sendEmail.mock.calls[0][0].text).toContain("Meera has invited you to join Acme on CreativeOS, to work on Chupps.");
  });

  it("names the caller as the inviter on the invite it returns", async () => {
    const r = await inviteToClient(agency, client, "p@x.com", by);
    expect(r.ok && r.value.invite.invitedByName).toBe("Asha");
  });

  it("answers a lost race for the same email (the one-open-invite index) as already invited", async () => {
    db.insertInvitation.mockRejectedValue({ code: "23505", message: "duplicate key value violates unique constraint" });
    db.findOpenInviteByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "i0", clientName: "Bata" });
    expect(await inviteToClient(agency, client, "p@x.com", by)).toEqual({
      ok: false, status: 409, error: "Already invited to Bata. Once they've signed up, add them from the list.",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still throws any other database fault on insert", async () => {
    db.insertInvitation.mockRejectedValue({ code: "XX000", message: "boom" });
    await expect(inviteToClient(agency, client, "p@x.com", by)).rejects.toMatchObject({ code: "XX000" });
  });

  it("does not email a path-only link (APP_URL not set): it returns it to copy", async () => {
    db.insertInvitation.mockResolvedValue({ ...invite, link: "/invite/stored" });
    const r = await inviteToClient(agency, client, "p@x.com", by);
    expect(r).toMatchObject({ ok: true, value: { link: "/invite/stored", emailed: false } });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("looks for an open invite to the email in other agencies only", async () => {
    await inviteToClient(agency, client, "P@x.com", by);
    expect(db.hasOpenInviteElsewhere).toHaveBeenCalledWith("p@x.com", "org-1");
  });

  it("takes a send from the agency's daily limit, whoever sent it, before the invite is made", async () => {
    await inviteToClient(agency, client, "p@x.com", { userId: "holder-1", name: "Meera" });
    expect(db.takeInviteSend).toHaveBeenCalledWith("org-1", 50);
    expect(db.takeInviteSend.mock.invocationCallOrder[0]).toBeLessThan(db.insertInvitation.mock.invocationCallOrder[0]);
  });

  it("takes no send for an invite it refuses", async () => {
    db.findOpenInviteByEmail.mockResolvedValue({ id: "i0", clientName: "Bata" });
    await inviteToClient(agency, client, "p@x.com", by);
    expect(db.takeInviteSend).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid email", () => {}, "nope", 400, "Enter a valid email."],
    ["someone already in the agency", () => db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-1" }), "p@x.com", 409, "Already in Acme. Add them from the list."],
    ["an email with an open invite", () => db.findOpenInviteByEmail.mockResolvedValue({ id: "i0", clientName: "Bata" }), "p@x.com", 409, "Already invited to Bata. Once they've signed up, add them from the list."],
    ["an email with a login in another agency", () => db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-2" }), "p@x.com", 409, "This email already belongs to another agency."],
    ["the 51st invite today", () => db.takeInviteSend.mockResolvedValue(false), "p@x.com", 429, "You've sent 50 invites today. Try again tomorrow."],
    ["an email with an open invite in another agency", () => db.hasOpenInviteElsewhere.mockResolvedValue(true), "p@x.com", 409, OTHER_AGENCY],
    ["an email with a login in no agency", () => db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: null }), "p@x.com", 409, LOGIN_NO_AGENCY],
  ])("refuses %s", async (_what, arrange, email, status, error) => {
    arrange();
    expect(await inviteToClient(agency, client, email, by)).toEqual({ ok: false, status, error });
    expect(db.insertInvitation).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // An Invite holder (no manage_team) passes the clients they are on. The open invite's
  // client is named only when it is one of them; otherwise the refusal names no client.
  const NEUTRAL = "Already invited. Once they've signed up, add them from the list.";
  it("names no client to an Invite holder who isn't on the open invite's client", async () => {
    db.findOpenInviteByEmail.mockResolvedValue({ id: "i0", clientId: "cB", clientName: "Bata" });
    expect(await inviteToClient(agency, client, "p@x.com", by, ["c1"])).toEqual({ ok: false, status: 409, error: NEUTRAL });
  });

  it("names the client to an Invite holder who is on it", async () => {
    db.findOpenInviteByEmail.mockResolvedValue({ id: "i0", clientId: "c1", clientName: "Chupps" });
    expect(await inviteToClient(agency, client, "p@x.com", by, ["c1"])).toMatchObject({
      error: "Already invited to Chupps. Once they've signed up, add them from the list.",
    });
  });

  it("names no client on a lost race either", async () => {
    db.insertInvitation.mockRejectedValue({ code: "23505" });
    db.findOpenInviteByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "i0", clientId: "cB", clientName: "Bata" });
    expect(await inviteToClient(agency, client, "p@x.com", by, ["c1"])).toEqual({ ok: false, status: 409, error: NEUTRAL });
  });
});

describe("resendInvite and cancelInvite", () => {
  it("Resend replaces the token (the old link stops working) and emails the new link", async () => {
    const replaced = { ...invite, link: "https://app.example/invite/new" };
    db.replaceInvitationToken.mockResolvedValue(replaced);
    const r = await resendInvite(agency, "i1", by);
    expect(r).toEqual({ ok: true, value: { invite: replaced, link: "https://app.example/invite/new", emailed: true } });
    expect(db.replaceInvitationToken).toHaveBeenCalledWith("org-1", "i1", expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expect.any(String));
    expect(sendEmail.mock.calls[0][0].text).toContain("https://app.example/invite/new");
  });

  it("Resend replaces only an invite sent more than a minute ago", async () => {
    db.replaceInvitationToken.mockResolvedValue(invite);
    const before = Date.now();
    await resendInvite(agency, "i1", by);
    const sentBefore = Date.parse(db.replaceInvitationToken.mock.calls[0][3]);
    expect(sentBefore).toBeGreaterThanOrEqual(before - 60_000 - 5);
    expect(sentBefore).toBeLessThanOrEqual(Date.now() - 60_000);
  });

  it("refuses a Resend within a minute of the last send, sends nothing and takes no send", async () => {
    db.openInviteSentAt.mockResolvedValue(new Date(Date.now() - 10_000).toISOString());
    expect(await resendInvite(agency, "i1", by)).toEqual({ ok: false, status: 429, error: "That invite was just sent. Try again in a minute." });
    expect(db.openInviteSentAt).toHaveBeenCalledWith("org-1", "i1");
    expect(db.takeInviteSend).not.toHaveBeenCalled();
    expect(db.replaceInvitationToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a Resend that loses a race with another one is refused as just sent", async () => {
    db.replaceInvitationToken.mockResolvedValue(null);
    expect(await resendInvite(agency, "i1", by)).toEqual({ ok: false, status: 429, error: "That invite was just sent. Try again in a minute." });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("Resend on an owner invite sends the Set up email, not the member invite", async () => {
    db.replaceInvitationToken.mockResolvedValue({ ...invite, email: "o@x.com", clientId: null, clientName: null, asOwner: true, link: "https://app.example/invite/new" });
    const r = await resendInvite(agency, "oi1", by);
    expect(r).toMatchObject({ ok: true, value: { emailed: true } });
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: ["o@x.com"], subject: "Set up Acme on CreativeOS" });
    expect(sendEmail.mock.calls[0][0].text).toContain("https://app.example/invite/new");
  });

  it("every Resend takes a send from the daily limit, before the new link is issued (I4)", async () => {
    db.replaceInvitationToken.mockResolvedValue(invite);
    await resendInvite(agency, "i1", by);
    await resendInvite(agency, "i1", by);
    expect(db.takeInviteSend).toHaveBeenCalledTimes(2);
    expect(db.takeInviteSend).toHaveBeenCalledWith("org-1", 50);
    expect(db.takeInviteSend.mock.invocationCallOrder[0]).toBeLessThan(db.replaceInvitationToken.mock.invocationCallOrder[0]);
  });

  it("Resend counts towards the daily limit", async () => {
    db.takeInviteSend.mockResolvedValue(false);
    expect(await resendInvite(agency, "i1", by)).toEqual({ ok: false, status: 429, error: "You've sent 50 invites today. Try again tomorrow." });
    expect(db.replaceInvitationToken).not.toHaveBeenCalled();
  });

  it("refuses an invite that is no longer open, taking no send", async () => {
    db.openInviteSentAt.mockResolvedValue(null);
    expect(await resendInvite(agency, "i1", by)).toEqual({ ok: false, status: 404, error: "That invite isn't open any more." });
    expect(db.takeInviteSend).not.toHaveBeenCalled();
    db.revokeInvitation.mockResolvedValue(null);
    expect(await cancelInvite(agency, "i1")).toEqual({ ok: false, status: 404, error: "That invite isn't open any more." });
  });

  it("Cancel answers who the invite was for, for the audit log", async () => {
    db.revokeInvitation.mockResolvedValue("p@x.com");
    expect(await cancelInvite(agency, "i1")).toEqual({ ok: true, value: { email: "p@x.com" } });
    expect(db.revokeInvitation).toHaveBeenCalledWith("org-1", "i1");
  });
});

describe("updatePermissions (spec §6.1)", () => {
  it("gives access: saves the set, sets access given and emails the person", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: false });
    db.loginEmails.mockResolvedValue(["p@x.com"]);
    const r = await updatePermissions(agency, "u1", ["share", "generate"], true);
    expect(r).toEqual({ ok: true, value: { emailed: true } });
    expect(db.setMemberPermissions).toHaveBeenCalledWith("org-1", "u1", ["generate", "share"], true);
    expect(sendEmail.mock.calls[0][0].subject).toBe("Your access to Acme is ready");
  });

  it("gives access with no permissions: a member who can look", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: false });
    db.loginEmails.mockResolvedValue(["p@x.com"]);
    expect(await updatePermissions(agency, "u1", [], true)).toEqual({ ok: true, value: { emailed: true } });
    expect(db.setMemberPermissions).toHaveBeenCalledWith("org-1", "u1", [], true);
    expect(sendEmail.mock.calls[0][0].subject).toBe("Your access to Acme is ready");
  });

  it("edits a member's set without a second ready email", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: true });
    await updatePermissions(agency, "u1", ["invite"], true);
    expect(db.setMemberPermissions).toHaveBeenCalledWith("org-1", "u1", ["invite"], false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses the owner and someone not in the agency", async () => {
    db.getMembership.mockResolvedValue({ isOwner: true, accessGiven: true });
    expect(await updatePermissions(agency, "o1", ["generate"], false)).toEqual({ ok: false, status: 409, error: "The agency owner has every permission already." });
    db.getMembership.mockResolvedValue(null);
    expect(await updatePermissions(agency, "x", ["generate"], false)).toEqual({ ok: false, status: 404, error: "That person isn't in this agency." });
  });

  it("still gives access when the app address is not set, reporting the email as not sent", async () => {
    delete process.env.APP_URL;
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: false });
    db.loginEmails.mockResolvedValue(["p@x.com"]);
    expect(await updatePermissions(agency, "u1", ["generate"], true)).toEqual({ ok: true, value: { emailed: false } });
    expect(db.setMemberPermissions).toHaveBeenCalledWith("org-1", "u1", ["generate"], true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("removePerson", () => {
  it("deletes the login of someone waiting or a member", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: false });
    expect(await removePerson(agency, "u1")).toEqual({ ok: true, value: null });
    // Membership first: deleting the login alone fails, because the membership triggers then run
    // as the Auth service role, which cannot read org_memberships.
    expect(db.deleteMembership).toHaveBeenCalledWith("org-1", "u1");
    expect(db.deleteLogin).toHaveBeenCalledWith("u1");
    expect(db.deleteMembership.mock.invocationCallOrder[0]).toBeLessThan(db.deleteLogin.mock.invocationCallOrder[0]);
  });

  it("refuses the owner", async () => {
    db.getMembership.mockResolvedValue({ isOwner: true, accessGiven: true });
    expect(await removePerson(agency, "o1")).toEqual({ ok: false, status: 409, error: "The agency owner can't be removed." });
    expect(db.deleteMembership).not.toHaveBeenCalled();
    expect(db.deleteLogin).not.toHaveBeenCalled();
  });
});

describe("addToClient", () => {
  it("adds the agency's people in one insert, skipping the owner", async () => {
    db.getMemberships.mockResolvedValue([{ userId: "u1", isOwner: false }, { userId: "o1", isOwner: true }, { userId: "u2", isOwner: false }]);
    expect(await addToClient(agency, "c1", ["u1", "o1", "u2"], by)).toEqual({ ok: true, value: { added: 2 } });
    expect(db.addPeopleToClient).toHaveBeenCalledWith("org-1", "c1", ["u1", "u2"], "owner-1");
  });

  it("refuses an id from outside the agency, and writes nothing", async () => {
    db.getMemberships.mockResolvedValue([{ userId: "u1", isOwner: false }]);
    expect(await addToClient(agency, "c1", ["u1", "stranger"], by)).toEqual({ ok: false, status: 404, error: "That person isn't in this agency." });
    expect(db.addPeopleToClient).not.toHaveBeenCalled();
  });
});

describe("makeOwner", () => {
  it("transfers ownership", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: true });
    expect(await makeOwner(agency, "u1")).toEqual({ ok: true, value: null });
    expect(db.transferOwner).toHaveBeenCalledWith("org-1", "u1");
  });

  it("refuses someone outside the agency, and transfers nothing", async () => {
    db.getMembership.mockResolvedValue(null);
    expect(await makeOwner(agency, "stranger")).toEqual({ ok: false, status: 404, error: "That person isn't in this agency." });
    expect(db.transferOwner).not.toHaveBeenCalled();
  });
});

describe("removeFromClient", () => {
  it("takes the person off this client only", async () => {
    expect(await removeFromClient(agency, "c1", "u1")).toEqual({ ok: true, value: null });
    expect(db.removePersonFromClient).toHaveBeenCalledWith("org-1", "c1", "u1");
    expect(db.deleteLogin).not.toHaveBeenCalled();
  });

  it("answers not found when nothing was removed (unknown person, the owner, not on the client)", async () => {
    db.removePersonFromClient.mockResolvedValue(false);
    expect(await removeFromClient(agency, "c1", "u1")).toEqual({ ok: false, status: 404, error: "That person isn't on this client." });
  });
});

describe("resendOwnerInvite", () => {
  const ownerInvite = { ...invite, id: "oi1", email: "o@x.com", clientId: null, clientName: null, asOwner: true };

  it("resends the agency's open owner invite with a new token and the Set up email", async () => {
    db.getOpenOwnerInvite.mockResolvedValue(ownerInvite);
    db.replaceInvitationToken.mockResolvedValue({ ...ownerInvite, link: "https://app.example/invite/new" });
    const r = await resendOwnerInvite(agency, by);
    expect(r).toMatchObject({ ok: true, value: { link: "https://app.example/invite/new", emailed: true } });
    expect(db.replaceInvitationToken).toHaveBeenCalledWith("org-1", "oi1", expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expect.any(String));
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: ["o@x.com"], subject: "Set up Acme on CreativeOS" });
  });

  it("refuses when there is no open owner invite", async () => {
    db.getOpenOwnerInvite.mockResolvedValue(null);
    expect(await resendOwnerInvite(agency, by)).toEqual({ ok: false, status: 404, error: "That invite isn't open any more." });
    expect(db.replaceInvitationToken).not.toHaveBeenCalled();
  });
});

describe("createAgency (spec §6.6)", () => {
  it("creates the agency with its owner invite and emails the owner", async () => {
    db.listOrgSlugs.mockResolvedValue(["acme"]);
    db.createAgencyWithOwnerInvite.mockResolvedValue("org-9");
    const r = await createAgency("Acme", "O@X.com", by);
    expect(r).toMatchObject({ ok: true, value: { orgId: "org-9", emailed: true } });
    expect(db.createAgencyWithOwnerInvite).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme", slug: "acme-2", ownerEmail: "o@x.com", by: "owner-1" }));
    expect(sendEmail.mock.calls[0][0].subject).toBe("Set up Acme on CreativeOS");
    // A brand new agency's first send: nothing to limit yet.
    expect(db.takeInviteSend).not.toHaveBeenCalled();
  });

  it("refuses an owner email that already has a login", async () => {
    db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-2" });
    expect(await createAgency("Acme", "o@x.com", by)).toEqual({ ok: false, status: 409, error: "This email already belongs to another agency." });
  });

  it("refuses an owner email with a login in no agency, in words for the admin", async () => {
    db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: null });
    expect(await createAgency("Acme", "o@x.com", by)).toEqual({ ok: false, status: 409, error: LOGIN_NO_AGENCY_ADMIN });
  });

  it("refuses an owner email with an open invite in any agency, without creating the agency", async () => {
    db.hasOpenInviteElsewhere.mockResolvedValue(true);
    db.listOrgSlugs.mockResolvedValue([]);
    expect(await createAgency("Acme", "O@x.com", by)).toEqual({ ok: false, status: 409, error: OTHER_AGENCY });
    expect(db.hasOpenInviteElsewhere).toHaveBeenCalledWith("o@x.com", null);
    expect(db.createAgencyWithOwnerInvite).not.toHaveBeenCalled();
  });

  it("still creates the agency when the app address is not set, with the link as a path and no email", async () => {
    delete process.env.APP_URL;
    db.listOrgSlugs.mockResolvedValue([]);
    db.createAgencyWithOwnerInvite.mockResolvedValue("org-9");
    const r = await createAgency("Acme", "o@x.com", by);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ orgId: "org-9", emailed: false });
    expect(r.value.link).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("inviteOwner (spec §6.6, D505: only while the agency has no owner and no open owner invite)", () => {
  const ownerInvite = { ...invite, id: "oi2", email: "o@x.com", clientId: null, clientName: null, asOwner: true, link: "https://app.example/invite/own" };
  beforeEach(() => {
    db.ownerIds.mockResolvedValue([]);
    db.getOpenOwnerInvite.mockResolvedValue(null);
    db.insertOwnerInvitation.mockResolvedValue(ownerInvite);
  });

  it("creates the owner invite for the existing agency and emails the Set up link", async () => {
    const r = await inviteOwner(agency, "  O@X.com ", by);
    expect(r).toMatchObject({ ok: true, value: { link: "https://app.example/invite/own", emailed: true } });
    expect(db.insertOwnerInvitation).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", email: "o@x.com", invitedBy: "owner-1" }));
    expect(db.insertOwnerInvitation.mock.calls[0][0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: ["o@x.com"], subject: "Set up Acme on CreativeOS" });
    expect(db.takeInviteSend).toHaveBeenCalledWith("org-1", 50);
    expect(db.takeInviteSend.mock.invocationCallOrder[0]).toBeLessThan(db.insertOwnerInvitation.mock.invocationCallOrder[0]);
  });

  it("refuses an email with a login in another agency", async () => {
    db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-2" });
    expect(await inviteOwner(agency, "o@x.com", by)).toEqual({ ok: false, status: 409, error: "This email already belongs to another agency." });
    expect(db.insertOwnerInvitation).not.toHaveBeenCalled();
  });

  it("refuses an email with a login in no agency, in words for the admin", async () => {
    db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: null });
    expect(await inviteOwner(agency, "o@x.com", by)).toEqual({ ok: false, status: 409, error: LOGIN_NO_AGENCY_ADMIN });
  });

  it("refuses an email with an open invite in another agency", async () => {
    db.hasOpenInviteElsewhere.mockResolvedValue(true);
    expect(await inviteOwner(agency, "O@x.com", by)).toEqual({ ok: false, status: 409, error: OTHER_AGENCY });
    expect(db.hasOpenInviteElsewhere).toHaveBeenCalledWith("o@x.com", "org-1");
    expect(db.insertOwnerInvitation).not.toHaveBeenCalled();
  });

  it("refuses someone already in this agency, who is made owner from the agency's page instead", async () => {
    db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-1" });
    expect(await inviteOwner(agency, "o@x.com", by)).toEqual({ ok: false, status: 409, error: "Already in Acme. Make them owner from the agency's People tab." });
  });

  it("refuses when the agency has an owner or an open owner invite", async () => {
    db.ownerIds.mockResolvedValue(["o1"]);
    expect(await inviteOwner(agency, "o@x.com", by)).toEqual({ ok: false, status: 409, error: "This agency already has an owner or an open owner invite." });
    db.ownerIds.mockResolvedValue([]);
    db.getOpenOwnerInvite.mockResolvedValue(ownerInvite);
    expect(await inviteOwner(agency, "o@x.com", by)).toEqual({ ok: false, status: 409, error: "This agency already has an owner or an open owner invite." });
    expect(db.insertOwnerInvitation).not.toHaveBeenCalled();
  });

  it("refuses an email already invited in this agency", async () => {
    db.findOpenInviteByEmail.mockResolvedValue({ id: "i1", clientName: "Chupps" });
    expect(await inviteOwner(agency, "o@x.com", by)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Already invited to Chupps") });
  });

  it("keeps to the daily limit", async () => {
    db.takeInviteSend.mockResolvedValue(false);
    expect(await inviteOwner(agency, "o@x.com", by)).toMatchObject({ ok: false, status: 429 });
  });

  it("turns a concurrent owner invite (unique violation) into the refusal", async () => {
    db.insertOwnerInvitation.mockRejectedValue({ code: "23505" });
    expect(await inviteOwner(agency, "o@x.com", by)).toEqual({ ok: false, status: 409, error: "This agency already has an owner or an open owner invite." });
  });

  it("refuses an invalid email", async () => {
    expect(await inviteOwner(agency, "nope", by)).toMatchObject({ ok: false, status: 400 });
  });

  it("shows the link and sends nothing when the app address is not set", async () => {
    delete process.env.APP_URL;
    db.insertOwnerInvitation.mockResolvedValue({ ...ownerInvite, link: "/invite/own" });
    expect(await inviteOwner(agency, "o@x.com", by)).toMatchObject({ ok: true, value: { link: "/invite/own", emailed: false } });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("notifySignedUp (spec §6.3, §6.7)", () => {
  it("emails the owner with the Team page line, and the inviter without it", async () => {
    db.ownerIds.mockResolvedValue(["o1"]);
    db.loginEmails.mockImplementation(async (ids: string[]) => (ids[0] === "o1" ? ["o@x.com"] : ["i@x.com"]));
    await notifySignedUp({ orgId: "org-1", orgName: "Acme", userId: "u1", name: "Ravi", invitedBy: "holder-1" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const toOwner = sendEmail.mock.calls.find((c) => c[0].to[0] === "o@x.com")![0];
    const toInviter = sendEmail.mock.calls.find((c) => c[0].to[0] === "i@x.com")![0];
    expect(toOwner).toMatchObject({ subject: "Ravi signed up to Acme" });
    expect(toOwner.text).toContain("Give them permissions on the Team page.");
    expect(toInviter.text).toContain("Ravi signed up to Acme.");
    expect(toInviter.text).not.toContain("Team page");
  });

  it("sends one email when the owner sent the invite", async () => {
    db.ownerIds.mockResolvedValue(["o1"]);
    db.loginEmails.mockResolvedValue(["o@x.com"]);
    await notifySignedUp({ orgId: "org-1", orgName: "Acme", userId: "u1", name: "Ravi", invitedBy: "o1" });
    expect(db.loginEmails).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].text).toContain("Give them permissions on the Team page.");
  });

  it("never throws when the app address is not set", async () => {
    delete process.env.APP_URL;
    db.ownerIds.mockResolvedValue(["o1"]);
    db.loginEmails.mockResolvedValue(["o@x.com"]);
    await expect(notifySignedUp({ orgId: "org-1", orgName: "Acme", userId: "u1", name: "Ravi", invitedBy: null })).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
