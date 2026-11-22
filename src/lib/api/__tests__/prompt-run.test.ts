import { describe, it, expect, vi, beforeEach } from "vitest";

const insertVersion = vi.fn();
const setActiveVersion = vi.fn();
const insertGeneration = vi.fn();
const succeedGeneration = vi.fn();
const failGeneration = vi.fn();
const reserveCredits = vi.fn();
const settleGeneration = vi.fn();
const refundReservation = vi.fn();

vi.mock("@/lib/db/versions", () => ({
  insertVersion: (...args: unknown[]) => insertVersion(...args),
  setActiveVersion: (...args: unknown[]) => setActiveVersion(...args),
}));

vi.mock("@/lib/db/generations", () => ({
  insertGeneration: (...args: unknown[]) => insertGeneration(...args),
  succeedGeneration: (...args: unknown[]) => succeedGeneration(...args),
  failGeneration: (...args: unknown[]) => failGeneration(...args),
}));

vi.mock("@/lib/db/credit-transactions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/credit-transactions")>(
    "@/lib/db/credit-transactions",
  );
  return {
    ...actual,
    reserveCredits: (...args: unknown[]) => reserveCredits(...args),
    settleGeneration: (...args: unknown[]) => settleGeneration(...args),
    refundReservation: (...args: unknown[]) => refundReservation(...args),
  };
});

vi.mock("@/lib/ai-models/run-price", async () => {
  const { seededPrice } = await import("@/lib/ai-models/test-prices");
  class NoPriceError extends Error {}
  return {
    NoPriceError,
    NO_PRICE_MESSAGE: "This model has no price set, so it can't run right now.",
    priceForNewRun: vi.fn(async (modelId: string) => {
      try { return seededPrice(modelId); } catch { return null; }
    }),
  };
});

// Imported AFTER the mocks above so the module under test picks them up.
const { runPromptGeneration } = await import("../prompt-run");
const { CreditLimitError } = await import("@/lib/db/credit-transactions");
const { priceForNewRun, NoPriceError } = await import("@/lib/ai-models/run-price");
const { PROMPT_MODEL_ID } = await import("@/lib/ai-models/service-models");
const { seededPrice } = await import("@/lib/ai-models/test-prices");
const { promptFlatCredits, promptCharge } = await import("@/lib/ai-models/service-price");

function baseArgs(call: () => Promise<{ output: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null }>) {
  return {
    nodeId: "node-1",
    orgId: "org-1",
    clientId: "client-1",
    userId: "user-1",
    userEmail: "maker@example.com",
    operatorUserId: "user-1",
    type: "prompt" as const,
    model: PROMPT_MODEL_ID,
    attachmentCount: 0,
    generationParamsSnapshot: { model: "gpt-4o-mini" },
    generationInputsSnapshot: { instruction: "do a thing" },
    inputsUsed: { upstream: [] },
    paramsUsed: { instruction: "do a thing" },
    call,
  };
}

// The reservation must be released on BOTH paths. A helper that refunds only on success turns
// every model error into silently burnt credits — which is the failure mode this extraction
// exists to stop happening twice.
describe("runPromptGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("settles the reservation and writes a version when the call succeeds", async () => {
    insertGeneration.mockResolvedValue({ id: "gen-1" });
    reserveCredits.mockResolvedValue({ ok: true });
    insertVersion.mockResolvedValue({ id: "version-1" });
    setActiveVersion.mockResolvedValue(undefined);
    settleGeneration.mockResolvedValue(undefined);
    succeedGeneration.mockResolvedValue(undefined);

    const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const call = vi.fn().mockResolvedValue({ output: "hello", usage });

    const result = await runPromptGeneration(baseArgs(call));

    expect(result).toEqual({ output: "hello", versionId: "version-1", generationId: "gen-1", usage });

    expect(insertGeneration).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledWith("org-1", "gen-1", 5);
    expect(call).toHaveBeenCalledTimes(1);
    expect(insertVersion).toHaveBeenCalledTimes(1);
    expect(setActiveVersion).toHaveBeenCalledWith("node-1", "version-1");
    expect(settleGeneration).toHaveBeenCalledWith({
      orgId: "org-1",
      generationId: "gen-1",
      actualAmount: 5,
    });
    expect(succeedGeneration).toHaveBeenCalledTimes(1);
    expect(refundReservation).not.toHaveBeenCalled();
    expect(failGeneration).not.toHaveBeenCalled();
  });

  // D536 — prompt runs keep a flat price from the row; the real token cost is only recorded.
  describe("flat price from the row", () => {
    const row = seededPrice(PROMPT_MODEL_ID);
    const usage = { prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766, prompt_tokens_details: { cached_tokens: 3968 } };

    function ok() {
      insertGeneration.mockResolvedValue({ id: "gen-p" });
      reserveCredits.mockResolvedValue({ ok: true });
      insertVersion.mockResolvedValue({ id: "version-p" });
      setActiveVersion.mockResolvedValue(undefined);
      settleGeneration.mockResolvedValue(undefined);
      succeedGeneration.mockResolvedValue(undefined);
    }

    it("reserves the row's flat price and records the row", async () => {
      ok();
      const call = vi.fn().mockResolvedValue({ output: "x", usage: null });
      await runPromptGeneration({ ...baseArgs(call), attachmentCount: 2 });
      expect(promptFlatCredits(row, 2)).toBe(10);
      expect(reserveCredits).toHaveBeenCalledWith("org-1", "gen-p", 10);
      expect(insertGeneration.mock.calls[0][0]).toMatchObject({ modelPriceId: row.id });
    });

    it("settles the flat price, records the token cost and the bill", async () => {
      ok();
      const call = vi.fn().mockResolvedValue({ output: "x", usage });
      await runPromptGeneration({ ...baseArgs(call), attachmentCount: 2 });
      const charge = promptCharge(row, usage, 2)!;
      expect(settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-p", actualAmount: 10 });
      const done = succeedGeneration.mock.calls[0][0];
      expect(done.creditsCharged).toBe(10);
      expect(done.costUsd).toBe(charge.recordedUsd);
      expect(done.costUsd).toBeGreaterThan(0);
      expect(done.providerBill).toEqual({ ...charge.bill, raw: usage });
      expect(done.providerBill.source).toBe("provider_usage");
      expect(done.providerBill.raw).toEqual(usage);
    });

    it("with no usage settles the flat price and records a request bill, no cost", async () => {
      ok();
      const call = vi.fn().mockResolvedValue({ output: "x", usage: null });
      await runPromptGeneration({ ...baseArgs(call), attachmentCount: 1 });
      expect(settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-p", actualAmount: 7.5 });
      const done = succeedGeneration.mock.calls[0][0];
      expect(done.creditsCharged).toBe(7.5);
      expect(done.costUsd).toBeUndefined();
      expect(done.providerBill).toEqual({ source: "request", meters: { request: 1, input_image: 1 } });
    });

    it("refuses with NoPriceError before anything is recorded when the model has no price", async () => {
      vi.mocked(priceForNewRun).mockResolvedValueOnce(null);
      const call = vi.fn();
      await expect(runPromptGeneration(baseArgs(call))).rejects.toBeInstanceOf(NoPriceError);
      expect(insertGeneration).not.toHaveBeenCalled();
      expect(reserveCredits).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
    });
  });

  it("refunds the reservation and fails the generation when the call throws", async () => {
    insertGeneration.mockResolvedValue({ id: "gen-2" });
    reserveCredits.mockResolvedValue({ ok: true });
    failGeneration.mockResolvedValue(undefined);
    refundReservation.mockResolvedValue(undefined);

    const call = vi.fn().mockRejectedValue(new Error("model exploded"));

    await expect(runPromptGeneration(baseArgs(call))).rejects.toThrow("model exploded");

    expect(failGeneration).toHaveBeenCalledWith({ generationId: "gen-2", error: "model exploded" });
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-2" });
    expect(insertVersion).not.toHaveBeenCalled();
  });

  it("propagates a CreditLimitError when the reservation is rejected, refunding what little was reserved", async () => {
    insertGeneration.mockResolvedValue({ id: "gen-3" });
    reserveCredits.mockResolvedValue({ ok: false });
    failGeneration.mockResolvedValue(undefined);
    refundReservation.mockResolvedValue(undefined);

    const call = vi.fn();

    await expect(runPromptGeneration(baseArgs(call))).rejects.toBeInstanceOf(CreditLimitError);

    // insertGeneration necessarily runs before reserveCredits — reserveCredits needs the
    // generation's id to record the reservation against — so a rejected reservation still
    // leaves a generation row behind, now marked failed rather than left "running".
    expect(insertGeneration).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
    expect(insertVersion).not.toHaveBeenCalled();
    expect(failGeneration).toHaveBeenCalledWith({ generationId: "gen-3", error: "Monthly credit limit reached" });
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-3" });
  });

  // The pre-extraction route wrote its failed version, THEN failed the generation, THEN
  // refunded the reservation. onFailure is how a caller restores that order across the
  // extraction — assert the actual sequence, not just that all three ran.
  it("runs onFailure before failGeneration and refundReservation on the error path", async () => {
    insertGeneration.mockResolvedValue({ id: "gen-4" });
    reserveCredits.mockResolvedValue({ ok: true });

    const order: string[] = [];
    failGeneration.mockImplementation(async () => {
      order.push("failGeneration");
    });
    refundReservation.mockImplementation(async () => {
      order.push("refundReservation");
    });
    const onFailure = vi.fn(async () => {
      order.push("onFailure");
    });

    const call = vi.fn().mockRejectedValue(new Error("model exploded"));

    await expect(runPromptGeneration({ ...baseArgs(call), onFailure })).rejects.toThrow(
      "model exploded",
    );

    expect(order).toEqual(["onFailure", "failGeneration", "refundReservation"]);
  });

  // A route's onFailure write (e.g. its own insertVersion) failing must never swallow the
  // real error, and cleanup must still happen.
  it("still propagates the original error and still cleans up when onFailure itself throws", async () => {
    insertGeneration.mockResolvedValue({ id: "gen-5" });
    reserveCredits.mockResolvedValue({ ok: true });
    failGeneration.mockResolvedValue(undefined);
    refundReservation.mockResolvedValue(undefined);

    const onFailure = vi.fn().mockRejectedValue(new Error("onFailure exploded"));
    const call = vi.fn().mockRejectedValue(new Error("model exploded"));

    await expect(runPromptGeneration({ ...baseArgs(call), onFailure })).rejects.toThrow(
      "model exploded",
    );

    expect(failGeneration).toHaveBeenCalledWith({ generationId: "gen-5", error: "model exploded" });
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen-5" });
  });
});
