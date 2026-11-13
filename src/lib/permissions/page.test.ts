import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { actingMock, clientMock, targetMock, notFoundMock } = vi.hoisted(() => ({
  actingMock: vi.fn(),
  clientMock: vi.fn(),
  targetMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/permissions/server", async (orig) => ({ ...(await orig<typeof import("./server")>()), resolveActingCaller: actingMock }));
vi.mock("@/lib/db/clients", () => ({ getClientBySlug: clientMock }));
vi.mock("./targets", () => ({ resolveTarget: targetMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock, redirect: vi.fn() }));

import { loadCanvasPage, loadClientPage } from "./page";
import { testAccess } from "./test-fixtures";
import type { Permission } from "./model";

const acting = (permissions: Permission[], clientIds: string[] = ["c-1"]) => ({
  caller: { userId: "u1", orgId: "org-1", access: testAccess({ permissions, clientIds }) },
  effectiveOrgId: "org-1",
  impersonation: { isImpersonating: false },
});

// Spec §4.4: every page denial is the 404 page, which never confirms the client exists.
describe("loadClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.mockResolvedValue({ id: "c-1", slug: "acme", org_id: "org-1" });
  });

  it("returns the client for a person who can view it", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadClientPage("acme", "view")).resolves.toMatchObject({ client: { id: "c-1" }, effectiveOrgId: "org-1" });
  });

  it("shows the 404 page for another agency's client", async () => {
    actingMock.mockResolvedValue({ ...acting(["view"]), effectiveOrgId: "org-2" });
    await expect(loadClientPage("acme", "view")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page for a client the person is not on", async () => {
    actingMock.mockResolvedValue(acting(["view"], ["c-9"]));
    await expect(loadClientPage("acme", "view")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page without View on the client", async () => {
    actingMock.mockResolvedValue(acting(["edit"]));
    await expect(loadClientPage("acme", "view")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page without the permission the page needs", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadClientPage("acme", "edit")).rejects.toThrow("NOT_FOUND");
  });

  it("shows the 404 page for a slug that does not exist", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    clientMock.mockResolvedValue(null);
    await expect(loadClientPage("nope", "view")).rejects.toThrow("NOT_FOUND");
  });
});

// Canvas pages answer a canvas the person can't reach with null, so /eval shows the same
// "Canvas not found" it always showed for another agency's canvas.
describe("loadCanvasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    targetMock.mockResolvedValue({ clientId: "c-1", orgId: "org-1" });
  });

  it("returns the canvas's client for a person who can view it", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadCanvasPage("cv-1", "view")).resolves.toMatchObject({ clientId: "c-1", effectiveOrgId: "org-1" });
    expect(targetMock).toHaveBeenCalledWith({ canvasId: "cv-1" });
  });

  it("answers null for a canvas that does not exist", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    targetMock.mockResolvedValue(null);
    await expect(loadCanvasPage("cv-1", "view")).resolves.toBeNull();
  });

  it("answers null for another agency's canvas", async () => {
    actingMock.mockResolvedValue({ ...acting(["view"]), effectiveOrgId: "org-2" });
    await expect(loadCanvasPage("cv-1", "view")).resolves.toBeNull();
  });

  it("answers null for a canvas on a client the person can't view", async () => {
    actingMock.mockResolvedValue(acting(["view"], ["c-9"]));
    await expect(loadCanvasPage("cv-1", "view")).resolves.toBeNull();
  });

  it("shows the 404 page without the permission the page needs", async () => {
    actingMock.mockResolvedValue(acting(["view"]));
    await expect(loadCanvasPage("cv-1", "edit")).rejects.toThrow("NOT_FOUND");
  });
});
