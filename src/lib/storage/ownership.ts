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

  // Supabase types nested joins as arrays even when the FK is many-to-one,
  // so accept either shape at the type level and normalize at runtime.
  const row = data as unknown as {
    canvas_id: string;
    canvases:
      | { client_id: string }
      | { client_id: string }[]
      | null;
  };
  const canvas = Array.isArray(row.canvases) ? row.canvases[0] : row.canvases;
  if (!canvas) {
    throw new Error(`Canvas for node ${nodeId} not found.`);
  }
  return { clientId: canvas.client_id, canvasId: row.canvas_id };
}
