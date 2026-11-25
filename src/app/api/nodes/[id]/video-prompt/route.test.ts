import { describe, it, expect, vi, beforeEach } from "vitest";
import { NO_PRICE_MESSAGE, NoPriceError } from "@/lib/ai-models/run-price";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withNode: (_req: Request, _params: unknown, _guard: unknown, fn: (...a: unknown[]) => Promise<Response>) =>
      fn("node-1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});
vi.mock("@/lib/nodes/resolve-inputs", () => ({
  resolveVideoPromptInputs: vi.fn(async () => ({ clientContext: "", kbVersionId: null, slices: [], upstream: [] })),
}));
vi.mock("@/lib/db/versions", () => ({ insertVersion: vi.fn() }));
const runPromptGeneration = vi.fn();
vi.mock("@/lib/api/prompt-run", () => ({
  runPromptGeneration: (a: unknown) => runPromptGeneration(a),
  CreditLimitError: class extends Error {},
}));
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({}) }));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST video-prompt", () => {
  it("hands the run the attachment count, not a credit estimate", async () => {
    runPromptGeneration.mockResolvedValueOnce({ output: "x", versionId: "v1" });
    await POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "node-1" }) });
    const args = runPromptGeneration.mock.calls[0][0];
    expect(args.attachmentCount).toBe(0);
    expect(args).not.toHaveProperty("estimatedCredits");
  });

  it("409s with the no-price message when the model has no price row", async () => {
    runPromptGeneration.mockRejectedValueOnce(new NoPriceError(NO_PRICE_MESSAGE));
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "node-1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(NO_PRICE_MESSAGE);
  });
});
