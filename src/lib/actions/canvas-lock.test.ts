import { describe, it, expect, vi, beforeEach } from "vitest";

type ImpersonationStateMockResult =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };

const {
  resolveImpersonationStateMock,
  acquireCanvasLockMock,
  getCanvasLockMock,
  checkActionAccessMock,
  heartbeatCanvasLockMock,
  releaseCanvasLockMock,
} = vi.hoisted(() => ({
  checkActionAccessMock: vi.fn(async (): Promise<unknown> => ({})),
  heartbeatCanvasLockMock: vi.fn(async () => undefined),
  releaseCanvasLockMock: vi.fn(async () => undefined),
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
vi.mock("@/lib/permissions/action-guard", () => ({ checkActionAccess: checkActionAccessMock }));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/canvas-lock", () => ({
  acquireCanvasLock: acquireCanvasLockMock,
  heartbeatCanvasLock: heartbeatCanvasLockMock,
  releaseCanvasLock: releaseCanvasLockMock,
  getCanvasLock: getCanvasLockMock,
}));

import {
  acquireCanvasLockAction,
  heartbeatCanvasLockAction,
  releaseCanvasLockAction,
  getCanvasLockAction,
} from "./canvas-lock";

function resetMocks() {
  resolveImpersonationStateMock.mockReset().mockResolvedValue({ isImpersonating: false });
  acquireCanvasLockMock.mockReset().mockResolvedValue({ ok: true });
  getCanvasLockMock.mockReset().mockResolvedValue({ heldBy: null, heartbeatAt: null });
  checkActionAccessMock.mockReset().mockResolvedValue({ impersonation: { isImpersonating: false } });
  heartbeatCanvasLockMock.mockClear();
  releaseCanvasLockMock.mockClear();
}

// The guard resolves the impersonation state with the caller; the action reads it from there.
function guardResolves(impersonation: ImpersonationStateMockResult) {
  checkActionAccessMock.mockResolvedValue({ impersonation });
}

describe("lock actions declare their permission", () => {
  beforeEach(resetMocks);

  it("acquire and heartbeat need canvases.edit on the canvas", async () => {
    await acquireCanvasLockAction("canvas-1", "s1", "Op");
    expect(checkActionAccessMock).toHaveBeenLastCalledWith({ need: "edit", on: { canvasId: "canvas-1" } });
    await heartbeatCanvasLockAction("canvas-1", "s1");
    expect(checkActionAccessMock).toHaveBeenLastCalledWith({ need: "edit", on: { canvasId: "canvas-1" } });
  });

  it("release and get need canvases.view on the canvas", async () => {
    await releaseCanvasLockAction("canvas-1", "s1");
    expect(checkActionAccessMock).toHaveBeenLastCalledWith({ need: "view", on: { canvasId: "canvas-1" } });
    await getCanvasLockAction("canvas-1");
    expect(checkActionAccessMock).toHaveBeenLastCalledWith({ need: "view", on: { canvasId: "canvas-1" } });
  });

  it("acquire does not write the lock when the guard rejects", async () => {
    checkActionAccessMock.mockRejectedValue(new Error("Not found."));
    await expect(acquireCanvasLockAction("canvas-1", "s1", "Op")).rejects.toThrow("Not found.");
    expect(acquireCanvasLockMock).not.toHaveBeenCalled();
  });
});

describe("acquireCanvasLockAction", () => {
  beforeEach(resetMocks);

  it("does not acquire the lock while impersonating read-only (returns the current lock state instead)", async () => {
    guardResolves({
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
    // `reason` distinguishes this from an ordinary "someone else holds it" denial, so
    // the client can say why Take-over did nothing instead of failing silently.
    expect(result).toEqual({
      ok: false,
      reason: "read-only",
      heldBy: { name: "Real Customer User" },
    });
  });

  it("does not acquire the lock while impersonating read-only when nobody currently holds it", async () => {
    guardResolves({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: false,
    });
    getCanvasLockMock.mockResolvedValue({ heldBy: null, heartbeatAt: null });

    const result = await acquireCanvasLockAction("canvas-1", "session-1", "Operator");

    expect(acquireCanvasLockMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      reason: "read-only",
      heldBy: { name: null },
    });
  });

  it("still acquires the lock normally when not impersonating", async () => {
    guardResolves({ isImpersonating: false });
    acquireCanvasLockMock.mockResolvedValue({ ok: true });

    const result = await acquireCanvasLockAction("canvas-1", "session-1", "Operator");

    expect(acquireCanvasLockMock).toHaveBeenCalledWith("canvas-1", "session-1", "Operator");
    expect(getCanvasLockMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("still acquires the lock when impersonating elevated", async () => {
    guardResolves({
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

  it("reads the impersonation state once, through the guard", async () => {
    await acquireCanvasLockAction("canvas-1", "session-1", "Operator");
    expect(checkActionAccessMock).toHaveBeenCalledTimes(1);
    expect(resolveImpersonationStateMock).not.toHaveBeenCalled();
  });
});
