import type { BillingMode } from "@/lib/billing/grants";

export const BILLING_MODE_LABEL: Record<BillingMode, string> = {
  managed: "Managed by Yuvabe",
  plans: "Pays for a plan",
};

export const BILLING_MODE_OPTIONS = (["plans", "managed"] as const).map((value) => ({ value, label: BILLING_MODE_LABEL[value] }));

export { GRANT_KIND_LABEL } from "@/components/billing/credit-grant-list";
