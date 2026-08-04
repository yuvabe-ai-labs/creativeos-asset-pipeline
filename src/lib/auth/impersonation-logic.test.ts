import { describe, it, expect } from "vitest";
import { encodeImpersonationCookie, decodeImpersonationCookie } from "./impersonation-logic";

const SECRET = "test-secret-do-not-use-in-prod";
const NOW = new Date("2026-08-04T12:00:00.000Z");

const PAYLOAD = {
  operatorId: "op-1",
  targetOrgId: "org-2",
  elevated: false,
  expiresAt: new Date("2026-08-04T14:00:00.000Z").toISOString(), // +2h
};

describe("encodeImpersonationCookie / decodeImpersonationCookie", () => {
  it("round-trips a valid payload", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    expect(decodeImpersonationCookie(cookie, SECRET, NOW)).toEqual(PAYLOAD);
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    const [body] = cookie.split(".");
    const tampered = `${body}.0000000000000000000000000000000000000000000000000000000000000000`;
    expect(decodeImpersonationCookie(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects a payload signed with a different secret", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, "a-different-secret");
    expect(decodeImpersonationCookie(cookie, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired payload", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    const afterExpiry = new Date("2026-08-04T14:00:01.000Z");
    expect(decodeImpersonationCookie(cookie, SECRET, afterExpiry)).toBeNull();
  });

  it("accepts a payload exactly at its expiry instant", () => {
    const cookie = encodeImpersonationCookie(PAYLOAD, SECRET);
    const atExpiry = new Date(PAYLOAD.expiresAt);
    expect(decodeImpersonationCookie(cookie, SECRET, atExpiry)).toEqual(PAYLOAD);
  });

  it("rejects malformed cookie values", () => {
    expect(decodeImpersonationCookie("not-a-valid-cookie", SECRET, NOW)).toBeNull();
    expect(decodeImpersonationCookie("", SECRET, NOW)).toBeNull();
    expect(decodeImpersonationCookie("onlyonepart", SECRET, NOW)).toBeNull();
  });

  it("rejects a well-signed payload with the wrong shape", () => {
    // Signed correctly, but the JSON isn't an ImpersonationPayload (e.g. missing fields).
    const badPayload = { foo: "bar" };
    const cookie = encodeImpersonationCookie(badPayload as never, SECRET);
    expect(decodeImpersonationCookie(cookie, SECRET, NOW)).toBeNull();
  });
});
