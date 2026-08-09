import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock, logMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async (): Promise<
    { isImpersonating: false } | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean }
  > => ({ isImpersonating: false })),
  logMock: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: resolveImpersonationStateMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));

import { withAction } from "./with-action";

describe("withAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("runs the handler and returns its result when not impersonating", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", handler)).resolves.toBe("result");
    expect(handler).toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("throws before calling the handler when impersonating and not elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: false,
    });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", handler)).rejects.toThrow(
      "Read-only while impersonating",
    );
    expect(handler).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it("runs the handler and logs a write_action when impersonating and elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => "result");
    await expect(withAction("testAction", handler)).resolves.toBe("result");
    expect(logMock).toHaveBeenCalledWith({
      operatorId: "op-1",
      targetOrgId: "org-1",
      eventType: "write_action",
      detail: { action: "testAction" },
    });
  });

  it("does not log a write_action if the handler itself throws", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true,
    });
    const handler = vi.fn(async () => { throw new Error("db error"); });
    await expect(withAction("testAction", handler)).rejects.toThrow("db error");
    expect(logMock).not.toHaveBeenCalled();
  });
});
