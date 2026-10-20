import * as z from "zod";
import { apiError, apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { saveEditorEdit } from "@/lib/db/editor-edits";
import { getNodeTypeOnCanvas } from "@/lib/db/nodes";
import { loadEditorState } from "@/lib/editor/load-state";
import { EditDocSchema } from "@/lib/editor/types";

// The canvas's reel edit (D390). GET: the edit reconciled with the Editor's current sources and
// their media facts, in one server read. PATCH: an autosave, accepted only from the session that
// holds the canvas lock (D33), so nothing changes under an open editor.

const LOCK_LOST_MESSAGE = "Someone else is editing this canvas now, so the editor is read-only.";

const SaveSchema = z.object({ nodeId: z.uuid(), sessionId: z.string().min(1), doc: EditDocSchema });

export async function GET(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't load the editor.", async () => {
      const state = await loadEditorState(canvasId);
      if (!state) return apiError("This canvas has no Editor yet.", 404);
      return apiOk(state);
    }),
  );
}

export async function PATCH(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't save the edit.", async () => {
      const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("That edit isn't valid.", 400);
      const { nodeId, sessionId, doc } = parsed.data;
      const [holder, type] = await Promise.all([getCanvasLockHolder(canvasId), getNodeTypeOnCanvas(nodeId, canvasId)]);
      if (type !== "editor") return apiError("Editor not found.", 404);
      if (holder !== sessionId) return apiError(LOCK_LOST_MESSAGE, 409);
      await saveEditorEdit({ nodeId, canvasId, doc });
      return apiOk({ ok: true });
    }),
  );
}
