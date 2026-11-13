// src/lib/me/test-fixtures.ts
import type { MePayload } from "./types";

/** A member of org-1 with View on c1, unless `over` says otherwise. */
export function testMePayload(over: Partial<MePayload> = {}): MePayload {
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    isOwner: false,
    accessGiven: true,
    permissions: ["view"],
    clients: [{ clientId: "c1", permissions: ["view"] }],
    creditsUsed: null,
    monthlyCreditLimit: null,
    ...over,
  };
}
