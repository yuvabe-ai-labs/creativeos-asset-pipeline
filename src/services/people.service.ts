import type { Permission } from "@/lib/permissions/model";
import type { AgencyPeople, InviteResult } from "@/lib/people/types";
import { readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };
const base = (orgId: string) => `/api/orgs/${orgId}`;

class PeopleService {
  async list(orgId: string): Promise<AgencyPeople> {
    return readJson<AgencyPeople>(await fetch(`${base(orgId)}/people`), "Could not load the team.");
  }

  async updatePermissions(orgId: string, userId: string, input: { permissions: Permission[]; giveAccess?: boolean }): Promise<{ emailed: boolean }> {
    const res = await fetch(`${base(orgId)}/people/${userId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ emailed: boolean }>(res, "Could not save the permissions.");
  }

  async remove(orgId: string, userId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/people/${userId}`, { method: "DELETE" }), "Could not remove them.");
  }

  async makeOwner(orgId: string, userId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/people/${userId}/owner`, { method: "POST" }), "Could not change the owner.");
  }

  /** Resend: a new link, emailed. Copy link needs no call (OpenInvite.link). */
  async resendInvite(orgId: string, inviteId: string): Promise<InviteResult> {
    const res = await fetch(`${base(orgId)}/invites/${inviteId}/resend`, { method: "POST" });
    return readJson<InviteResult>(res, "Could not send the invite.");
  }

  async cancelInvite(orgId: string, inviteId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/invites/${inviteId}`, { method: "DELETE" }), "Could not cancel the invite.");
  }

  async addToClient(orgId: string, clientId: string, userIds: string[]): Promise<{ added: number }> {
    const res = await fetch(`${base(orgId)}/clients/${clientId}/members`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ userIds }) });
    return readJson<{ added: number }>(res, "Could not add them.");
  }

  async removeFromClient(orgId: string, clientId: string, userId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/clients/${clientId}/members/${userId}`, { method: "DELETE" }), "Could not remove them from this client.");
  }

  async inviteToClient(orgId: string, clientId: string, email: string): Promise<InviteResult> {
    const res = await fetch(`${base(orgId)}/clients/${clientId}/invites`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ email }) });
    return readJson<InviteResult>(res, "Could not send the invite.");
  }
}

export const peopleService = new PeopleService();
