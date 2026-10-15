import { describe, it, expect } from "vitest";
import { startErrorMessage } from "../node-generation";
import { ApiError } from "@/services/read-json";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

describe("startErrorMessage", () => {
  it("names the credit limit for a 402", () => {
    expect(startErrorMessage(new ApiError("Monthly credit limit reached", 402), "Generation failed")).toBe(
      CREDIT_LIMIT_TOAST_MESSAGE,
    );
  });

  it("passes the server's message through otherwise", () => {
    expect(startErrorMessage(new ApiError("This node is already generating.", 409), "Generation failed")).toBe(
      "This node is already generating.",
    );
  });

  it("falls back for something that is not an error", () => {
    expect(startErrorMessage("boom", "Edit failed")).toBe("Edit failed");
  });
});
