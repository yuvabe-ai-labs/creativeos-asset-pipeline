import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Impersonation =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };

const { resolveImpersonationStateMock, logMock, checkActionAccessMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(),
  logMock: vi.fn(async () => undefined),
  checkActionAccessMock: vi.fn(),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: resolveImpersonationStateMock }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));
vi.mock("@/lib/permissions/action-guard", () => ({ checkActionAccess: checkActionAccessMock }));

import { withAction } from "./with-action";

// The guard resolves the caller and the impersonation state together; withAction gates on
// what the guard returns and never reads impersonation a second time.
function guardResolves(impersonation: Impersonation) {
  checkActionAccessMock.mockResolvedValue({ caller: { userId: "u1" }, effectiveOrgId: "org-1", target: null, impersonation });
}

describe("withAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guardResolves({ isImpersonating: false });
  });

  it("runs the handler and returns its result when not impersonating", async () => {
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", { custom: "test" }, handler)).resolves.toBe("result");
    expect(handler).toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("reads the impersonation state only through the guard", async () => {
    await withAction("testAction", { custom: "test" }, vi.fn(async () => "result"));
    expect(checkActionAccessMock).toHaveBeenCalledTimes(1);
    expect(resolveImpersonationStateMock).not.toHaveBeenCalled();
  });

  it("throws before calling the handler when impersonating and not elevated", async () => {
    guardResolves({ isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", { custom: "test" }, handler)).rejects.toThrow(
      "Read-only while impersonating",
    );
    expect(handler).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("runs the handler and logs a write_action when impersonating and elevated", async () => {
    guardResolves({ isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", { custom: "test" }, handler)).resolves.toBe("result");
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "org-1",
      eventType: "write_action",
      detail: { action: "testAction" },
    });
  });

  it("does not log a write_action if the handler itself throws", async () => {
    guardResolves({ isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true });
    const handler = vi.fn(async () => { throw new Error("db error"); });
    await expect(withAction("testAction", { custom: "test" }, handler)).rejects.toThrow("db error");
    expect(logMock).not.toHaveBeenCalled();
  });

  it("stops before the handler when the guard refuses", async () => {
    checkActionAccessMock.mockRejectedValue(new Error("Not found."));
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", { need: "canvases.edit", on: { canvasId: "cv-1" } }, handler)).rejects.toThrow("Not found.");
    expect(handler).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });
});
