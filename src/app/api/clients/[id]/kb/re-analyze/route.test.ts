import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, assertImpersonationWriteAllowed: vi.fn(async () => null) };
});
// The KB version row the route already reads, with the client and org it belongs to.
const versionRow = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: versionRow }) }) }) }),
}));
vi.mock("@/lib/db/kb", () => ({ setKBField: vi.fn() }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
const parse = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { POST } from "./route";

// D537 — a single-field KB re-analysis records what it cost us, once.
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1500 };
const post = () =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify({ versionId: "v1", module: "brand_voice", fieldKey: "tone_of_voice", comment: "warmer" }) }), {
    params: Promise.resolve({ id: "client-1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  versionRow.mockResolvedValue({ data: { output: {}, client_id: "client-1", clients: { org_id: "org-1" } }, error: null });
});

describe("POST /api/clients/:id/kb/re-analyze cost record", () => {
  it("records the call once, with only OpenAI's usage as raw", async () => {
    parse.mockResolvedValue({ output_parsed: { value: "warm" }, usage });
    expect((await post()).status).toBe(200);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject({
      orgId: "org-1", clientId: "client-1", type: "kb", modelId: "openai:gpt-5.4-mini",
      meters: { input_token: 1000, cached_input_token: 200, text_output_token: 300 },
    });
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records nothing when OpenAI fails", async () => {
    parse.mockRejectedValue(new Error("rate limited"));
    expect((await post()).status).toBe(500);
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
