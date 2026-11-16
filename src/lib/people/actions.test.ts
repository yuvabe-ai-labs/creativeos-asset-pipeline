import { describe, it, expect } from "vitest";
import { inviteActions, personActions } from "./actions";
import type { AgencyPerson, OpenInvite } from "./types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "t",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const owner = person({ status: "owner" });
const member = person({ status: "member" });
const waiting = person({ status: "signed_up" });
const invite: OpenInvite = {
  id: "i", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "t", expiresAt: "t",
  invitedByName: null, link: "https://app.example/invite/tok",
};

const teamOwner = { place: "team", canManage: true, canMakeOwner: false } as const;
const admin = { place: "team", canManage: true, canMakeOwner: true } as const;
const clientOwner = { place: "client", canManage: true, canMakeOwner: false } as const;
const holder = { place: "client", canManage: false, canMakeOwner: false } as const;

describe("personActions on the Team page", () => {
  it("gives the owner row no actions of the team's own", () => {
    expect(personActions(owner, teamOwner)).toEqual({ primary: null, menu: [] });
    expect(personActions(owner, admin)).toEqual({ primary: null, menu: [] });
  });

  it("shows Set permissions on someone waiting, with Remove from agency in the menu", () => {
    expect(personActions(waiting, teamOwner)).toEqual({ primary: "set_permissions", menu: ["remove_from_agency"] });
  });

  it("puts a member's actions in the menu, Make owner only for Admin", () => {
    expect(personActions(member, teamOwner)).toEqual({ primary: null, menu: ["edit_permissions", "remove_from_agency"] });
    expect(personActions(member, admin)).toEqual({ primary: null, menu: ["edit_permissions", "make_owner", "remove_from_agency"] });
  });
});

describe("personActions on a client's Members list", () => {
  it("gives the owner Set permissions on someone waiting and Remove from client", () => {
    expect(personActions(waiting, clientOwner)).toEqual({ primary: "set_permissions", menu: ["remove_from_client"] });
    expect(personActions(member, clientOwner)).toEqual({ primary: null, menu: ["edit_permissions", "remove_from_client"] });
    expect(personActions(owner, clientOwner)).toEqual({ primary: null, menu: [] });
  });

  it("gives an Invite holder nothing they can't use", () => {
    for (const p of [owner, member, waiting]) expect(personActions(p, holder)).toEqual({ primary: null, menu: [] });
  });
});

describe("inviteActions", () => {
  it("gives the owner Copy link (when there is a link), Resend and Cancel", () => {
    expect(inviteActions(invite, { canManage: true, linkShown: false })).toEqual(["copy_link", "resend", "cancel"]);
    expect(inviteActions(invite, { canManage: true, linkShown: true })).toEqual(["resend", "cancel"]);
    expect(inviteActions({ ...invite, link: null }, { canManage: true, linkShown: false })).toEqual(["resend", "cancel"]);
  });

  it("gives an Invite holder none", () => {
    expect(inviteActions({ ...invite, link: null }, { canManage: false, linkShown: false })).toEqual([]);
  });
});
