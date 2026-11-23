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

/** Whether a Realtime row belongs in the feed: a job of a node on this canvas. A record-only row
 *  (D537) records what a free feature cost us; it is not a job, so the tray and the node's status
 *  never see it. */
export function isLiveFeedRow(
  row: Pick<GenerationRow, "id" | "node_id" | "record_only"> | null | undefined,
  isOnCanvas: (nodeId: string) => boolean,
): row is Pick<GenerationRow, "id" | "record_only"> & { node_id: string } {
  if (!row?.id || row.record_only) return false;
  return row.node_id !== null && isOnCanvas(row.node_id);
}

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
        // D537: a record-only row is a cost record, not a job; it never shows in the tray or a status.
        .eq("record_only", false)
        .order("created_at", { ascending: false })
        .limit(GENERATION_FEED_ROWS_PER_CHUNK);
      if (error) throw error;
      return (data ?? []) as GenerationFeedRow[];
    }),
  );
  return chunks.flat();
}
