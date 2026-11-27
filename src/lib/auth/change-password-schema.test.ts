import { describe, it, expect } from "vitest";
import { ChangePasswordSchema, NewPasswordField } from "./change-password-schema";
import { ResetPasswordSchema } from "./password-reset-schema";
import { AcceptInviteSchema } from "@/lib/people/schema";

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

describe("the shared new-password rule (D598)", () => {
  it("refuses more than 72 characters, the most the sign-in service uses", () => {
    const long = "a".repeat(73);
    expect(NewPasswordField.safeParse("a".repeat(72)).success).toBe(true);
    expect(NewPasswordField.safeParse(long).success).toBe(false);
    expect(ChangePasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(false);
  });

  it("says plainly when the confirmation doesn't match, on the confirm field", () => {
    const result = ChangePasswordSchema.safeParse({ password: "goodpass123", confirmPassword: "goodpass124" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ message: "Passwords don't match.", path: ["confirmPassword"] });
  });

  it("is the same rule on invite sign-up and the reset link", () => {
    const short = { password: "short1", confirmPassword: "short1" };
    expect(ResetPasswordSchema.safeParse(short).error?.issues[0]?.message).toBe("Password must be at least 8 characters.");
    expect(AcceptInviteSchema.safeParse({ name: "Ravi", ...short }).error?.issues[0]?.message).toBe("Password must be at least 8 characters.");
    expect(AcceptInviteSchema.safeParse({ name: "Ravi", password: "goodpass123", confirmPassword: "nope12345" }).error?.issues[0]?.message).toBe("Passwords don't match.");
    expect(ResetPasswordSchema.safeParse({ password: "goodpass123", confirmPassword: "nope12345" }).error?.issues[0]?.message).toBe("Passwords don't match.");
    expect(ResetPasswordSchema.safeParse({ password: "goodpass123", confirmPassword: "goodpass123" }).success).toBe(true);
  });
});
