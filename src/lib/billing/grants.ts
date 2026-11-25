/** What a paying agency's credits come from (credit_grants.kind, migration 0091). */
export type GrantKind = "free" | "plan" | "topup" | "admin";

/** Why reserve_credits_v2 refused a run. `limit` is a managed agency's monthly limit; `payment_due`
 *  a paying agency whose plan payment failed or waits for approval (0095). */
export const CREDIT_REFUSALS = ["limit", "used_up", "free_ended", "no_credits", "payment_due"] as const;
export type CreditRefusal = (typeof CREDIT_REFUSALS)[number];

export function isCreditRefusal(v: unknown): v is CreditRefusal {
  return (CREDIT_REFUSALS as readonly unknown[]).includes(v);
}

/** A grant that has started and not ended, as the billing screens show it. */
export type OpenGrant = {
  id: string;
  kind: GrantKind;
  credits: number;
  used: number;
  left: number;
  endsAt: string;
};

/** How an agency is billed (organizations.billing_mode, migration 0091). */
export type BillingMode = "managed" | "plans";
