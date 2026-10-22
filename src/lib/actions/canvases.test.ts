import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type ImpersonationStateMockResult =
  | { isImpersonating: false }
  | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean };

const { resolveImpersonationStateMock, resolveOrgIdMock, createCanvasMock, getScriptCanvasMock, getScriptMock, getClientByIdMock } = vi.hoisted(() => ({
  getClientByIdMock: vi.fn(async (): Promise<unknown> => null),
  getScriptCanvasMock: vi.fn(async (): Promise<unknown> => null),
  getScriptMock: vi.fn(async (): Promise<unknown> => null),
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
  getScriptCanvas: getScriptCanvasMock,
}));
vi.mock("@/lib/db/scripts", () => ({ getScript: getScriptMock }));
vi.mock("@/lib/db/clients", () => ({ getClientById: getClientByIdMock }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn(async () => null) }));
vi.mock("@/lib/db/nodes", () => ({ saveCanvasNodes: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/edges", () => ({ saveCanvasEdges: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCanvasAction, createCanvasFromScriptAction } from "./canvases";

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

describe("createCanvasFromScriptAction", () => {
  const approved = { id: "script-1", clientId: "client-1", stage: "approved" };
  const input = { clientId: "client-1", clientSlug: "acme", scriptId: "script-1", name: "Reel 12 · Golu starts today" };
  beforeEach(() => {
    vi.resetAllMocks();
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    resolveOrgIdMock.mockResolvedValue("org-1");
    getClientByIdMock.mockResolvedValue({ id: "client-1", org_id: "org-1" });
    getScriptMock.mockResolvedValue(approved);
    getScriptCanvasMock.mockResolvedValue(null);
    createCanvasMock.mockImplementation(async (a) => ({ id: "canvas-1", slug: "reel-12", ...a }));
  });

  it("creates the canvas linked to the script", async () => {
    const out = await createCanvasFromScriptAction(input);
    expect(createCanvasMock).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1", orgId: "org-1", sourceScriptId: "script-1", name: input.name }));
    expect(out).toMatchObject({ created: true, canvas: { id: "canvas-1" } });
  });

  it("returns the script's existing canvas instead of making a second one", async () => {
    getScriptCanvasMock.mockResolvedValue({ id: "canvas-0", slug: "reel-12" });
    const out = await createCanvasFromScriptAction(input);
    expect(createCanvasMock).not.toHaveBeenCalled();
    expect(out).toEqual({ created: false, canvas: { id: "canvas-0", slug: "reel-12" } });
  });

  it("when a second request wins the race, returns the canvas it made (Review Focus 1)", async () => {
    getScriptCanvasMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "canvas-race", slug: "reel-12" });
    createCanvasMock.mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    const out = await createCanvasFromScriptAction(input);
    expect(out).toEqual({ created: false, canvas: { id: "canvas-race", slug: "reel-12" } });
  });

  it("refuses a client outside the caller's org: no read of its canvas, no canvas made", async () => {
    getClientByIdMock.mockResolvedValue({ id: "client-1", org_id: "someone-elses-org" });
    getScriptCanvasMock.mockResolvedValue({ id: "their-canvas", slug: "theirs" });
    await expect(createCanvasFromScriptAction(input)).rejects.toThrow("Client not found.");
    expect(getScriptCanvasMock).not.toHaveBeenCalled();
    expect(createCanvasMock).not.toHaveBeenCalled();
  });

  it("refuses a script that is not approved", async () => {
    getScriptMock.mockResolvedValue({ ...approved, stage: "visualise" });
    await expect(createCanvasFromScriptAction(input)).rejects.toThrow("Only an approved script can start a canvas.");
    expect(createCanvasMock).not.toHaveBeenCalled();
  });
});
