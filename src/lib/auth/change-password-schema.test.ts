import { describe, it, expect } from "vitest";
import { ChangePasswordSchema } from "./change-password-schema";

describe("ChangePasswordSchema", () => {
  it("accepts a valid 8+ char password with a matching confirmation", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "goodpass123",
      confirmPassword: "goodpass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "short1",
      confirmPassword: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when password and confirmPassword don't match", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "goodpass123",
      confirmPassword: "differentpass123",
    });
    expect(result.success).toBe(false);
  });
});
