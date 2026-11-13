// src/lib/me/test-fixtures.ts
import type { Access } from "@/lib/permissions/model";
import { clientIdsWith } from "@/lib/permissions/check";
import { packAccessRules } from "@/lib/permissions/browser";
import type { MePayload } from "./types";

export function testMePayload(access: Access, over: Partial<MePayload> = {}): MePayload {
  const scope = clientIdsWith(access, "org-1", "view");
  return {
    name: "Arun",
    platformRole: "member",
    orgId: "org-1",
    orgName: "Yuvabe Studios",
    presetKey: "member",
    presetName: "Designer",
    permissions: packAccessRules(access, "org-1"),
    clientScope: scope ?? "all",
    creditsUsed: 42,
    monthlyCreditLimit: 1000,
    role: "designer",
    orgRole: "designer",
    ...over,
  };
}
