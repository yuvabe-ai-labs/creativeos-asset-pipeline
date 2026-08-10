import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  groupIntoSessions,
  type AuditEventRow,
  type ImpersonationSession,
} from "@/lib/auth/impersonation-audit-view";
import { listGenerationsInWindowForOrg } from "@/lib/db/generations";

export type ImpersonationEventType =
  | "session_started"
  | "elevated_mode_entered"
  | "write_action"
  | "session_ended";

export type ImpersonationEvent = {
  operatorId: string;
  targetOrgId: string;
  eventType: ImpersonationEventType;
  detail?: Record<string, unknown>;
};

// Fire-and-forget from the caller's perspective: a failure to write the audit trail
// must never fail the underlying request (a blocked support operator is worse than a
// missed log line, and this table has no read path that depends on completeness for
// correctness elsewhere in the app). Logged to console so a persistently failing
// audit path is still discoverable in production logs.
export async function logImpersonationEvent(event: ImpersonationEvent): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("impersonation_audit_log").insert({
    operator_id: event.operatorId,
    target_org_id: event.targetOrgId,
    event_type: event.eventType,
    detail: event.detail ?? null,
  });
  if (error) {
    console.error("Failed to write impersonation_audit_log row", event.eventType, error);
  }
}

export type ImpersonationSessionPage = {
  sessions: ImpersonationSession[];
  total: number;
};

// One page of impersonation sessions for an org, newest first. Three bounded queries:
// the session anchors (which define the page's time window), every audit row inside that
// window, and the org's generations inside it. Grouping itself is pure — see
// impersonation-audit-view.ts.
export async function listImpersonationSessionPage(
  orgId: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<ImpersonationSessionPage> {
  const supabase = createServerSupabase();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: anchors, error: anchorErr, count } = await supabase
    .from("impersonation_audit_log")
    .select("id, occurred_at", { count: "exact" })
    .eq("target_org_id", orgId)
    .eq("event_type", "session_started")
    .order("occurred_at", { ascending: false })
    .range(from, to);
  if (anchorErr) throw anchorErr;

  const anchorRows = (anchors ?? []) as { id: string; occurred_at: string }[];
  if (anchorRows.length === 0) return { sessions: [], total: count ?? 0 };

  // The oldest anchor on this page opens the window. A session's events run past its own
  // start (to its session_ended), so the window cannot be closed by a timestamp — on
  // page 2+ it therefore also sweeps in every NEWER session. The anchor id set below is
  // what actually selects this page; the window only bounds how much is fetched.
  const windowStart = anchorRows[anchorRows.length - 1].occurred_at;
  const anchorIds = new Set(anchorRows.map((a) => a.id));

  const { data: events, error: eventErr } = await supabase
    .from("impersonation_audit_log")
    .select("id, operator_id, event_type, detail, occurred_at")
    .eq("target_org_id", orgId)
    .gte("occurred_at", windowStart)
    .order("occurred_at", { ascending: true });
  if (eventErr) throw eventErr;

  const eventRows = (events ?? []) as AuditEventRow[];

  const operatorIds = [...new Set(eventRows.map((e) => e.operator_id))];
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", operatorIds);
  if (profileErr) throw profileErr;

  const nameByUserId = Object.fromEntries(
    ((profiles ?? []) as { user_id: string; display_name: string }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );

  const generations = await listGenerationsInWindowForOrg(orgId, windowStart);

  // A session's id IS its session_started row's id (see groupIntoSessions), so filtering
  // on the anchor set keeps exactly this page's sessions and drops the newer ones the
  // open-ended window dragged in.
  const sessions = groupIntoSessions(eventRows, generations, nameByUserId).filter((s) =>
    anchorIds.has(s.id),
  );

  return { sessions, total: count ?? 0 };
}
