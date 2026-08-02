import { describe, it, expect } from "vitest";
import { LoginSchema } from "./login-schema";

describe("LoginSchema", () => {
  it("accepts a valid email + password", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(LoginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("rejects an empty password", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});
