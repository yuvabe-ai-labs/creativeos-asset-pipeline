import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type Ownership = { clientId: string; canvasId: string };

export async function resolveOwnership(nodeId: string): Promise<Ownership> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("canvas_id, canvases(client_id)")
    .eq("id", nodeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Node ${nodeId} not found.`);

  const row = data as {
    canvas_id: string;
    canvases: { client_id: string } | null;
  };
  if (!row.canvases) {
    throw new Error(`Canvas for node ${nodeId} not found.`);
  }
  return { clientId: row.canvases.client_id, canvasId: row.canvas_id };
}
