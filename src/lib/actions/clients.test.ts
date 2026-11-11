import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock, resolveOrgIdMock, resolveActingCallerMock, logMock, createClientMock, addMemberMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async (): Promise<
    { isImpersonating: false } | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean }
  > => ({ isImpersonating: false })),
  resolveOrgIdMock: vi.fn(async () => "yuvabe-org"),
  resolveActingCallerMock: vi.fn(async (): Promise<unknown> => null),
  logMock: vi.fn(async () => undefined),
  addMemberMock: vi.fn(async () => undefined),
  createClientMock: vi.fn(async (args: { name: string; orgId: string }) => ({
    id: "client-1",
    slug: "acme",
    name: args.name,
    org_id: args.orgId,
  })),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: resolveImpersonationStateMock }));
// The real guard runs (checkActionAccess); only the acting caller is stubbed. An "agency" target needs no row lookup.
vi.mock("@/lib/permissions/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions/server")>()),
  resolveActingCaller: resolveActingCallerMock,
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));
vi.mock("@/lib/db/clients", () => ({ createClient: createClientMock, addClientToMembership: addMemberMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { createClientAction } from "./clients";

// effectiveOrgId follows resolveOrgIdMock, as resolveActingCaller's would.
function wireGuard(access = testOwnerAccess()) {
  resolveActingCallerMock.mockImplementation(async () => ({
    caller: { userId: "u1", orgId: "own-org", access },
    effectiveOrgId: await resolveOrgIdMock(),
    impersonation: { isImpersonating: false },
  }));
}

describe("createClientAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    wireGuard();
  });

  it("creates the client under the effective org (resolveOrgId), not a hardcoded caller org", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    resolveOrgIdMock.mockResolvedValue("target-org");
    createClientMock.mockResolvedValue({ id: "client-1", slug: "acme", name: "Acme", org_id: "target-org" });
    await createClientAction({ name: "Acme" });
    expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({ orgId: "target-org" }));
  });

  it("blocks the write while impersonating non-elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "target-org", elevated: false,
    });
    await expect(createClientAction({ name: "Acme" })).rejects.toThrow("Read-only while impersonating");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("allows the write and logs it while impersonating elevated", async () => {
    resolveImpersonationStateMock.mockResolvedValue({
      isImpersonating: true, operatorId: "op-1", targetOrgId: "target-org", elevated: true,
    });
    resolveOrgIdMock.mockResolvedValue("target-org");
    await createClientAction({ name: "Acme" });
    expect(createClientMock).toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({ eventType: "write_action" }));
  });

  it("rejects when the caller lacks clients.edit", async () => {
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    wireGuard(testAccess({ keys: [] }));
    await expect(createClientAction({ name: "Acme" })).rejects.toThrow("You don't have access to this. Ask your agency owner.");
    expect(createClientMock).not.toHaveBeenCalled();
  });
  it("adds the new client to a picked-list person's own list", async () => {
    resolveOrgIdMock.mockResolvedValue("target-org");
    createClientMock.mockResolvedValue({ id: "client-9", slug: "acme", name: "Acme", org_id: "target-org" });
    wireGuard(testAccess({ keys: ["clients.edit"], clientIds: [] }));
    await createClientAction({ name: "Acme" });
    expect(addMemberMock).toHaveBeenCalledWith("u1", "target-org", "client-9");
  });

  it("does not touch the list for all-clients access", async () => {
    resolveOrgIdMock.mockResolvedValue("target-org");
    createClientMock.mockResolvedValue({ id: "client-9", slug: "acme", name: "Acme", org_id: "target-org" });
    await createClientAction({ name: "Acme" });
    expect(addMemberMock).not.toHaveBeenCalled();
  });
});
