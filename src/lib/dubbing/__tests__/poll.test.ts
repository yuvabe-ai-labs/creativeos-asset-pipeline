import { describe, it, expect } from "vitest";
import { DubbingFinalError, finalUserMessage } from "../poll";

describe("finalUserMessage", () => {
  it("uses the message of a DubbingFinalError instance", () => {
    expect(finalUserMessage(new DubbingFinalError("Final copy", "detail"), "fallback")).toBe("Final copy");
  });
  it("uses the message of a serialized error that only kept its name", () => {
    expect(finalUserMessage({ name: "DubbingFinalError", userMessage: "Serialized copy" }, "fallback")).toBe("Serialized copy");
  });
  it("falls back for an unknown error", () => {
    expect(finalUserMessage(new Error("boom"), "fallback")).toBe("fallback");
    expect(finalUserMessage({ name: "DubbingFinalError" }, "fallback")).toBe("fallback");
    expect(finalUserMessage(undefined, "fallback")).toBe("fallback");
  });
});
