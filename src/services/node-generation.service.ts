import { readJson } from "./read-json";

/** D366 — a started background generation; its result arrives through the node's status. */
export type StartedGeneration = { generationId: string };

/** What a restored version puts the node back to (YUV-295). */
export type RestoredVersion = {
  output?: string;
  modelUsed?: string | null;
  paramsUsed?: Record<string, unknown>;
};

function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

class NodeGenerationService {
  /** Image Gen: generate or edit. Answers once the job is started (202). */
  async startImage(nodeId: string, body: Record<string, unknown>): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/image-generate`, body), "Generation failed");
  }

  /** Composite: generate or edit. Answers once the job is started (202). */
  async startComposite(nodeId: string, body: Record<string, unknown>): Promise<StartedGeneration> {
    return readJson<StartedGeneration>(await post(`/api/nodes/${nodeId}/composite-generate`, body), "Generation failed");
  }

  async restoreVersion(nodeId: string, versionId: string): Promise<RestoredVersion> {
    return readJson<RestoredVersion>(await post(`/api/nodes/${nodeId}/restore-version`, { versionId }), "Restore failed");
  }
}

export const nodeGenerationService = new NodeGenerationService();
