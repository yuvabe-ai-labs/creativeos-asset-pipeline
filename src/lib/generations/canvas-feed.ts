// D366 — the canvas's one generations feed: what it loads, and how. Pure apart from the Supabase
// client it is handed, so the load is tested on its own (use-generation-tray.ts calls it).
import type { GenerationRow } from "@/lib/db/types";
import { chunkIds } from "@/lib/db/reconcile";
import type { createBrowserSupabase } from "@/lib/supabase/client";

/** The columns the tray, the per-node status and the completion announcements read. Live rows
 *  from Realtime carry every column; loaded rows carry only these (AGENTS.md rule 8). */
export type GenerationFeedRow = Pick<
  GenerationRow,
  "id" | "node_id" | "type" | "status" | "error" | "output_snapshot" | "created_at" | "version_id"
>;
export const GENERATION_FEED_COLUMNS = "id,node_id,type,status,error,output_snapshot,created_at,version_id";

/** The newest rows loaded per chunk of 100 nodes. Newest first, so every node with recent work
 *  keeps its latest row (the one its status reads); only old history is left out. */
export const GENERATION_FEED_ROWS_PER_CHUNK = 300;

/** The slice of the browser Supabase client this load uses. */
export type GenerationFeedClient = Pick<ReturnType<typeof createBrowserSupabase>, "from">;

/** The recent generations of these nodes. Node ids go in chunks of 100 (a long `.in()` list
 *  overflows the gateway's URL limit, see reconcile.ts), fetched in parallel. Throws on any
 *  failed read: a failed load is never "no jobs". */
export async function loadGenerationFeed(
  supabase: GenerationFeedClient,
  nodeIds: string[],
): Promise<GenerationFeedRow[]> {
  const chunks = await Promise.all(
    chunkIds(nodeIds).map(async (ids) => {
      const { data, error } = await supabase
        .from("generations")
        .select(GENERATION_FEED_COLUMNS)
        .in("node_id", ids)
        .order("created_at", { ascending: false })
        .limit(GENERATION_FEED_ROWS_PER_CHUNK);
      if (error) throw error;
      return (data ?? []) as GenerationFeedRow[];
    }),
  );
  return chunks.flat();
}
