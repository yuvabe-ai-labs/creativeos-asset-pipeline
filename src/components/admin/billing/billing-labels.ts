import type { BillingMode } from "@/lib/billing/grants";
import type { GrantKind } from "@/lib/billing/grants";

export const BILLING_MODE_LABEL: Record<BillingMode, string> = {
  managed: "Managed by Yuvabe",
  plans: "Pays for a plan",
};

export const BILLING_MODE_OPTIONS = (["plans", "managed"] as const).map((value) => ({ value, label: BILLING_MODE_LABEL[value] }));

export const GRANT_KIND_LABEL: Record<GrantKind, string> = {
  free: "Free credits",
  plan: "Plan",
  topup: "Top-up",
  admin: "Added by Yuvabe",
};
