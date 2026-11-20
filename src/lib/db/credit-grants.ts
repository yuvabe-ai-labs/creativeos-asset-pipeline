import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { GrantKind, OpenGrant } from "@/lib/billing/grants";

type BalanceRow = {
  grant_id: string;
  kind: GrantKind;
  credits: number | string;
  used: number | string;
  left_credits: number | string;
  ends_at: string;
};

// The agency's open grants, first-ending first (credit_balance, migration 0067). Postgres numeric
// can arrive as a string, so each amount is turned into a number here.
export async function listOpenGrants(orgId: string): Promise<OpenGrant[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("credit_balance", { p_org_id: orgId });
  if (error) throw error;
  return ((data ?? []) as BalanceRow[]).map((r) => ({
    id: r.grant_id,
    kind: r.kind,
    credits: Number(r.credits),
    used: Number(r.used),
    left: Number(r.left_credits),
    endsAt: r.ends_at,
  }));
}
