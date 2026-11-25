import { describe, it, expect, vi, beforeEach } from "vitest";
import { sceneFingerprint } from "@/lib/nodes/scene-beats";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));

vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>(
    "@/lib/api/route-helpers",
  );
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, _guard: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("node-1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

const getNodeActiveKB = vi.fn();
vi.mock("@/lib/db/nodes", () => ({ getNodeActiveKB: (id: string) => getNodeActiveKB(id) }));

const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ chat: { completions: { create } } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });
const returns = (obj: unknown) =>
  create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(obj) } }] });

const scene = { description: "A → B", duration_seconds: 6, voiceover: [] };

beforeEach(() => {
  create.mockReset();
  vi.mocked(recordProviderCost).mockReset();
  getNodeActiveKB.mockReset();
  getNodeActiveKB.mockResolvedValue({ kb: null, kbVersionId: null, clientId: "c1" });
});

describe("POST /api/nodes/:id/split-scene", () => {
  it("returns normalised beats stamped with the scene's fingerprint", async () => {
    returns({
      beats: [
        { description: "A", duration_seconds: 2, voiceover: [] },
        { description: "B", duration_seconds: 2, voiceover: [] },
      ],
    });
    const res = await post({ scene });
    expect(res.status).toBe(200);
    const json = await res.json();
    // 2+2 = 4 on a 6s scene: the 2s shortfall goes to the first longest beat.
    expect(json.beats.map((b: { duration_seconds: number }) => b.duration_seconds)).toEqual([4, 2]);
    expect(json.beatsFor).toBe(sceneFingerprint(scene));
  });

  it("sends a strict json_schema request on the prompt's model", async () => {
    returns({ beats: [] });
    await post({ scene });
    const args = create.mock.calls[0][0];
    expect(args.model).toBe("gpt-5.4-mini");
    expect(args.response_format.json_schema.strict).toBe(true);
  });

  it("rejects a scene with no description", async () => {
    const res = await post({ scene: { ...scene, description: "" } });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("404s when the node's KB lookup finds nothing", async () => {
    getNodeActiveKB.mockResolvedValueOnce(null);
    expect((await post({ scene })).status).toBe(404);
  });

  it("reports a model failure as a 500 with its message", async () => {
    create.mockRejectedValueOnce(new Error("rate limited"));
    const res = await post({ scene });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("rate limited");
  });
});

// D560 — the split records what it cost us, once.
describe("POST /api/nodes/:id/split-scene cost record", () => {
  const usage = { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, prompt_tokens_details: { cached_tokens: 200 } };

  it("records the call once, with only OpenAI's usage as raw", async () => {
    create.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ beats: [] }) } }], usage });
    expect((await post({ scene })).status).toBe(200);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({
      orgId: "org-1", clientId: "client-1", userId: "u1", userEmail: "u@x.com", nodeId: "node-1",
      type: "split_scene", modelId: "openai:gpt-5.4-mini",
      meters: { input_token: 1000, cached_input_token: 200, text_output_token: 300 },
    });
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records nothing when OpenAI fails", async () => {
    create.mockRejectedValueOnce(new Error("rate limited"));
    expect((await post({ scene })).status).toBe(500);
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
