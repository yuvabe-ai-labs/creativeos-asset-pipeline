import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/canvas-lock", () => ({
  acquireCanvasLock: vi.fn(async () => ({ granted: true })),
  heartbeatCanvasLock: vi.fn(async () => undefined),
  releaseCanvasLock: vi.fn(async () => undefined),
  getCanvasLock: vi.fn(async () => null),
}));

import { acquireCanvasLockAction } from "./canvas-lock";

describe("acquireCanvasLockAction", () => {
  it("is not gated by impersonation state — no @/lib/auth/impersonation import needed to call it", async () => {
    // No resolveImpersonationState mock is registered at all; if this action were
    // wrapped in withAction(), calling it would throw "Cannot find module" or a
    // resolution error for the unmocked import, since withAction() imports
    // resolveImpersonationState internally. Success here proves the exemption holds.
    await expect(acquireCanvasLockAction("canvas-1", "session-1", "Op")).resolves.toEqual({ granted: true });
  });
});
