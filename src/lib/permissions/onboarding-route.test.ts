import { describe, expect, it, vi } from "vitest";
import { ONBOARDING_PATH, confirmAndSendToOnboarding, shouldSendToOnboarding } from "./onboarding-route";

describe("shouldSendToOnboarding (spec 4.4)", () => {
  it("sends a waiting person to onboarding from any app page", () => {
    for (const path of ["/", "/team", "/clients/c1", "/clients/c1/scripts/s1", "/eval/x", "/admin"]) {
      expect(shouldSendToOnboarding(path, true)).toBe(true);
    }
  });

  it("never sends someone who is not waiting (an owner, a member on a client, a super admin)", () => {
    for (const path of ["/", "/team", "/clients/c1", "/admin", "/admin/orgs/o1"]) {
      expect(shouldSendToOnboarding(path, false)).toBe(false);
    }
  });

  it("leaves onboarding itself, invites, sign-in, auth, the account pages and APIs alone", () => {
    for (const path of [
      ONBOARDING_PATH,
      "/onboarding/",
      "/invite/tok",
      "/login",
      "/auth/callback",
      "/account/password",
      "/api/me",
      "/api/clients/c1",
      "/r/tok",
      "/r/s/tok",
    ]) {
      expect(shouldSendToOnboarding(path, true)).toBe(false);
    }
  });

  it("matches whole path segments only", () => {
    expect(shouldSendToOnboarding("/apiary", true)).toBe(true);
    expect(shouldSendToOnboarding("/logins", true)).toBe(true);
    expect(shouldSendToOnboarding("/onboarding-extra", true)).toBe(true);
  });

  it("does nothing when the path is unknown", () => {
    expect(shouldSendToOnboarding(null, true)).toBe(false);
    expect(shouldSendToOnboarding("", true)).toBe(false);
  });
});

describe("confirmAndSendToOnboarding (soft navigations)", () => {
  it("acts on a fresh read: sends only when the person is still waiting", async () => {
    const go = vi.fn();
    await confirmAndSendToOnboarding("/team", true, async () => true, go);
    expect(go).toHaveBeenCalledOnce();
  });

  it("does not send when the fresh read says access was given (a cached payload went stale)", async () => {
    const go = vi.fn();
    await confirmAndSendToOnboarding("/", true, async () => false, go);
    expect(go).not.toHaveBeenCalled();
  });

  it("reads nothing for someone not waiting or on an open page", async () => {
    const read = vi.fn(async () => true);
    const go = vi.fn();
    await confirmAndSendToOnboarding("/team", false, read, go);
    await confirmAndSendToOnboarding("/onboarding", true, read, go);
    expect(read).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it("a failed read is never waiting", async () => {
    const go = vi.fn();
    await confirmAndSendToOnboarding("/team", true, async () => { throw new Error("offline"); }, go);
    expect(go).not.toHaveBeenCalled();
  });
});
