import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/copilot/context", () => ({ buildCopilotContext: vi.fn(async () => "CANVAS") }));
// The signed-in caller, in org-1, not impersonating.
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "user-1", email: "user-1@example.com", orgId: "org-1" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
// The canvas the body names: its client, script and (through the client) its org.
const canvasRow = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: canvasRow }) }) }) }),
}));
const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ chat: { completions: { create } } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";
import { buildCopilotContext } from "@/lib/copilot/context";

// D537 — the canvas copilot records what each call cost us, once, as copilot.
const usage = { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, prompt_tokens_details: { cached_tokens: 200 } };
const expected = {
  orgId: "org-1", clientId: "client-1", scriptId: "script-1", userId: "user-1", userEmail: "user-1@example.com",
  type: "copilot", modelId: "openai:gpt-4o-mini",
  meters: { input_token: 1000, cached_input_token: 200, text_output_token: 300 },
};
const body = { messages: [{ role: "user", content: "hi" }], canvasId: "canvas-1", message: "hi", reply: "ok" };
const request = () => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  canvasRow.mockResolvedValue({ data: { client_id: "client-1", source_script_id: "script-1", clients: { org_id: "org-1" } }, error: null });
});
import { POST } from "./route";

describe("POST /api/copilot/actions cost record", () => {
  it("records the call once, also when the model asks for no action", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: "Just a question." } }], usage });
    expect(await (await POST(request())).json()).toEqual({ action: null });
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject(expected);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records nothing when OpenAI fails", async () => {
    create.mockRejectedValue(new Error("rate limited"));
    expect((await POST(request())).status).toBe(500);
    expect(recordProviderCost).not.toHaveBeenCalled();
  });

  it("is a 404 for a canvas in another org: no canvas read, no OpenAI call, nothing recorded", async () => {
    canvasRow.mockResolvedValue({ data: { client_id: "client-9", source_script_id: null, clients: { org_id: "org-2" } }, error: null });
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Canvas not found." });
    expect(buildCopilotContext).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(recordProviderCost).not.toHaveBeenCalled();
  });

  it("is a 404 for a canvas that does not exist", async () => {
    canvasRow.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });
  it("is a 400 with plain copy when canvasId is not a string: no canvas read", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ ...body, canvasId: 42 }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Open a canvas to use the copilot." });
    expect(canvasRow).not.toHaveBeenCalled();
  });

  it("is a plain 500 when the canvas read returns an error: no OpenAI call", async () => {
    canvasRow.mockResolvedValue({ data: null, error: { message: "canceling statement due to statement timeout" } });
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "We couldn't open this canvas. Please try again." });
    expect(create).not.toHaveBeenCalled();
  });

  it("is a plain 500 when the canvas context cannot be built: no OpenAI call, nothing recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(buildCopilotContext).mockRejectedValueOnce(new Error("nodes read failed"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain("nodes read failed");
    expect(create).not.toHaveBeenCalled();
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
