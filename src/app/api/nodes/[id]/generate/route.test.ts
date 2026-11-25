import { describe, it, expect, vi, beforeEach } from "vitest";
import { NO_PRICE_MESSAGE } from "@/lib/ai-models/run-price";

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
  resolvePromptInputs: vi.fn(async () => ({ clientContext: "", kbVersionId: null, slices: [], upstream: [] })),
}));
vi.mock("@/lib/ai-models/run-price", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai-models/run-price")>("@/lib/ai-models/run-price").catch(() => ({}));
  return {
    ...actual,
    NO_PRICE_MESSAGE: "This model has no price set, so it can't run right now.",
    priceForNewRun: vi.fn(),
  };
});
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn() }));
vi.mock("@/lib/db/versions", () => ({ insertVersion: vi.fn(), setActiveVersion: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: vi.fn(),
  settleGeneration: vi.fn(),
  refundReservation: vi.fn(),
  CreditLimitError: class extends Error {},
}));
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({}) }));

import { POST } from "./route";
import { priceForNewRun } from "@/lib/ai-models/run-price";
import { insertGeneration } from "@/lib/db/generations";
import { reserveCredits } from "@/lib/db/credit-transactions";

beforeEach(() => vi.clearAllMocks());

describe("POST generate", () => {
  it("409s before anything is recorded when the model has no price row", async () => {
    vi.mocked(priceForNewRun).mockResolvedValueOnce(null);
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "node-1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(NO_PRICE_MESSAGE);
    expect(insertGeneration).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });
});
