import { readJson } from "./read-json";

/** GET /api/nodes/:id/versions — every version of a node, newest first, plus the active pointer.
 *  Generic over the version shape: the route returns one superset row, and each focus view reads
 *  the fields it renders (ImageGenVersionSummary, VersionSummary, VideoGenVersionSummary…). */
export type NodeVersionsResponse<V> = {
  activeVersionId: string | null;
  versions: V[];
};

class NodeVersionsService {
  async list<V>(nodeId: string): Promise<NodeVersionsResponse<V>> {
    const res = await fetch(`/api/nodes/${nodeId}/versions`);
    const json = await readJson<Partial<NodeVersionsResponse<V>>>(res, "Could not load versions.");
    return { activeVersionId: json.activeVersionId ?? null, versions: json.versions ?? [] };
  }
}

export const nodeVersionsService = new NodeVersionsService();
