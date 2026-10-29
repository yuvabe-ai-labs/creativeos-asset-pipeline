import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { deleteCanvasEdge, getCanvasNode, insertCanvasEdges, insertCanvasNode } from "@/lib/db/canvas-graph";
import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { listIncomingEdges } from "@/lib/db/edges";
import { getEditorEdit, saveEditorEdit } from "@/lib/db/editor-edits";
import { loadEditorState } from "@/lib/editor/load-state";
import { remapSource } from "@/lib/editor/remap-source";
import { EditDocSchema } from "@/lib/editor/types";

// D406 — "Dub this clip" from the editor: a Dubbing node on the canvas beside the clip, wired
// Video Gen → Dubbing → Editor, and the clip's pieces moved onto it, trims and captions intact.
// Only the tab holding the canvas lock (the open editor) may do this; it has just saved its edit.
const BodySchema = z.object({ nodeId: z.uuid(), sessionId: z.string().min(1), sourceNodeId: z.uuid() });
const LOCK_LOST = "Someone else is editing this canvas now, so the editor is read-only.";
const BESIDE_X = 360;

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't set up the dub. Try again.", async () => {
      const parsed = BodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Say which clip to dub.", 400);
      const { nodeId, sessionId, sourceNodeId } = parsed.data;

      const [holder, editor, video, incoming, stored] = await Promise.all([
        getCanvasLockHolder(canvasId),
        getCanvasNode(canvasId, nodeId),
        getCanvasNode(canvasId, sourceNodeId),
        listIncomingEdges(nodeId),
        getEditorEdit(canvasId),
      ]);
      if (holder !== sessionId) return apiError(LOCK_LOST, 409);
      if (editor?.type !== "editor") return apiError("Editor not found.", 404);
      const feed = incoming.find((e) => e.sourceNodeId === sourceNodeId);
      if (video?.type !== "video-gen" || !feed) return apiError("That clip isn't connected to this Editor.", 404);
      const prev = stored && stored.nodeId === nodeId ? EditDocSchema.safeParse(stored.doc) : null;
      if (!prev?.success) return apiError("Couldn't read the edit. Reopen the editor.", 409);

      const dubbingId = crypto.randomUUID();
      const toEditor = crypto.randomUUID();
      await insertCanvasNode(canvasId, { id: dubbingId, type: "dubbing", position: { x: video.position.x + BESIDE_X, y: video.position.y }, data: {} });
      await insertCanvasEdges(canvasId, [
        { id: crypto.randomUUID(), source: sourceNodeId, target: dubbingId },
        { id: toEditor, source: dubbingId, target: nodeId },
      ]);
      await deleteCanvasEdge(canvasId, feed.id);
      const was = prev.data.sources.find((s) => s.nodeId === sourceNodeId);
      const doc = remapSource(prev.data, sourceNodeId, { nodeId: dubbingId, edgeId: toEditor, versionId: `input:${was?.versionId ?? ""}` });
      await saveEditorEdit({ nodeId, canvasId, doc });

      const state = await loadEditorState(canvasId);
      return apiOk({ dubbingNodeId: dubbingId, state });
    }),
  );
}
