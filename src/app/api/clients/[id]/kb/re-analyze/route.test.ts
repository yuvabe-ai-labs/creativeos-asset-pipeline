import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
// withClient: the client in the URL, and the caller's org (org-1, not impersonating).
const getClientById = vi.fn();
vi.mock("@/lib/db/clients", () => ({ getClientById: (id: string) => getClientById(id) }));
vi.mock("@/lib/dal", () => ({ resolveOrgId: vi.fn(async () => "org-1"), resolveCallerContext: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
// The KB version row, read only if it belongs to the client in the URL.
const versionRow = vi.fn();
const versionEq = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => {
        const q = { eq: (col: string, v: string) => (versionEq(col, v), q), maybeSingle: versionRow };
        return q;
      },
    }),
  }),
}));
vi.mock("@/lib/db/kb", () => ({ setKBField: vi.fn() }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
const parse = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { setKBField } from "@/lib/db/kb";
import { POST } from "./route";

// D537 — a single-field KB re-analysis records what it cost us, once.
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1500 };
const post = (clientId = "client-1") =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify({ versionId: "v1", module: "brand_voice", fieldKey: "tone_of_voice", comment: "warmer" }) }), {
    params: Promise.resolve({ id: clientId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getClientById.mockImplementation(async (id: string) => ({ id, org_id: id === "client-9" ? "org-2" : "org-1" }));
  versionRow.mockResolvedValue({ data: { output: {} }, error: null });
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

  it("reads the version only within the client in the URL", async () => {
    parse.mockResolvedValue({ output_parsed: { value: "warm" }, usage });
    await post();
    expect(versionEq).toHaveBeenCalledWith("id", "v1");
    expect(versionEq).toHaveBeenCalledWith("client_id", "client-1");
    expect(setKBField).toHaveBeenCalledTimes(1);
  });

  it("is a 404 for a client in another org: no read, no OpenAI call, no write", async () => {
    const res = await post("client-9");
    expect(res.status).toBe(404);
    expect(versionRow).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(setKBField).not.toHaveBeenCalled();
    expect(recordProviderCost).not.toHaveBeenCalled();
  });

  it("is a 404 for a version that is not this client's: no OpenAI call, no write", async () => {
    versionRow.mockResolvedValue({ data: null, error: null });
    const res = await post();
    expect(res.status).toBe(404);
    expect(parse).not.toHaveBeenCalled();
    expect(setKBField).not.toHaveBeenCalled();
  });
});
