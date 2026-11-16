import type { AgencyPerson, OpenInvite } from "./types";

/** What a person row can offer. At most one shows as a button (`primary`); the rest sit in the
 *  row's ⋯ menu. Admin's own extras (reset password) are added by the screen that has them. */
export type PersonActionId =
  | "set_permissions"
  | "edit_permissions"
  | "make_owner"
  | "remove_from_client"
  | "remove_from_agency";

export type InviteActionId = "copy_link" | "resend" | "cancel";

export type PersonViewer = {
  /** The Team page (or Admin's People tab), or a client's Members list. */
  place: "team" | "client";
  /** manage_team: the owner or Admin. False for an Invite holder. */
  canManage: boolean;
  /** Admin only. */
  canMakeOwner: boolean;
};

/** Spec §6.1/§6.2. The owner row has no team actions; an Invite holder gets none at all. */
export function personActions(
  person: AgencyPerson,
  viewer: PersonViewer,
): { primary: PersonActionId | null; menu: PersonActionId[] } {
  if (!viewer.canManage || person.status === "owner") return { primary: null, menu: [] };
  const remove: PersonActionId = viewer.place === "team" ? "remove_from_agency" : "remove_from_client";
  if (person.status === "signed_up") return { primary: "set_permissions", menu: [remove] };
  const menu: PersonActionId[] = ["edit_permissions"];
  if (viewer.place === "team" && viewer.canMakeOwner) menu.push("make_owner");
  menu.push(remove);
  return { primary: null, menu };
}

/** An open invite's menu: the owner's only (an Invite holder's read has no link). Copy link is
 *  left out once the link is on screen to copy by hand, so it is offered once. */
export function inviteActions(invite: OpenInvite, { canManage, linkShown }: { canManage: boolean; linkShown: boolean }): InviteActionId[] {
  if (!canManage) return [];
  return [...(invite.link && !linkShown ? (["copy_link"] as const) : []), "resend", "cancel"];
}
