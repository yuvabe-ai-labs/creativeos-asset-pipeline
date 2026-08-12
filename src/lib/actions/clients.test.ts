import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveImpersonationStateMock, resolveOrgIdMock, logMock, createClientMock } = vi.hoisted(() => ({
  resolveImpersonationStateMock: vi.fn(async (): Promise<
    { isImpersonating: false } | { isImpersonating: true; operatorId: string; targetOrgId: string; elevated: boolean }
  > => ({ isImpersonating: false })),
  resolveOrgIdMock: vi.fn(async () => "yuvabe-org"),
  logMock: vi.fn(async () => undefined),
  createClientMock: vi.fn(async (args: { name: string; orgId: string }) => ({
    id: "client-1",
    slug: "acme",
    name: args.name,
    org_id: args.orgId,
  })),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: resolveImpersonationStateMock }));
vi.mock("@/lib/dal", () => ({ resolveOrgId: resolveOrgIdMock }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: logMock }));
vi.mock("@/lib/db/clients", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClientAction } from "./clients";

describe("createClientAction", () => {
  beforeEach(() => vi.resetAllMocks());

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
});
