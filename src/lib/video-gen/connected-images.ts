import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getPromptUpstream, withAvatarImages } from "@/lib/avatars/presenter-server";
import { withScriptAssetImages } from "@/lib/scripts/asset-nodes";
import { upstreamImageOf } from "./upstream-image";

/**
 * What a Video Gen (or Image Gen) node has wired in: its direct inputs, the prompt nodes among
 * them and their own inputs, and every ready image across both levels. Shared by the
 * upstream-images route (what the view shows) and the video-edit route (D483: which references
 * the caller may send), so the two never disagree about what is connected.
 */
export async function collectConnectedUpstream(nodeId: string, nodeType: string) {
  // D436 — an Avatar wired straight in is its images, as on the generate routes.
  const direct = withScriptAssetImages(await withAvatarImages(nodeId, await getUpstreamOutputs(nodeId)));
  // Also collect upstream of any prompt nodes (2-level traversal): a Video Gen's Motion or
  // Multishot Prompt, an Image Gen's Prompt (D440; its presenter's face included).
  const promptNodes = direct.filter((u) =>
    nodeType === "image-gen" ? u.type === "prompt" : u.type === "video-prompt" || u.type === "multishot-prompt",
  );
  const promptUpstreamBatches = await Promise.all(promptNodes.map((u) => getPromptUpstream(u.nodeId)));
  // Merge and deduplicate; direct edges take precedence.
  const seen = new Map<string, UpstreamOutput>(direct.map((u) => [u.nodeId, u]));
  for (const batch of promptUpstreamBatches) {
    for (const u of batch) if (!seen.has(u.nodeId)) seen.set(u.nodeId, u);
  }
  // D440 — a generated image (Image Gen, Composite) counts when wired straight into this node
  // or into its prompt node, on every lane.
  const images = Array.from(seen.values()).flatMap((u) => {
    const image = upstreamImageOf(u);
    return image ? [image] : [];
  });
  return { direct, promptNodes, promptUpstreamBatches, images };
}
