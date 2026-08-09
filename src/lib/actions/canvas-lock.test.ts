import { describe, it, expect, vi, beforeEach } from "vitest";

type ImpersonationStateMockResult =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };

const {
  resolveImpersonationStateMock,
  acquireCanvasLockMock,
  getCanvasLockMock,
} = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(
    async (): Promise<ImpersonationStateMockResult> => ({ isImpersonating: false }),
  ),
  acquireCanvasLockMock: vi.fn(async () => ({ ok: true }) as const),
  getCanvasLockMock: vi.fn(
    async () => ({ heldBy: null, heartbeatAt: null }) as {
      heldBy: { name: string | null } | null;
      heartbeatAt: string | null;
    },
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/canvas-lock", () => ({
  acquireCanvasLock: acquireCanvasLockMock,
  heartbeatCanvasLock: vi.fn(async () => undefined),
  releaseCanvasLock: vi.fn(async () => undefined),
  getCanvasLock: getCanvasLockMock,
}));

import { acquireCanvasLockAction } from "./canvas-lock";

describe("acquireCanvasLockAction", () => {
  beforeEach(() => {
    resolveImpersonationStateMock.mockReset().mockResolvedValue({ isImpersonating: false });
    acquireCanvasLockMock.mockReset().mockResolvedValue({ ok: true });
    getCanvasLockMock.mockReset().mockResolvedValue({ heldBy: null, heartbeatAt: null });
  });

  it("does not acquire the lock while impersonating read-only (returns the current lock state instead)", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: false,
    });
    getCanvasLockMock.mockResolvedValue({
      heldBy: { name: "Real Customer User" },
      heartbeatAt: "2026-08-09T00:00:00.000Z",
    });

    const result = await acquireCanvasLockAction("canvas-1", "session-1", "Operator");

    expect(acquireCanvasLockMock).not.toHaveBeenCalled();
    expect(getCanvasLockMock).toHaveBeenCalledWith("canvas-1");
    expect(result).toEqual({ ok: false, heldBy: { name: "Real Customer User" } });
  });

  it("does not acquire the lock while impersonating read-only when nobody currently holds it", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: false,
    });
    getCanvasLockMock.mockResolvedValue({ heldBy: null, heartbeatAt: null });

    const result = await acquireCanvasLockAction("canvas-1", "session-1", "Operator");

    expect(acquireCanvasLockMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, heldBy: { name: null } });
  });

  it("still acquires the lock normally when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    acquireCanvasLockMock.mockResolvedValue({ ok: true });

    const result = await acquireCanvasLockAction("canvas-1", "session-1", "Operator");

    expect(acquireCanvasLockMock).toHaveBeenCalledWith("canvas-1", "session-1", "Operator");
    expect(getCanvasLockMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("still acquires the lock when impersonating elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: true,
    });
    acquireCanvasLockMock.mockResolvedValue({ ok: true });

    const result = await acquireCanvasLockAction("canvas-1", "session-1", "Operator");

    expect(acquireCanvasLockMock).toHaveBeenCalledWith("canvas-1", "session-1", "Operator");
    expect(getCanvasLockMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
