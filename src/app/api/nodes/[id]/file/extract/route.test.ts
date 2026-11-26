import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, _guard: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("node-1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { create } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { POST } from "./route";

// D560 — a File node's extraction records what it cost us, once.
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1500 };
const post = () =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify({ llmPrompt: "Summarise", fileKind: "text", rawText: "FILE BODY" }) }), {
    params: Promise.resolve({ id: "node-1" }),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/nodes/:id/file/extract cost record", () => {
  it("records the call once, with only OpenAI's usage as raw", async () => {
    create.mockResolvedValue({ output_text: "summary", usage });
    expect((await post()).status).toBe(200);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({
      orgId: "org-1", clientId: "client-1", userId: "u1", userEmail: "u@x.com", nodeId: "node-1",
      type: "file_extract", modelId: "openai:gpt-5.4-mini",
      meters: { input_token: 1000, cached_input_token: 200, text_output_token: 300 },
    });
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records nothing when OpenAI fails", async () => {
    create.mockRejectedValue(new Error("rate limited"));
    expect((await post()).status).toBe(500);
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
