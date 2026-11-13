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
import { testAccess, testOwnerAccess } from "./test-fixtures";
import type { Access, Permission } from "./model";

function acting(access: Access) {
  return { caller: { userId: "u1", orgId: "org-1", access }, effectiveOrgId: "org-1", impersonation: { isImpersonating: false } };
}
const member = (permissions: Permission[], clientIds: string[] = ["c-1"]) => acting(testAccess({ permissions, clientIds }));

describe("checkActionAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes for a client the person is on, with the permission", async () => {
    actingMock.mockResolvedValue(member(["generate"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const ctx = await checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } });
    expect(ctx.target).toEqual({ clientId: "c-1", orgId: "org-1" });
  });

  it("says not found for another agency's row", async () => {
    actingMock.mockResolvedValue(member(["generate"]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-2" });
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a missing row", async () => {
    actingMock.mockResolvedValue(member(["generate"]));
    targetMock.mockResolvedValue(null);
    await expect(checkActionAccess({ need: "edit", on: { nodeId: "n-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found when the target has no client to check against", async () => {
    actingMock.mockResolvedValue(acting(testOwnerAccess()));
    targetMock.mockResolvedValue({ clientId: null, orgId: "org-1" });
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("says not found for a client the person is not on, or before access is given", async () => {
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    actingMock.mockResolvedValue(member(["generate"], ["c-9"]));
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
    actingMock.mockResolvedValue(acting(testAccess({ permissions: ["generate"], clientIds: ["c-1"], accessGiven: false })));
    await expect(checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } })).rejects.toThrow("Not found.");
  });

  it("refuses a missing permission with the agreed copy", async () => {
    actingMock.mockResolvedValue(member([]));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    await expect(checkActionAccess({ need: "delete", on: { canvasId: "cv-1" } })).rejects.toThrow(
      "You don't have access to this. Ask your agency owner.",
    );
  });

  it("checks an owner-only action without a target lookup", async () => {
    actingMock.mockResolvedValue(acting(testOwnerAccess()));
    const ctx = await checkActionAccess({ need: "manage_clients", on: "agency" });
    expect(targetMock).not.toHaveBeenCalled();
    expect(ctx.target).toBeNull();
  });

  it("refuses an owner-only action to a member", async () => {
    actingMock.mockResolvedValue(member(["generate", "approve", "share", "delete"]));
    await expect(checkActionAccess({ need: "manage_clients", on: "agency" })).rejects.toThrow(
      "You don't have access to this. Ask your agency owner.",
    );
  });

  it("passes a custom guard through with the acting caller", async () => {
    actingMock.mockResolvedValue(member([]));
    const ctx = await checkActionAccess({ custom: "checks approve itself" });
    expect(ctx.caller.userId).toBe("u1");
    expect(targetMock).not.toHaveBeenCalled();
  });

  // One round trip, not two: the target row does not depend on who is asking.
  it("reads the caller and the target at the same time", async () => {
    let release!: (v: unknown) => void;
    actingMock.mockImplementation(() => new Promise((r) => { release = r; }));
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
    const pending = checkActionAccess({ need: "edit", on: { canvasId: "cv-1" } });
    await Promise.resolve();
    expect(targetMock).toHaveBeenCalledWith({ canvasId: "cv-1" });
    release(member(["generate"]));
    await expect(pending).resolves.toMatchObject({ target: { clientId: "c-1" } });
  });

  it("hands back the impersonation state it resolved", async () => {
    const impersonation = { isImpersonating: true, operatorId: "op-1", targetOrgId: "org-1", elevated: true };
    actingMock.mockResolvedValue({ ...acting(testOwnerAccess()), impersonation });
    const ctx = await checkActionAccess({ need: "manage_clients", on: "agency" });
    expect(ctx.impersonation).toBe(impersonation);
  });
});
