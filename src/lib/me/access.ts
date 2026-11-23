// src/lib/me/access.ts
import { buildOrgAccess, type Access } from "@/lib/permissions/model";
import type { MePayload } from "./types";

// D542: the browser builds the same Access the server checked, from what /api/me sent, and runs
// the same check() on it. userId is not sent: no check reads it.
export function accessFromMe(me: MePayload): Access {
  return {
    userId: "",
    isSuperAdmin: me.platformRole === "super_admin",
    orgs: new Map([
      [
        me.orgId,
        buildOrgAccess({
          orgId: me.orgId,
          orgName: me.orgName ?? "",
          isOwner: me.isOwner,
          accessGiven: me.accessGiven,
          permissions: me.permissions,
          clients: me.clients,
        }),
      ],
    ]),
  };
}
