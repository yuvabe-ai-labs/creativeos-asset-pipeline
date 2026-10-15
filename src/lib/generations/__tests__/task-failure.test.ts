import { describe, it, expect } from "vitest";
import { PaidResultError, isFinalAttempt } from "../task-failure";

describe("isFinalAttempt", () => {
  it("is not final on an earlier attempt, so the failure is retried without being reported", () => {
    expect(isFinalAttempt(1, 2, new Error("provider 500"))).toBe(false);
  });

  it("is final on the last configured attempt", () => {
    expect(isFinalAttempt(2, 2, new Error("provider 500"))).toBe(true);
  });

  it("is always final once the provider has returned a paid result", () => {
    expect(isFinalAttempt(1, 2, new PaidResultError("webhook unreachable"))).toBe(true);
  });
});
