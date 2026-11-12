// src/lib/me/types.ts
import type { OrgRole, PlatformRole } from "@/lib/dal-logic";
import type { PackedRules } from "@/lib/permissions/browser";

/** What /api/me returns and the root layout hands the browser (D499 §6.3). */
export type MePayload = {
  name: string;
  platformRole: PlatformRole;
  /** The agency being acted in (the impersonated one while impersonating). */
  orgId: string;
  orgName: string | null;
  presetKey: string;
  /** The preset's display name, e.g. "Senior". Null only if the preset row is missing. */
  presetName: string | null;
  permissions: PackedRules;
  clientScope: "all" | string[];
  /** Both null without credits.view. */
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
  /** Read by the approve checks until Task 6 replaces them; removed in Task 11. */
  role: "senior" | "designer";
  /** Read by the profile popover until Task 11; removed there. */
  orgRole: OrgRole;
};
