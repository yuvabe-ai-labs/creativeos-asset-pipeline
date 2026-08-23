// Client-safe API wrappers for video-gen routes.
// All functions throw on non-OK responses so callers can catch and toast.

// TODO: Move VideoGenVersionSummary to lib/types in a future refactor to remove
// this dependency-inversion (lib importing from UI components).
import type { VideoGenVersionSummary } from "@/components/nodes/video-gen-version-history";

export type UpstreamImage = {
  id: string;
  type: string;
  imageUrl: string;
  filename?: string;
};

export type UpstreamPromptNode = {
  id: string;
  text: string | null;
};

export type StartGenerationPayload = {
  modelId: string;
  params: Record<string, unknown>;
  imageRoles: Record<string, string>;
  mock?: boolean;
};

// Carries the response status alongside the message so callers can special-case a 402
// (monthly credit limit reached) with a clearer message than the raw server string.
export class VideoGenApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new VideoGenApiError((body as { error?: string } | null)?.error ?? fallback, res.status);
}

export const videoGenApi = {
  async fetchVersions(nodeId: string): Promise<{
    activeVersionId: string | null;
    versions: VideoGenVersionSummary[];
  }> {
    const res = await fetch(`/api/nodes/${nodeId}/versions`);
    if (!res.ok) await parseError(res, "Failed to load versions");
    const json = await res.json() as {
      activeVersionId: string | null;
      versions: Array<{
        id: string;
        output: string | null;
        error: string | null;
        modelUsed: string | null;
        paramsUsed: Record<string, unknown>;
        createdAt: string;
        creditsCharged?: number | null;
      }>;
    };
    return {
      activeVersionId: json.activeVersionId ?? null,
      versions: (json.versions ?? []).map((v) => ({
        id: v.id,
        output: v.output ?? null,
        error: v.error ?? null,
        modelUsed: v.modelUsed ?? null,
        paramsUsed: v.paramsUsed ?? {},
        createdAt: v.createdAt,
        creditsCharged: v.creditsCharged ?? null,
      })),
    };
  },

  async fetchUpstreamImages(nodeId: string): Promise<{ images: UpstreamImage[]; promptNode: UpstreamPromptNode | null }> {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/upstream-images`);
      if (!res.ok) return { images: [], promptNode: null };
      const json = await res.json() as { images: UpstreamImage[]; promptNode: UpstreamPromptNode | null };
      return { images: json.images ?? [], promptNode: json.promptNode ?? null };
    } catch {
      return { images: [], promptNode: null };
    }
  },

  async startGeneration(
    nodeId: string,
    payload: StartGenerationPayload,
  ): Promise<{ generationId: string }> {
    const res = await fetch(`/api/nodes/${nodeId}/video-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) await parseError(res, "Generation failed");
    const json = await res.json() as { generationId?: string };
    if (!json.generationId) throw new Error("Generation failed: missing generationId in response");
    return { generationId: json.generationId };
  },

  // Returns the version's model and params alongside its video so the caller can put the node
  // back into the state that produced it (YUV-295), not just swap the clip. `modelUsed` is null
  // for versions predating the field; `paramsUsed` is `{}` for versions that recorded none.
  async restoreVersion(
    nodeId: string,
    versionId: string,
  ): Promise<{ output: string; modelUsed: string | null; paramsUsed: Record<string, unknown> }> {
    const res = await fetch(`/api/nodes/${nodeId}/restore-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (!res.ok) await parseError(res, "Restore failed");
    const json = await res.json() as {
      output: string | null;
      modelUsed?: string | null;
      paramsUsed?: Record<string, unknown>;
    };
    if (typeof json.output !== "string") throw new Error("No output returned from restore");
    return {
      output: json.output,
      modelUsed: json.modelUsed ?? null,
      paramsUsed: json.paramsUsed ?? {},
    };
  },
};
