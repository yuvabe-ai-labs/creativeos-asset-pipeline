import { describe, it, expect } from "vitest";
import {
  applySessionPersistence,
  rememberCookieValue,
  shouldPersistSession,
} from "@/lib/auth/session-persistence";

describe("shouldPersistSession", () => {
  it("persists when the cookie is absent — the pre-feature behaviour", () => {
    // Every session was persistent before "remember me" existed. An unset preference
    // must not start dropping people at browser close.
    expect(shouldPersistSession(undefined)).toBe(true);
  });

  it("persists for '1' and drops the session only for an explicit '0'", () => {
    expect(shouldPersistSession("1")).toBe(true);
    expect(shouldPersistSession("0")).toBe(false);
  });

  it("persists for junk values rather than logging the user out", () => {
    expect(shouldPersistSession("")).toBe(true);
    expect(shouldPersistSession("false")).toBe(true);
  });
});

describe("rememberCookieValue", () => {
  it("round-trips through shouldPersistSession", () => {
    for (const persist of [true, false]) {
      expect(shouldPersistSession(rememberCookieValue(persist))).toBe(persist);
    }
  });
});

describe("applySessionPersistence", () => {
  const options = {
    maxAge: 34560000,
    expires: new Date("2027-01-01"),
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
  };

  it("passes options through untouched when persisting", () => {
    expect(applySessionPersistence(options, true)).toEqual(options);
  });

  it("strips BOTH maxAge and expires when not persisting", () => {
    // Either one alone would still outlive the browser session.
    const result = applySessionPersistence(options, false);
    expect(result).not.toHaveProperty("maxAge");
    expect(result).not.toHaveProperty("expires");
  });

  it("keeps every other option when not persisting", () => {
    // Dropping path/httpOnly/sameSite would break or downgrade the auth cookie.
    expect(applySessionPersistence(options, false)).toEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
  });

  it("tolerates undefined options", () => {
    expect(applySessionPersistence(undefined, false)).toEqual({});
    expect(applySessionPersistence(undefined, true)).toEqual({});
  });
});
