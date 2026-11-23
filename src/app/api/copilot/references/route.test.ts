import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/copilot/context", () => ({ buildCopilotContext: vi.fn(async () => "CANVAS") }));
vi.mock("@/lib/generations/record-cost", () => ({ recordProviderCost: vi.fn() }));
// The canvas row the copilot already names: its org, client and script.
const canvasRow = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: canvasRow }) }) }) }),
}));
const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ chat: { completions: { create } } }) }));

import { recordProviderCost } from "@/lib/generations/record-cost";

// D537 — the canvas copilot records what each call cost us, once, as copilot.
const usage = { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, prompt_tokens_details: { cached_tokens: 200 } };
const expected = {
  orgId: "org-1", clientId: "client-1", scriptId: "script-1",
  type: "copilot", modelId: "openai:gpt-4o-mini",
  meters: { input_token: 1000, cached_input_token: 200, text_output_token: 300 },
};
const body = { messages: [{ role: "user", content: "hi" }], canvasId: "canvas-1", message: "hi", reply: "ok" };
const request = () => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  canvasRow.mockResolvedValue({ data: { org_id: "org-1", client_id: "client-1", source_script_id: "script-1" }, error: null });
});
import { POST } from "./route";

describe("POST /api/copilot/references cost record", () => {
  it("records the call once, with only OpenAI's usage as raw", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ referencedNodes: [] }) } }], usage });
    expect((await POST(request())).status).toBe(200);
    expect(recordProviderCost).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0]).toMatchObject(expected);
    expect(vi.mocked(recordProviderCost).mock.calls[0][0].raw).toStrictEqual(usage);
  });

  it("records nothing when OpenAI fails", async () => {
    create.mockRejectedValue(new Error("rate limited"));
    expect((await POST(request())).status).toBe(500);
    expect(recordProviderCost).not.toHaveBeenCalled();
  });
});
