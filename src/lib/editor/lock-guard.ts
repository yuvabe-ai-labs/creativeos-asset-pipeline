// D389 — the server's half of the generation lock, shared by every start route (video generate,
// voice change, dub, lip sync): a 409 with the reason when the node feeds the Editor, else null.
// One database call (editor_generation_lock). A failed check throws: it never reads as unlocked.
import "server-only";
import { apiError } from "@/lib/api/route-helpers";
import { getEditorGenerationLock } from "@/lib/db/generation-lock";
import { GENERATION_LOCK_COPY } from "./generation-lock";

export async function editorLockResponse(nodeId: string) {
  const lock = await getEditorGenerationLock(nodeId);
  return lock ? apiError(GENERATION_LOCK_COPY[lock].long, 409) : null;
}
