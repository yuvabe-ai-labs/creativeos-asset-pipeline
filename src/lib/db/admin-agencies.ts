import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { inviteLink } from "@/lib/invites/token";
import { unwrapEmbed, type Embed } from "./embed";
import type { BillingMode, GrantKind } from "@/lib/billing/grants";
import type { AgencySource, LiveSubscriptionStatus } from "@/lib/admin/agencies-list";

type OrgRead = { id: string; name: string; billing_mode: BillingMode; monthly_credit_limit: number | string | null; clients: { count: number }[] | null };
type InviteRead = { org_id: string; email: string; created_at: string; expires_at: string; token: string };
type ActivityRead = { org_id: string; owner_email: string | null; member_count: number; last_run_at: string | null };
type UsageRead = { org_id: string; credits_used: number | string | null };
type GrantRead = { org_id: string; kind: GrantKind; credits: number | string; used: number | string; ends_at: string };
type SubscriptionRead = {
  org_id: string;
  status: LiveSubscriptionStatus;
  payment_due_since: string | null;
  price: Embed<{ interval_months: number | null; product: Embed<{ name: string }> }>;
};

/** Owner email, people and last run for every agency (0101). Null when the read fails, for
 *  example before the migration is applied: the list still renders, with those values unknown. */
async function readActivity(db: ReturnType<typeof createServerSupabase>): Promise<Map<string, ActivityRead> | null> {
  try {
    const { data, error } = await db.rpc("admin_agency_activity");
    if (error) throw error;
    return new Map(((data ?? []) as ActivityRead[]).map((r) => [r.org_id, r]));
  } catch (e) {
    console.error("[admin] could not read agency activity", e);
    return null;
  }
}

// Admin › Agencies (D590): every agency with what the list shows, in one round of parallel reads,
// whatever the number of agencies (performance rules 1 and 5). Only the columns used are read.
export async function listAgencySources(now: Date): Promise<AgencySource[]> {
  const db = createServerSupabase();
  const at = now.toISOString();
  const [orgsRes, ownersRes, invitesRes, activity, usageRes, grantsRes, subsRes] = await Promise.all([
    db.from("organizations").select("id, name, billing_mode, monthly_credit_limit, clients(count)").order("created_at", { ascending: true }),
    db.from("org_memberships").select("org_id").eq("is_owner", true),
    db.from("org_invitations").select("org_id, email, created_at, expires_at, token").eq("as_owner", true).is("accepted_at", null).is("revoked_at", null),
    readActivity(db),
    db.from("org_credit_usage").select("org_id, credits_used"),
    db.from("credit_grants").select("org_id, kind, credits, used, ends_at").lte("starts_at", at).gt("ends_at", at),
    db
      .from("billing_subscriptions")
      .select("org_id, status, payment_due_since, price:billing_prices!billing_subscriptions_price_id_fkey(interval_months, product:billing_products(name))")
      // The live plan only: an approval of a new price waiting beside it isn't the plan (D595).
      .not("status", "in", "(ended,scheduled)"),
  ]);
  for (const res of [orgsRes, ownersRes, invitesRes, usageRes, grantsRes, subsRes]) if (res.error) throw res.error;

  const owned = new Set(((ownersRes.data ?? []) as { org_id: string }[]).map((r) => r.org_id));
  const invites = new Map(((invitesRes.data ?? []) as InviteRead[]).map((r) => [r.org_id, r]));
  const usage = new Map(((usageRes.data ?? []) as UsageRead[]).map((r) => [r.org_id, Number(r.credits_used ?? 0)]));
  const subs = new Map(((subsRes.data ?? []) as SubscriptionRead[]).map((r) => [r.org_id, r]));
  const grants = new Map<string, AgencySource["grants"]>();
  for (const g of (grantsRes.data ?? []) as GrantRead[]) {
    const list = grants.get(g.org_id) ?? [];
    list.push({ kind: g.kind, credits: Number(g.credits), used: Number(g.used), endsAt: g.ends_at });
    grants.set(g.org_id, list);
  }

  return ((orgsRes.data ?? []) as OrgRead[]).map((o) => {
    const invite = invites.get(o.id);
    const act = activity?.get(o.id);
    const sub = subs.get(o.id);
    const price = unwrapEmbed(sub?.price);
    return {
      id: o.id,
      name: o.name,
      billingMode: o.billing_mode,
      monthlyLimit: o.monthly_credit_limit === null ? null : Number(o.monthly_credit_limit),
      clientCount: o.clients?.[0]?.count ?? 0,
      hasOwner: owned.has(o.id),
      ownerInvite: invite ? { email: invite.email, sentAt: invite.created_at, expiresAt: invite.expires_at, link: inviteLink(invite.token) } : null,
      activity: activity === null ? null : { ownerEmail: act?.owner_email ?? null, memberCount: act?.member_count ?? 0, lastRunAt: act?.last_run_at ?? null },
      creditsUsedThisMonth: usage.get(o.id) ?? 0,
      grants: grants.get(o.id) ?? [],
      subscription: sub
        ? { status: sub.status, paymentDueSince: sub.payment_due_since, planName: unwrapEmbed(price?.product)?.name ?? null, intervalMonths: price?.interval_months ?? null }
        : null,
    };
  });
}
