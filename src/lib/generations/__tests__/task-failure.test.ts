import { describe, it, expect } from "vitest";
import { ModelUnavailableError, PaidResultError, isFinalAttempt } from "../task-failure";
import { ModelUnavailableError as FromRunnable } from "@/lib/ai-models/runnable";

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

  it("ends the run on a missing model", () => {
    expect(isFinalAttempt(1, 3, new ModelUnavailableError("x"))).toBe(true);
  });

  it("is one class wherever it is imported from", () => {
    expect(FromRunnable).toBe(ModelUnavailableError);
    expect(new ModelUnavailableError("m").name).toBe("ModelUnavailableError");
  });
});
