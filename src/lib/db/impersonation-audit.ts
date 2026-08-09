import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

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
