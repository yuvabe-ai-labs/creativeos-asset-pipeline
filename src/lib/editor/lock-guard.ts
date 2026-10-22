// D390 — the server's half of the generation lock, shared by every start route (video generate,
// voice change, dub, lip sync): a 409 with the reason when the node feeds the Editor, else null.
// One database call (editor_generation_lock). A failed check throws: it never reads as unlocked.
// D408 — the open editor itself may dub and lip sync what feeds it: when `editor.sessionId` holds
// the node's canvas lock, the start goes ahead (one more read, only for a locked node).
import "server-only";
import { apiError } from "@/lib/api/route-helpers";
import { getCanvasLockHolder } from "@/lib/db/canvas-lock";
import { getEditorGenerationLock } from "@/lib/db/generation-lock";
import { GENERATION_LOCK_COPY } from "./generation-lock";

export async function editorLockResponse(nodeId: string, editor?: { canvasId: string; sessionId?: string | null }) {
  const lock = await getEditorGenerationLock(nodeId);
  if (!lock) return null;
  if (editor?.sessionId && (await getCanvasLockHolder(editor.canvasId)) === editor.sessionId) return null;
  return apiError(GENERATION_LOCK_COPY[lock].long, 409);
}
