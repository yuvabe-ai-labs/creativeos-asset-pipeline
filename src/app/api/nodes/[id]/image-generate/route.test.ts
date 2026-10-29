import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("ig", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

const m = vi.hoisted(() => ({
  upstream: [] as unknown[],
  start: vi.fn(async () => new Response(JSON.stringify({ generationId: "g1" }), { status: 202 })),
  getVersionById: vi.fn(async () => null as unknown),
}));

vi.mock("@/lib/db/nodes", () => ({ getUpstreamOutputs: vi.fn(async () => m.upstream) }));
vi.mock("@/lib/avatars/presenter-server", () => ({
  withStillPresenter: async (u: unknown) => u,
  withAvatarImages: async (_id: string, u: unknown) => u,
}));
vi.mock("@/lib/db/versions", () => ({ getVersionById: m.getVersionById }));
vi.mock("@/lib/image-gen/start-generation", () => ({ startImageGeneration: m.start }));
vi.mock("@/lib/image-gen/registry", () => ({
  DEFAULT_MODEL_ID: "openai:gpt-image-2",
  imageGenRegistry: {
    "openai:gpt-image-2": {
      label: "GPT Image 2",
      maxReferenceImages: 16,
      maxReferenceSizeBytes: 0,
      schema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    },
  },
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "ig" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.upstream = [
    { nodeId: "p1", type: "prompt", data: {}, activeOutput: "A mug on a desk", versionId: "pv1" },
  ];
});

describe("POST image-generate (D366)", () => {
  it("hands a generation to startImageGeneration and passes its 202 through", async () => {
    const res = await post({ modelId: "openai:gpt-image-2", params: { quality: "high" } });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ generationId: "g1" });
    expect(m.start).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "ig",
        orgId: "org-1",
        clientId: "client-1",
        modelId: "openai:gpt-image-2",
        params: { quality: "high" },
        inputsUsed: expect.objectContaining({ promptNodeId: "p1", promptVersionId: "pv1" }),
      }),
    );
    const call = (m.start.mock.calls[0] as unknown[])[0] as { prompt: string };
    expect(call.prompt).toContain("A mug on a desk");
  });

  it("still refuses a generation with no connected prompt, before starting anything", async () => {
    m.upstream = [];
    const res = await post({ modelId: "openai:gpt-image-2", params: {} });
    expect(res.status).toBe(400);
    expect(m.start).not.toHaveBeenCalled();
  });

  it("refuses a base version that belongs to another node", async () => {
    m.getVersionById.mockResolvedValue({ id: "v-other", node_id: "other-node", output: "https://cdn/x.png", inputs_used: {} });
    const res = await post({ modelId: "openai:gpt-image-2", params: {}, instruction: "the mug", baseVersionId: "v-other" });
    expect(res.status).toBe(400);
    expect(m.start).not.toHaveBeenCalled();
  });

  it("refuses a painted region that is not a PNG", async () => {
    m.getVersionById.mockResolvedValue({ id: "v-base", node_id: "ig", output: "https://cdn/base.png", inputs_used: {} });
    const res = await post({
      modelId: "openai:gpt-image-2",
      params: {},
      instruction: "the mug",
      baseVersionId: "v-base",
      masked: true,
      maskBase64: "AAAA",
      maskMime: "image/jpeg",
    });
    expect(res.status).toBe(400);
    expect(m.start).not.toHaveBeenCalled();
  });

  it("passes a painted mask through as bytes for the shared step to upload", async () => {
    m.getVersionById.mockResolvedValue({ id: "v-base", node_id: "ig", output: "https://cdn/base.png", inputs_used: {} });
    await post({
      modelId: "openai:gpt-image-2",
      params: {},
      instruction: "the mug",
      intent: "remove",
      baseVersionId: "v-base",
      masked: true,
      maskBase64: "AAAA",
      maskMime: "image/png",
    });
    expect(m.start).toHaveBeenCalledWith(
      expect.objectContaining({
        mask: { base64: "AAAA", mime: "image/png" },
        inputsUsed: expect.objectContaining({ baseVersionId: "v-base", masked: true }),
      }),
    );
  });
});
