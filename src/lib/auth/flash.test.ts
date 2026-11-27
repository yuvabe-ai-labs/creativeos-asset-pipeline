import { describe, it, expect } from "vitest";
import { flashMessage } from "./flash";

describe("flashMessage (D598)", () => {
  it("shows the password-set message after a reset", () => {
    expect(flashMessage("password-set")).toBe("Your password is set.");
  });

  it("shows nothing for an unknown or missing value", () => {
    expect(flashMessage("<script>")).toBeNull();
    expect(flashMessage("toString")).toBeNull();
    expect(flashMessage(undefined)).toBeNull();
  });
});
