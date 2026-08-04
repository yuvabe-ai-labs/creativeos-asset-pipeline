import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withCanvas } from "@/lib/api/route-helpers";

export type CanvasGenerationItem = {
  id: string;
  nodeId: string;
  nodeName: string | null;
  imageUrl: string;
  modelUsed: string | null;
  createdAt: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withCanvas(req, params, async (canvasId) => {
    const supabase = createServerSupabase();

    // Step 1: fetch all nodes in this canvas
    const { data: nodesData, error: nodesError } = await supabase
      .from("nodes")
      .select("id, data")
      .eq("canvas_id", canvasId);

    if (nodesError) return apiError(nodesError.message ?? "Failed to fetch nodes", 500);
    const nodes = nodesData ?? [];
    if (nodes.length === 0) return apiOk({ items: [] });

    const nodeIds = nodes.map((n) => n.id as string);
    const nodeNameById = new Map<string, string | null>(
      nodes.map((n) => {
        const d = (n.data ?? {}) as Record<string, unknown>;
        const name = typeof d.name === "string" ? d.name : null;
        return [n.id as string, name];
      })
    );

    // Step 2: fetch succeeded image generations for those nodes, with their version output
    const { data: gensData, error: gensError } = await supabase
      .from("generations")
      .select("id, node_id, model_used, created_at, version_id")
      .in("node_id", nodeIds)
      .eq("type", "image")
      .eq("status", "succeeded")
      .not("version_id", "is", null)
      .order("created_at", { ascending: false });

    if (gensError) return apiError(gensError.message ?? "Failed to fetch generations", 500);
    const gens = gensData ?? [];
    if (gens.length === 0) return apiOk({ items: [] });

    // Step 3: fetch the version outputs
    const versionIds = gens.map((g) => g.version_id as string).filter(Boolean);
    const { data: versionsData, error: versionsError } = await supabase
      .from("node_versions")
      .select("id, output")
      .in("id", versionIds);

    if (versionsError) return apiError(versionsError.message ?? "Failed to fetch versions", 500);
    const outputById = new Map<string, unknown>(
      (versionsData ?? []).map((v) => [v.id as string, v.output])
    );

    const items: CanvasGenerationItem[] = gens
      .map((g) => {
        const output = outputById.get(g.version_id as string);
        if (typeof output !== "string" || !output.startsWith("http")) return null;
        return {
          id: g.id as string,
          nodeId: g.node_id as string,
          nodeName: nodeNameById.get(g.node_id as string) ?? null,
          imageUrl: output,
          modelUsed: g.model_used as string | null,
          createdAt: g.created_at as string,
        };
      })
      .filter((item): item is CanvasGenerationItem => item !== null);

    return apiOk({ items });
  });
}
