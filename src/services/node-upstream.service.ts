import type { UpstreamImage, UpstreamPromptNode } from "@/lib/video-gen/api";
import { readJson } from "./read-json";

/** GET /api/nodes/:id/upstream-images — what a Video Gen node is fed: its connected images (two
 *  levels up, through its prompt node) and that prompt node with its rendered motion prompt. */
export type NodeUpstream = {
  images: UpstreamImage[];
  promptNode: UpstreamPromptNode | null;
};

class NodeUpstreamService {
  /** Throws on a failed read. Never resolves a failure as "nothing connected": the Video Gen view
   *  prunes image roles against this list, so an empty answer for an error would wipe them. */
  async get(nodeId: string): Promise<NodeUpstream> {
    const res = await fetch(`/api/nodes/${nodeId}/upstream-images`);
    const json = await readJson<Partial<NodeUpstream>>(res, "Could not load the connected inputs.");
    return { images: json.images ?? [], promptNode: json.promptNode ?? null };
  }
}

export const nodeUpstreamService = new NodeUpstreamService();
