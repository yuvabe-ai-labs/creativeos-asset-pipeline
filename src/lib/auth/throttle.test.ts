import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { takeResetCooldown, resetCooldownsForTest } from "./throttle";

describe("takeResetCooldown (D598)", () => {
  beforeEach(() => resetCooldownsForTest());

  it("allows one email, then waits out the cooldown", () => {
    expect(takeResetCooldown("asha@example.com", 60_000, 0)).toBe(true);
    expect(takeResetCooldown("asha@example.com", 60_000, 59_999)).toBe(false);
    expect(takeResetCooldown("asha@example.com", 60_000, 60_000)).toBe(true);
  });

  it("treats case and spacing as one address, and keeps addresses apart", () => {
    expect(takeResetCooldown(" Asha@Example.com ", 60_000, 0)).toBe(true);
    expect(takeResetCooldown("asha@example.com", 60_000, 1)).toBe(false);
    expect(takeResetCooldown("ravi@example.com", 60_000, 1)).toBe(true);
  });
});
