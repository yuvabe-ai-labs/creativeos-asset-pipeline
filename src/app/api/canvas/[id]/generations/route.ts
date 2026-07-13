import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk } from "@/lib/api/route-helpers";

export type CanvasGenerationItem = {
  id: string;
  nodeId: string;
  nodeName: string | null;
  imageUrl: string;
  modelUsed: string | null;
  createdAt: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: canvasId } = await params;
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("generations")
    .select(
      `id, model_used, created_at,
       nodes!inner ( id, name, canvas_id ),
       node_versions!inner ( output )`
    )
    .eq("nodes.canvas_id", canvasId)
    .eq("type", "image")
    .eq("status", "succeeded")
    .not("node_versions.output", "is", null)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message ?? "Failed to fetch generations", 500);

  const items: CanvasGenerationItem[] = (data ?? [])
    .map((row) => {
      const node = (Array.isArray(row.nodes) ? row.nodes[0] : row.nodes) as {
        id: string;
        name: string | null;
      } | null;
      const version = (
        Array.isArray(row.node_versions) ? row.node_versions[0] : row.node_versions
      ) as { output: string } | null;

      if (!node || !version?.output) return null;

      return {
        id: row.id as string,
        nodeId: node.id,
        nodeName: node.name,
        imageUrl: version.output,
        modelUsed: row.model_used as string | null,
        createdAt: row.created_at as string,
      };
    })
    .filter((item): item is CanvasGenerationItem => item !== null);

  return apiOk({ items });
}
