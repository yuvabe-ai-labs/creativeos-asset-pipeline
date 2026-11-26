import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, _guard: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("ig", { data: m.nodeData }, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

const m = vi.hoisted(() => ({
  upstream: [] as unknown[],
  nodeData: {} as Record<string, unknown>,
  start: vi.fn(async () => new Response(JSON.stringify({ generationId: "g1" }), { status: 202 })),
  getVersionById: vi.fn(async () => null as unknown),
}));

vi.mock("@/lib/avatars/presenter-server", () => ({
  getImageGenUpstream: async () => m.upstream,
}));
vi.mock("@/lib/db/versions", () => ({ getVersionById: m.getVersionById }));
vi.mock("@/lib/image-gen/start-generation", () => ({ startImageGeneration: m.start }));
const cat = vi.hoisted(() => ({
  value: null as import("@/lib/ai-models/types").AiCatalog | null,
  fail: null as Error | null,
}));
vi.mock("@/lib/ai-models/catalog", async () => {
  const { seededModelCatalog } = await import("@/lib/ai-models/test-catalog");
  return {
    getAiCatalog: async () => {
      if (cat.fail) throw cat.fail;
      return cat.value ?? seededModelCatalog();
    },
  };
});
vi.mock("@/lib/image-gen/adapters", async () => {
  const { stubAdapters } = await import("@/lib/ai-models/test-catalog");
  return { imageAdapters: stubAdapters("image", async () => { throw new Error("a route never generates"); }) };
});

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "ig" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  cat.value = null;
  cat.fail = null;
  m.nodeData = {};
  m.upstream = [
    { nodeId: "p1", type: "prompt", data: {}, activeOutput: "A mug on a desk", versionId: "pv1" },
  ];
});

describe("POST image-generate (D366)", () => {
  it("refuses a retired model before anything starts (D563)", async () => {
    const res = await post({ modelId: "openai:gpt-image-1", params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This model was retired. Pick another.");
    expect(m.start).not.toHaveBeenCalled();
  });

  it("runs a hidden model only on the node that already uses it (D563)", async () => {
    const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
    cat.value = withModel(seededModelCatalog(), "openai:gpt-image-2", { status: "hidden" });
    const refused = await post({ modelId: "openai:gpt-image-2", params: {} });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toBe("This model isn't available. Pick another.");
    m.nodeData = { modelId: "openai:gpt-image-2" };
    expect((await post({ modelId: "openai:gpt-image-2", params: {} })).status).toBe(202);
  });

  it("answers a catalog failure with plain copy and no raw message", async () => {
    cat.fail = new Error("relation ai_models does not exist");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ modelId: "openai:gpt-image-2", params: {} });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not load the models. Try again." });
    expect(m.start).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("with no modelId runs the catalog's default, the first live model (D565)", async () => {
    const { seededModelCatalog, withModel } = await import("@/lib/ai-models/test-catalog");
    const { imageModelsFrom } = await import("@/lib/ai-models/model-lists");
    const seeded = seededModelCatalog();
    const first = imageModelsFrom(seeded).defaultId;
    cat.value = withModel(seeded, first, { status: "hidden" });
    const expected = imageModelsFrom(cat.value).defaultId;
    expect(expected).not.toBe(first);
    const res = await post({ params: {} });
    expect(res.status).toBe(202);
    expect(m.start).toHaveBeenCalledWith(expect.objectContaining({ modelId: expected }));
  });

  it("refuses an unknown model without naming it", async () => {
    const res = await post({ modelId: "openai:nope", params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).not.toContain("nope");
  });

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
        params: expect.objectContaining({ quality: "high" }),
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
