import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { listIncomingEdges } from "@/lib/db/edges";
import { listLatestGenerations } from "@/lib/db/generations";
import { getNodeTypeOnCanvas } from "@/lib/db/nodes";
import type { EditorDubJob } from "@/lib/editor/dub-jobs";

// D406 — what the editor polls while a dub or lip sync runs: the latest one for each clip that
// feeds this Editor. The nodes come from the Editor's own edges (rule 14), one query for all.

export async function GET(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the dubs.", async () => {
      const nodeId = z.uuid().safeParse(new URL(req.url).searchParams.get("nodeId"));
      if (!nodeId.success) return apiError("Say which Editor.", 400);
      const [type, incoming] = await Promise.all([getNodeTypeOnCanvas(nodeId.data, canvasId), listIncomingEdges(nodeId.data)]);
      if (type !== "editor") return apiError("Editor not found.", 404);
      const rows = await listLatestGenerations(incoming.map((e) => e.sourceNodeId), ["dub", "lipsync"]);
      const jobs: EditorDubJob[] = rows.map((r) => ({ nodeId: r.node_id!, kind: r.type as EditorDubJob["kind"], status: r.status as EditorDubJob["status"], error: r.error }));
      return apiOk({ jobs });
    }),
  );
}
