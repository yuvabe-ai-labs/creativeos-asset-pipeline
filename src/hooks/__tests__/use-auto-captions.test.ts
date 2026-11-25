import { describe, it, expect } from "vitest";
import { startErrorMessage } from "../use-auto-captions";
import { ApiError } from "@/services/read-json";
import { NO_PRICE_MESSAGE, NO_PRICE_REASON } from "@/lib/ai-models/service-models";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

// The captions route answers 409 for two reasons: no price row, and a run already holding the lock.
describe("startErrorMessage", () => {
  it("says there is no price only when the server said so", () => {
    expect(startErrorMessage(new ApiError(NO_PRICE_MESSAGE, 409))).toBe(NO_PRICE_REASON);
  });
  it("shows the server's own plain message for another 409", () => {
    expect(startErrorMessage(new ApiError("Captions are already being written for this reel.", 409)))
      .toBe("Captions are already being written for this reel.");
  });
  it("keeps the credit limit and the generic failure", () => {
    expect(startErrorMessage(new ApiError("Monthly credit limit reached", 402))).toBe(CREDIT_LIMIT_TOAST_MESSAGE);
    expect(startErrorMessage(new Error("network"))).toBe("Couldn't start captions. Try again.");
  });
});
