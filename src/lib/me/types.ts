// src/lib/me/types.ts
import type { PlatformRole } from "@/lib/dal-logic";
import type { Permission } from "@/lib/permissions/model";
import type { MemberBillingSummary, OwnerBillingSummary } from "@/lib/billing/summary";

/** What /api/me returns and the root layout hands the browser (spec §5). */
export type MePayload = {
  name: string;
  platformRole: PlatformRole;
  /** The agency being acted in (the impersonated one while impersonating). */
  orgId: string;
  orgName: string | null;
  isOwner: boolean;
  /** False while the person has signed up and waits for the owner. */
  accessGiven: boolean;
  /** The agency-level set, in canonical order. */
  permissions: Permission[];
  /** Each client the person is on, with the effective set there. Empty for the owner. */
  clients: { clientId: string; permissions: Permission[] }[];
  /** Both null without view_credits (only the owner and a super admin see credits). */
  creditsUsed: number | null;
  monthlyCreditLimit: number | null;
  /** People signed up and waiting for permissions, for the header's Team link. Null unless manage_team. */
  signedUpCount: number | null;
  /** The agency's billing at a glance (D523): the numbers with view_credits, else only whether AI
   *  runs are paused. Null when it couldn't be read. */
  billing: OwnerBillingSummary | MemberBillingSummary | null;
};
