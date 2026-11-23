import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { RecordFor } from "@/lib/generations/record-for";

/**
 * D537 — whom a canvas copilot call's cost is recorded for: the org, client and script of the
 * canvas the request names (three columns of one row). The copilot routes resolve no caller, so
 * no user is recorded. Never throws: a failed read only means nothing is recorded.
 */
export async function copilotRecordFor(canvasId: string): Promise<RecordFor | undefined> {
  try {
    const { data, error } = await createServerSupabase()
      .from("canvases")
      .select("org_id, client_id, source_script_id")
      .eq("id", canvasId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    const row = data as { org_id: string; client_id: string; source_script_id: string | null };
    return { orgId: row.org_id, clientId: row.client_id, scriptId: row.source_script_id };
  } catch (e) {
    console.error("[record-cost]", "copilot canvas lookup failed", e instanceof Error ? e.message : e);
    return undefined;
  }
}
