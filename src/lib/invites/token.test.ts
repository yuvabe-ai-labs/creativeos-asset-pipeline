import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inviteLink, newInviteToken } from "./token";

describe("invite tokens", () => {
  beforeEach(() => { process.env.APP_URL = "https://app.example"; });

  it("is 32 random bytes, base64url, new each time", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("links to the sign-up page", () => {
    expect(inviteLink("abc")).toBe("https://app.example/invite/abc");
  });

  it("falls back to the path when APP_URL is not set, so the invite still works on this site", () => {
    delete process.env.APP_URL;
    expect(inviteLink("abc")).toBe("/invite/abc");
  });
});
