import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GrantKind, OpenGrant } from "@/lib/billing/grants";

// The owners' credit emails (migration 0105, D596): what is due, the once-only claims, and the
// billing_log rows for the emails that went.

export type OwnerEmailKind = "low_credits" | "free_ending";

export type DueOwnerEmail = {
  kind: OwnerEmailKind;
  orgId: string;
  agency: string;
  to: string[];
  /** The free grant ending (free_ending only). */
  grantId: string | null;
  grants: OpenGrant[];
  subscription: { status: string; currentPeriodEnd: string | null } | null;
  /** When the owners were last told credits are low, as the read saw it (low_credits only). */
  warnedAt: string | null;
};

type GrantJson = { id: string; kind: GrantKind; credits: number | string; used: number | string; left: number | string; ends_at: string };
type DueRow = {
  kind: OwnerEmailKind;
  org_id: string;
  agency: string;
  owner_emails: string[];
  grant_id: string | null;
  grants: GrantJson[] | null;
  subscription_status: string | null;
  current_period_end: string | null;
  warned_at: string | null;
};

export function toDueOwnerEmail(r: DueRow): DueOwnerEmail {
  return {
    kind: r.kind,
    orgId: r.org_id,
    agency: r.agency,
    to: r.owner_emails,
    grantId: r.grant_id,
    grants: (r.grants ?? []).map((g) => ({
      id: g.id,
      kind: g.kind,
      credits: Number(g.credits),
      used: Number(g.used),
      left: Number(g.left),
      endsAt: g.ends_at,
    })),
    subscription: r.subscription_status ? { status: r.subscription_status, currentPeriodEnd: r.current_period_end } : null,
    warnedAt: r.warned_at,
  };
}

/** Every owner email due now, for all agencies in one read (billing_owner_emails_due). */
export async function listDueOwnerEmails(lowShare: number, noticeHours: number, limit: number): Promise<DueOwnerEmail[]> {
  const { data, error } = await createServerSupabase().rpc("billing_owner_emails_due", {
    p_low_share: lowShare,
    p_notice: `${noticeHours} hours`,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as DueRow[]).map(toDueOwnerEmail);
}

/** Takes one email before it is sent. Returns the claim (to give back if the send fails), or null
 *  when another run took it first. */
export async function claimOwnerEmail(due: DueOwnerEmail): Promise<string | null> {
  const supabase = createServerSupabase();
  const { data, error } =
    due.kind === "low_credits"
      ? await supabase.rpc("claim_low_credits_email", { p_org_id: due.orgId, p_seen: due.warnedAt })
      : await supabase.rpc("claim_free_ending_email", { p_grant_id: due.grantId });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

/** Gives a claim back after a failed send, so the next run tries again. */
export async function releaseOwnerEmail(due: DueOwnerEmail, claimed: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } =
    due.kind === "low_credits"
      ? await supabase.rpc("release_low_credits_email", { p_org_id: due.orgId, p_claimed: claimed, p_previous: due.warnedAt })
      : await supabase.rpc("release_free_ending_email", { p_grant_id: due.grantId, p_claimed: claimed });
  if (error) throw error;
}

export type OwnerEmailLog = { orgId: string; after: Record<string, unknown> };

/** One billing_log row per email sent (action `owner_email`), in one insert. */
export async function logOwnerEmails(rows: OwnerEmailLog[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createServerSupabase()
    .from("billing_log")
    .insert(rows.map((r) => ({ org_id: r.orgId, actor_id: null, action: "owner_email", before: null, after: r.after, reason: null })));
  if (error) throw error;
}
