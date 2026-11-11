import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// This file's own vi.mock of @/lib/permissions/server (importOriginal + override) replaces the
// one in vitest.setup.ts, so accessOf here is the real, fail-closed one.

const { actingMock, targetMock } = vi.hoisted(() => ({ actingMock: vi.fn(), targetMock: vi.fn() }));
vi.mock("@/lib/permissions/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions/server")>()),
  resolveActingCaller: actingMock,
}));
vi.mock("@/lib/permissions/targets", () => ({ resolveTarget: targetMock }));

import { checkActionAccess } from "./action-guard";
import { testAccess } from "./test-fixtures";

function acting(keys: Parameters<typeof testAccess>[0]["keys"], clientIds?: string[]) {
  return {
    caller: { userId: "u1", orgId: "org-1", access: testAccess({ keys, clientIds }) },
    effectiveOrgId: "org-1",
    impersonation: { isImpersonating: false },
  };
}

describe("checkActionAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes for a target in scope with the tick", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"], ["c-1"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const ctx = await checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } });
    expect(ctx.target).toEqual({ clientId: "c-1", orgId: "org-1" });
  });

  it("says not found for another agency's row", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-2" });
    await expect(checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a missing row", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"]));
    targetMock.mockResolvedValue(null);
    await expect(checkActionAccess({ need: "canvases.edit", on: { nodeId: "n-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a client outside the list", async () => {
    actingMock.mockResolvedValue(acting(["canvases.edit"], ["c-9"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    await expect(checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("refuses a missing tick with the agreed copy", async () => {
    actingMock.mockResolvedValue(acting(["canvases.view"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    await expect(checkActionAccess({ need: "canvases.delete", on: { canvasId: "cv-1" } })).rejects.toThrow(
      "You don't have access to this. Ask your agency owner.",
    );
  });

  it("checks an agency key without a target lookup", async () => {
    actingMock.mockResolvedValue(acting(["clients.edit"]));
    const ctx = await checkActionAccess({ need: "clients.edit", on: "agency" });
    expect(targetMock).not.toHaveBeenCalled();
    expect(ctx.target).toBeNull();
  });

  it("passes a custom guard through with the acting caller", async () => {
    actingMock.mockResolvedValue(acting([]));
    const ctx = await checkActionAccess({ custom: "checks area approve itself" });
    expect(ctx.caller.userId).toBe("u1");
    expect(targetMock).not.toHaveBeenCalled();
  });

  // One round trip, not two: the target row does not depend on who is asking.
  it("reads the caller and the target at the same time", async () => {
    let release!: (v: unknown) => void;
    actingMock.mockImplementation(() => new Promise((r) => { release = r; }));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const pending = checkActionAccess({ need: "canvases.edit", on: { canvasId: "cv-1" } });
    await Promise.resolve();
    expect(targetMock).toHaveBeenCalledWith({ canvasId: "cv-1" });
    release(acting(["canvases.edit"]));
    await expect(pending).resolves.toMatchObject({ target: { clientId: "c-1" } });
  });

  it("hands back the impersonation state it resolved", async () => {
    const impersonation = { isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true };
    actingMock.mockResolvedValue({ ...acting(["clients.edit"]), impersonation });
    const ctx = await checkActionAccess({ need: "clients.edit", on: "agency" });
    expect(ctx.impersonation).toBe(impersonation);
  });
});
