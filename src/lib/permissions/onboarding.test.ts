import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const { redirectMock, resolveOrNullMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
  resolveOrNullMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock, unstable_rethrow: vi.fn() }));
vi.mock("./server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./server")>()),
  resolveActingCallerOrNull: resolveOrNullMock,
}));

import { sendWaitingToOnboarding, sendWaitingToOnboardingOn } from "./onboarding";
import { testAccess, testOwnerAccess } from "./test-fixtures";
import type { Access } from "./model";

const acting = (access: Access) => ({ caller: { userId: "u1", orgId: "org-1", access }, effectiveOrgId: "org-1", impersonation: { isImpersonating: false as const } });
const waiting = () => acting(testAccess({ permissions: [], clientIds: [] }));

describe("sendWaitingToOnboarding (spec §2.4)", () => {
  it("sends someone signed up and waiting to /onboarding", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: ["c1"], accessGiven: false })) as never)).toThrow("REDIRECT /onboarding");
  });

  it("sends a member on no client to /onboarding", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: [] })) as never)).toThrow("REDIRECT /onboarding");
  });

  it("lets a member with a client, and the owner with none, through", () => {
    expect(() => sendWaitingToOnboarding(acting(testAccess({ permissions: [], clientIds: ["c1"] })) as never)).not.toThrow();
    expect(() => sendWaitingToOnboarding(acting(testOwnerAccess()) as never)).not.toThrow();
  });
});

describe("sendWaitingToOnboardingOn (the root layout, spec §4.4)", () => {
  beforeEach(() => { resolveOrNullMock.mockReset(); });

  it("sends a waiting person to /onboarding from any app page", async () => {
    resolveOrNullMock.mockResolvedValue(waiting());
    await expect(sendWaitingToOnboardingOn("/team")).rejects.toThrow("REDIRECT /onboarding");
    await expect(sendWaitingToOnboardingOn("/clients/c1")).rejects.toThrow("REDIRECT /onboarding");
  });

  it("leaves onboarding, invites and APIs alone", async () => {
    resolveOrNullMock.mockResolvedValue(waiting());
    await expect(sendWaitingToOnboardingOn("/onboarding")).resolves.toBeUndefined();
    await expect(sendWaitingToOnboardingOn("/invite/t")).resolves.toBeUndefined();
  });

  it("does not read the caller when the path is unknown (pages the proxy skips)", async () => {
    await expect(sendWaitingToOnboardingOn(null)).resolves.toBeUndefined();
    expect(resolveOrNullMock).not.toHaveBeenCalled();
  });

  it("lets the owner, a member on a client and nobody signed in through", async () => {
    resolveOrNullMock.mockResolvedValueOnce(acting(testOwnerAccess()));
    await expect(sendWaitingToOnboardingOn("/team")).resolves.toBeUndefined();
    resolveOrNullMock.mockResolvedValueOnce(acting(testAccess({ permissions: [], clientIds: ["c1"] })));
    await expect(sendWaitingToOnboardingOn("/team")).resolves.toBeUndefined();
    resolveOrNullMock.mockResolvedValueOnce(null);
    await expect(sendWaitingToOnboardingOn("/team")).resolves.toBeUndefined();
  });

  it("never takes the page down when the access read fails", async () => {
    resolveOrNullMock.mockRejectedValue(new Error("db down"));
    await expect(sendWaitingToOnboardingOn("/team")).resolves.toBeUndefined();
  });
});
