import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, apiOk, withTryCatch, withCanvas } from "@/lib/api/route-helpers";
import { edgeRowToFlow, flowEdgeToRow, type EdgeRow } from "@/lib/db/edge-rows";

type InternalEdge = { source: string; target: string };

type BatchDuplicateBody = {
  canvasId: string;
  nodeIds: string[];
  internalEdges: InternalEdge[];
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as BatchDuplicateBody | null;
  const { canvasId, nodeIds, internalEdges } = body ?? {};

  if (typeof canvasId !== "string" || !canvasId || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    return apiError("canvasId and nodeIds are required.", 400);
  }

  // canvasId comes from the request body, not a URL param — this route isn't rooted at
  // /api/canvas/[id]/* or /api/nodes/[id]/*, so it never went through an isolation check
  // at all until now. withCanvas takes the same { id } shape everywhere else uses.
  return withCanvas(req, Promise.resolve({ id: canvasId }), async () => {
    return withTryCatch("Batch duplicate failed", async () => {
    const supabase = createServerSupabase();

    // 1. Fetch all source nodes — validate they belong to this canvas
    const { data: sourceNodes, error: fetchErr } = await supabase
      .from("nodes")
      .select("*")
      .in("id", nodeIds)
      .eq("canvas_id", canvasId);

    if (fetchErr || !sourceNodes) {
      return apiError("Failed to fetch source nodes.", 500);
    }

    // Silently skip KB nodes (defensive — client already filters them)
    const eligible = sourceNodes.filter((n) => n.type !== "kb");
    if (eligible.length === 0) {
      return apiOk({ nodes: [], edges: [] }, 201);
    }

    // 2. Build oldId → newId map
    const oldToNew = new Map<string, string>();
    for (const node of eligible) {
      oldToNew.set(node.id, crypto.randomUUID());
    }

    // 3. Insert all new nodes
    const newNodeRows = eligible.map((node) => {
      const position = node.position as { x: number; y: number };
      return {
        id: oldToNew.get(node.id)!,
        canvas_id: canvasId,
        type: node.type,
        position: { x: position.x + 32, y: position.y - 32 },
        data: node.data ?? {},
        active_version_id: null,
      };
    });

    const { data: insertedNodes, error: insertErr } = await supabase
      .from("nodes")
      .insert(newNodeRows)
      .select();

    if (insertErr || !insertedNodes) {
      return apiError("Failed to insert duplicate nodes.", 500);
    }

    // 4. Copy active versions — guarded, same as the single-node duplicate route.
    // Silent skip on any version failure is spec-intentional: version loss never blocks node creation.
    // Callers receive nodes with active_version_id: null for any skipped versions.
    for (const sourceNode of eligible) {
      if (!sourceNode.active_version_id) continue;

      const newNodeId = oldToNew.get(sourceNode.id)!;

      const { data: activeVersion, error: versionErr } = await supabase
        .from("node_versions")
        .select("*")
        .eq("id", sourceNode.active_version_id)
        .single();

      if (versionErr || !activeVersion) continue; // silent skip

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

      if (newVersionErr || !newVersion) continue; // silent skip

      const { error: updateErr } = await supabase
        .from("nodes")
        .update({ active_version_id: newVersion.id })
        .eq("id", newNodeId);

      if (!updateErr) {
        // Keep insertedNodes in sync (find and mutate the matching row)
        const row = insertedNodes.find((n) => n.id === newNodeId);
        if (row) row.active_version_id = newVersion.id;
      }
    }

    // 5. Remap and insert internal edges
    // Only remap edges where both endpoints are in the eligible set
    const eligibleIds = new Set(eligible.map((n) => n.id));
    // Through flowEdgeToRow, not hand-mapped. Building these rows by hand is what broke this
    // endpoint: the columns are source_node_id / target_node_id and both are NOT NULL, so
    // rows keyed `source` / `target` failed the insert and returned a 500 — but only when the
    // selection actually contained an edge, which is why it looked like a File + Image Gen
    // problem rather than an every-edge problem.
    const edgesToInsert: EdgeRow[] = (internalEdges ?? [])
      .filter((e): e is InternalEdge => typeof e?.source === "string" && typeof e?.target === "string")
      .filter((e) => eligibleIds.has(e.source) && eligibleIds.has(e.target))
      .map((e) =>
        flowEdgeToRow(canvasId, {
          id: crypto.randomUUID(),
          source: oldToNew.get(e.source)!,
          target: oldToNew.get(e.target)!,
        }),
      );

    let insertedEdges: EdgeRow[] = [];
    if (edgesToInsert.length > 0) {
      const { data: edgeData, error: edgeErr } = await supabase
        .from("edges")
        .insert(edgesToInsert)
        .select();

      if (edgeErr || !edgeData) {
        // The duplicate nodes are already committed at this point — there is no transaction
        // spanning the two inserts — so leaving them would strand copies the client never
        // learns about, and every retry would strand more.
        await supabase.from("nodes").delete().in("id", [...oldToNew.values()]);
        return apiError("Failed to insert duplicate edges.", 500);
      }
      insertedEdges = edgeData as EdgeRow[];
    }

    // Each duplicate says which node it came from, rather than leaving the client to pair
    // them up by array position.
    //
    // Positional pairing was only ever correct by luck: `eligible` here is derived from
    // `.in("id", nodeIds)`, and Postgres gives no ordering guarantee for an IN filter, so the
    // server's order need not match the client's. When it did not, the client spread the
    // WRONG source node over the duplicate — including its `type`, so a copied File node
    // could land in the store as an image-gen node. It never showed up because this path
    // failed at the edge insert for any selection containing an edge; fixing that made it
    // reachable.
    const newToOld = new Map([...oldToNew].map(([oldId, newId]) => [newId, oldId]));
    const nodesWithSource = insertedNodes.map((n) => ({ ...n, sourceId: newToOld.get(n.id) }));

    // Edges go back in React Flow's shape, since that is what the client puts straight into
    // its store. Handing back raw rows would leave every duplicated edge with no `source`.
    return apiOk({ nodes: nodesWithSource, edges: insertedEdges.map(edgeRowToFlow) }, 201);
    });
  });
}
