import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type ImpersonationStateMockResult =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };

const { resolveImpersonationStateMock, resolveOrgIdMock, createCanvasMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(
    async (): Promise<ImpersonationStateMockResult> => ({ isImpersonating: false }),
  ),
  resolveOrgIdMock: vi.fn(async () => "yuvabe-org"),
  createCanvasMock: vi.fn(async (args: { clientId: string; orgId: string; name: string }) => ({
    id: "canvas-1",
    ...args,
  })),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: resolveImpersonationStateMock }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/dal", () => ({ resolveOrgId: resolveOrgIdMock }));
vi.mock("@/lib/db/canvases", () => ({
  createCanvas: createCanvasMock,
  renameCanvas: vi.fn(async () => undefined),
  deleteCanvas: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn(async () => null) }));
vi.mock("@/lib/db/nodes", () => ({ saveCanvasNodes: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/edges", () => ({ saveCanvasEdges: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCanvasAction } from "./canvases";

describe("createCanvasAction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates the canvas under the effective org (resolveOrgId), not the caller's own org", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    resolveOrgIdMock.mockResolvedValue("target-org");
    await createCanvasAction({ clientId: "client-1", clientSlug: "acme", name: "Reel 1" });
    expect(createCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1", orgId: "target-org" }),
    );
  });

  it("blocks the write while impersonating non-elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true,
      operatorId: "op-1",
      targetOrgId: "target-org",
      elevated: false,
    });
    await expect(
      createCanvasAction({ clientId: "client-1", clientSlug: "acme", name: "Reel 1" }),
    ).rejects.toThrow("Read-only while impersonating");
    expect(createCanvasMock).not.toHaveBeenCalled();
  });
});
