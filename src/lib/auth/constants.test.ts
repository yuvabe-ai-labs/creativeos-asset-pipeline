import { describe, it, expect, vi, beforeEach } from "vitest";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "./constants";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));

import { assertImpersonationWriteAllowed } from "@/lib/api/route-helpers";
import { withAction } from "@/lib/actions/with-action";

describe("IMPERSONATION_READ_ONLY_MESSAGE", () => {
  beforeEach(() => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "org-1",
      elevated: false,
    });
  });

  it("uses the new vocabulary, not the internal term", () => {
    expect(IMPERSONATION_READ_ONLY_MESSAGE).toContain("Enable editing");
    expect(IMPERSONATION_READ_ONLY_MESSAGE).not.toContain("elevated");
  });

  it("is the exact message the route-helper gate returns", async () => {
    const res = await assertImpersonationWriteAllowed(
      new Request("https://x.test/api/thing", { method: "POST" }),
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({
      error: IMPERSONATION_READ_ONLY_MESSAGE,
    });
  });

  it("is the exact message the server-action gate throws", async () => {
    await expect(withAction("someAction", async () => "done")).rejects.toThrow(
      IMPERSONATION_READ_ONLY_MESSAGE,
    );
  });
});
