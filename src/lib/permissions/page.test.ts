import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { actingMock, clientMock, redirectMock, notFoundMock } = vi.hoisted(() => ({
  actingMock: vi.fn(),
  clientMock: vi.fn(),
  redirectMock: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
  notFoundMock: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/permissions/server", async (orig) => ({ ...(await orig<typeof import("./server")>()), resolveActingCaller: actingMock }));
vi.mock("@/lib/db/clients", () => ({ getClientBySlug: clientMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock, notFound: notFoundMock }));

import { loadClientPage } from "./page";
import { testAccess } from "./test-fixtures";

const acting = (keys: Parameters<typeof testAccess>[0]["keys"], clientIds?: string[]) => ({
  caller: { userId: "u1", orgId: "org-1", access: testAccess({ keys, clientIds }) },
  effectiveOrgId: "org-1",
  impersonation: { isImpersonating: false },
});

describe("loadClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.mockResolvedValue({ id: "c-1", slug: "acme", org_id: "org-1" });
  });

  it("returns the client when in scope with view", async () => {
    actingMock.mockResolvedValue(acting(["scripts.view"], ["c-1"]));
    await expect(loadClientPage("acme", "scripts.view")).resolves.toMatchObject({ client: { id: "c-1" } });
  });

  it("redirects home for another agency's client", async () => {
    actingMock.mockResolvedValue({ ...acting(["scripts.view"]), effectiveOrgId: "org-2" });
    await expect(loadClientPage("acme", "scripts.view")).rejects.toThrow("REDIRECT /");
  });

  it("redirects home for a client outside the person's list", async () => {
    actingMock.mockResolvedValue(acting(["scripts.view"], ["c-9"]));
    await expect(loadClientPage("acme", "scripts.view")).rejects.toThrow("REDIRECT /");
  });

  it("shows not found when the person lacks the area's view", async () => {
    actingMock.mockResolvedValue(acting(["canvases.view"], ["c-1"]));
    await expect(loadClientPage("acme", "scripts.view")).rejects.toThrow("NOT_FOUND");
  });
});
