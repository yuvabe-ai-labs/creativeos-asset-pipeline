import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sourceNodeId } = await params;

  return withTryCatch("Duplicate node failed", async () => {
    const supabase = createServerSupabase();

    // 1. Fetch source node
    const { data: sourceNode, error: nodeErr } = await supabase
      .from("nodes")
      .select("*")
      .eq("id", sourceNodeId)
      .single();

    if (nodeErr || !sourceNode) {
      return apiError("Source node not found.", 404);
    }

    // KB nodes cannot be duplicated
    if (sourceNode.type === "kb") {
      return apiError("KB nodes cannot be duplicated.", 400);
    }

    // 2. Create new node
    const newNodeId = crypto.randomUUID();
    const position = sourceNode.position as { x: number; y: number };
    // Place the duplicate ABOVE the original (YUV-195): mirror the 32px cascade upward.
    const newPosition = { x: position.x + 32, y: position.y - 32 };

    const { data: newNode, error: insertErr } = await supabase
      .from("nodes")
      .insert({
        id: newNodeId,
        canvas_id: sourceNode.canvas_id,
        type: sourceNode.type,
        position: newPosition,
        data: sourceNode.data ?? {},
        active_version_id: null,
      })
      .select()
      .single();

    if (insertErr || !newNode) {
      return apiError("Failed to create duplicate node.", 500);
    }

    // 3. Copy active version if one exists
    if (sourceNode.active_version_id) {
      const { data: activeVersion, error: versionErr } = await supabase
        .from("node_versions")
        .select("*")
        .eq("id", sourceNode.active_version_id)
        .single();

      if (!versionErr && activeVersion) {
        const { data: newVersion, error: newVersionErr } = await supabase
          .from("node_versions")
          .insert({
            node_id: newNodeId,
            inputs_used: activeVersion.inputs_used ?? {},
            params_used: activeVersion.params_used ?? {},
            model_used: activeVersion.model_used ?? null,
            output: activeVersion.output ?? null,
            generated_output: activeVersion.generated_output ?? null,
            operator: "duplicate",
          })
          .select()
          .single();

        if (!newVersionErr && newVersion) {
          const { error: updateErr } = await supabase
            .from("nodes")
            .update({ active_version_id: newVersion.id })
            .eq("id", newNodeId);

          if (!updateErr) {
            newNode.active_version_id = newVersion.id;
          }
        }
      }
    }

    return apiOk({ node: newNode }, 201);
  });
}
