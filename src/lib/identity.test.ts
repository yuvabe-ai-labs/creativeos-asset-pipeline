import { describe, it, expect } from "vitest";
import { parseIdentity, serializeIdentity } from "./identity";

describe("parseIdentity", () => {
  it("returns null for null / empty / garbage", () => {
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity("")).toBeNull();
    expect(parseIdentity("not-json")).toBeNull();
  });

  it("returns null when role is invalid or name is blank", () => {
    expect(parseIdentity(JSON.stringify({ name: "Asha", role: "boss" }))).toBeNull();
    expect(parseIdentity(JSON.stringify({ name: "  ", role: "senior" }))).toBeNull();
  });

  it("parses a valid identity and trims the name", () => {
    expect(parseIdentity(JSON.stringify({ name: " Asha ", role: "senior" })))
      .toEqual({ name: "Asha", role: "senior" });
  });

  it("round-trips through serializeIdentity", () => {
    const id = { name: "Ravi", role: "designer" as const };
    expect(parseIdentity(serializeIdentity(id))).toEqual(id);
  });
});
