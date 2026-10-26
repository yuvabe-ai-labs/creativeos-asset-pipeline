// The reel planned from its SAVED edit, read fresh on the server (rule 10), named after the client
// and canvas (D416), with pauses as markers (D409). Shared by the Premiere and MP4 exports (D417).
import "server-only";
import { resolveOrgId } from "@/lib/dal";
import { getClientById } from "@/lib/db/clients";
import { listTranscripts } from "@/lib/db/media-transcripts";
import type { CanvasRow } from "@/lib/db/types";
import { loadEditorState } from "./load-state";
import { reelName } from "./package";
import { pausesFromWords } from "./pauses";
import { planSequence, type SequencePlan } from "./sequence-plan";
import { planTranscription } from "./transcribe-plan";

export type SavedReelPlan = { ok: true; plan: SequencePlan; orgId: string } | { ok: false; status: 404 | 422; reason: string };

export async function planSavedReel(canvas: CanvasRow, nodeId: string): Promise<SavedReelPlan> {
  const [state, orgId, client] = await Promise.all([loadEditorState(canvas.id), resolveOrgId(), getClientById(canvas.client_id)]);
  if (!state || state.editorNodeId !== nodeId) return { ok: false, status: 404, reason: "Editor not found." };
  const { files } = planTranscription(state.doc, state.sources);
  const transcripts = await listTranscripts(files.map((f) => f.url));
  const pauses = new Map([...transcripts].map(([url, t]) => [url, pausesFromWords(t.words)] as const));
  const planned = planSequence(state.doc, state.sources, { pauses, name: reelName(client?.name, canvas.name) });
  return planned.ok ? { ok: true, plan: planned.plan, orgId } : { ok: false, status: 422, reason: planned.reason };
}
