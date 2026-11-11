// src/lib/me/test-fixtures.ts
import type { Access } from "@/lib/permissions/access";
import { packAccessRules } from "@/lib/permissions/browser";
import type { MePayload } from "./types";

export function testMePayload(access: Access, over: Partial<MePayload> = {}): MePayload {
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    presetKey: access.presetKey,
    presetName: "Designer",
    permissions: packAccessRules(access),
    clientScope: access.clientScope === "all" ? "all" : [...access.clientScope].sort(),
    creditsUsed: 42,
    monthlyCreditLimit: 1000,
    role: "designer",
    orgRole: "designer",
    ...over,
  };
}
