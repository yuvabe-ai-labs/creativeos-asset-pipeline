import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { unwrapEmbed as one, type Embed } from "@/lib/db/embed";

export type ActionTarget =
  | { clientId: string }
  | { canvasId: string }
  | { nodeId: string }
  | { versionId: string }
  | { kbVersionId: string }
  | { kbJobId: string }
  | "agency";

/** nodeType: for node and version targets. nodeId: for version targets (the version's node). */
export type ResolvedTarget = { clientId: string | null; orgId: string; nodeType?: string; nodeId?: string };

// One query per target, resolving to the client and agency it belongs to. null = no such row.
export async function resolveTarget(target: Exclude<ActionTarget, "agency">): Promise<ResolvedTarget | null> {
  const db = createServerSupabase();

  if ("clientId" in target) {
    const { data, error } = await db.from("clients").select("id, org_id").eq("id", target.clientId).maybeSingle();
    if (error) throw error;
    return data ? { clientId: data.id as string, orgId: data.org_id as string } : null;
  }
  if ("canvasId" in target) {
    const { data, error } = await db.from("canvases").select("client_id, clients!inner(org_id)").eq("id", target.canvasId).maybeSingle();
    if (error) throw error;
    const c = data ? one(data.clients as Embed<{ org_id: string }>) : null;
    return data && c ? { clientId: data.client_id as string, orgId: c.org_id } : null;
  }
  if ("nodeId" in target) {
    const { data, error } = await db
      .from("nodes")
      .select("type, canvases!inner(client_id, clients!inner(org_id))")
      .eq("id", target.nodeId)
      .maybeSingle();
    if (error) throw error;
    const cv = data ? one(data.canvases as Embed<{ client_id: string; clients: Embed<{ org_id: string }> }>) : null;
    const c = cv ? one(cv.clients) : null;
    return data && cv && c ? { clientId: cv.client_id, orgId: c.org_id, nodeType: data.type as string } : null;
  }
  if ("versionId" in target) {
    const { data, error } = await db
      .from("node_versions")
      .select("org_id, node_id, nodes!inner(type, canvases!inner(client_id))")
      .eq("id", target.versionId)
      .maybeSingle();
    if (error) throw error;
    const n = data ? one(data.nodes as Embed<{ type: string; canvases: Embed<{ client_id: string }> }>) : null;
    const cv = n ? one(n.canvases) : null;
    return data && n && cv
      ? { clientId: cv.client_id, orgId: data.org_id as string, nodeType: n.type, nodeId: data.node_id as string }
      : null;
  }
  if ("kbVersionId" in target) {
    const { data, error } = await db
      .from("client_kb_versions")
      .select("client_id, clients!inner(org_id)")
      .eq("id", target.kbVersionId)
      .maybeSingle();
    if (error) throw error;
    const c = data ? one(data.clients as Embed<{ org_id: string }>) : null;
    return data && c ? { clientId: data.client_id as string, orgId: c.org_id } : null;
  }
  const { data, error } = await db.from("client_kb_jobs").select("client_id, org_id").eq("id", target.kbJobId).maybeSingle();
  if (error) throw error;
  return data ? { clientId: data.client_id as string, orgId: data.org_id as string } : null;
}
