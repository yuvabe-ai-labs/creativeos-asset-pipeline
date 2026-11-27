// src/lib/me/test-fixtures.ts
import type { MePayload } from "./types";

/** A member of org-1 on c1 with no permissions (look only), unless `over` says otherwise. */
export function testMePayload(over: Partial<MePayload> = {}): MePayload {
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    isOwner: false,
    accessGiven: true,
    permissions: [],
    clients: [{ clientId: "c1", permissions: [] }],
    creditsUsed: null,
    monthlyCreditLimit: null,
    signedUpCount: null,
    billing: null,
    ...over,
  };
}
