import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withClient: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("client-1", { id: "client-1", org_id: "org-1" }),
  };
});
vi.mock("@/lib/db/kb", () => ({
  listKBDocuments: vi.fn(async () => [{ id: "d1", file_ext: "pdf", storage_url: "https://files/d1.pdf", filename: "d1.pdf" }]),
  insertKBVersion: vi.fn(async () => ({ id: "v1" })),
  setActiveKBVersion: vi.fn(),
  getActiveKBVersion: vi.fn(async () => null),
}));
vi.mock("@/lib/db/clients", () => ({ setKBStatus: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));
vi.mock("@/lib/kb/fill-rate", () => ({ computeFillRate: () => 0 }));
vi.mock("@/lib/kb/content-rules", () => ({ keepReviewedContentRules: (kb: unknown) => kb }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
const parse = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { POST } from "./route";

// D537 — a KB re-extraction records what it cost us, once.
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1500 };
const post = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "client-1" }) });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/clients/:id/kb/re-extract cost record", () => {
  it("records the call once, with only OpenAI's usage as raw", async () => {
    parse.mockResolvedValue({ output_parsed: {}, usage });
    expect((await post()).status).toBe(200);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({
      orgId: "org-1", clientId: "client-1", type: "kb", modelId: "openai:gpt-5.4-mini",
      meters: { input_token: 1000, cached_input_token: 200, text_output_token: 300 },
    });
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records a paid call with no parsed answer, and nothing when OpenAI fails", async () => {
    parse.mockResolvedValueOnce({ output_parsed: null, usage });
    expect((await post()).status).toBe(500);
    parse.mockRejectedValueOnce(new Error("rate limited"));
    expect((await post()).status).toBe(500);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
  });
});
