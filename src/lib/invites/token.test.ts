import { describe, it, expect, beforeEach } from "vitest";

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
});
