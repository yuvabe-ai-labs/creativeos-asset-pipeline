import "server-only";
import { isOwnStoredUrl } from "@/lib/storage";
import { durationOfParams } from "@/lib/voice-change/record";
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { NodeVersionRow } from "@/lib/db/types";
import { DUB_MAX_SECONDS } from "./constants";

/** D374 — the one connected Video Gen node's active version, read on the server, used as-is. */
export async function resolveDubSource(
  nodeId: string,
  deps: {
    getUpstreamOutputs: (nodeId: string) => Promise<UpstreamOutput[]>;
    getVersionById: (id: string) => Promise<NodeVersionRow | null>;
  },
): Promise<
  | { ok: true; sourceNodeId: string; sourceVersionId: string; sourceUrl: string; durationSeconds: number }
  | { ok: false; reason: string }
> {
  const video = (await deps.getUpstreamOutputs(nodeId)).find((u) => u.type === "video-gen");
  if (!video) return { ok: false, reason: "Connect a video to dub." };
  const noTake = { ok: false as const, reason: "The connected video has no finished take yet." };
  if (!video.versionId) return noTake;
  const version = await deps.getVersionById(video.versionId);
  if (!version || version.node_id !== video.nodeId || version.error || typeof version.output !== "string" || !isOwnStoredUrl(version.output)) {
    return noTake;
  }
  const durationSeconds = durationOfParams(version.params_used ?? {});
  if (!durationSeconds) return { ok: false, reason: "This take has no recorded length, so it can't be priced." };
  if (durationSeconds > DUB_MAX_SECONDS) return { ok: false, reason: "Dubbing works on clips up to a minute." };
  return { ok: true, sourceNodeId: video.nodeId, sourceVersionId: version.id, sourceUrl: version.output, durationSeconds };
}
