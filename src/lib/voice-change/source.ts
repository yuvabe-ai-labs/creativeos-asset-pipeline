import type { NodeVersionRow } from "@/lib/db/types";
import { isOwnStoredUrl } from "@/lib/storage";

export { readVoiceChange } from "./record";

function durationOf(params: Record<string, unknown>): number {
  const d = Number(params.durationSeconds ?? params.duration ?? params.seconds);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** D284 — the version to re-voice: the chosen one, or (if it was itself voice-changed) its root's original audio. */
export async function resolveVoiceChangeSource(
  nodeId: string,
  baseVersionId: string,
  getVersion: (id: string) => Promise<NodeVersionRow | null>,
): Promise<
  | { ok: true; base: NodeVersionRow; root: NodeVersionRow; sourceUrl: string; durationSeconds: number }
  | { ok: false; reason: string }
> {
  const base = await getVersion(baseVersionId);
  if (!base || base.node_id !== nodeId) return { ok: false, reason: "That version isn't on this node." };
  const rootId = (base.inputs_used?.voiceChange as { rootVersionId?: unknown } | undefined)?.rootVersionId;
  const root = typeof rootId === "string" ? await getVersion(rootId) : base;
  if (!root || root.node_id !== nodeId) return { ok: false, reason: "The original version of this take is gone." };
  if (root.error || typeof root.output !== "string" || !isOwnStoredUrl(root.output)) {
    return { ok: false, reason: "Pick a finished video version to change its voice." };
  }
  const durationSeconds = durationOf(root.params_used ?? {});
  if (!durationSeconds) return { ok: false, reason: "This version has no recorded duration, so its voice can't be priced." };
  return { ok: true, base, root, sourceUrl: root.output, durationSeconds };
}
