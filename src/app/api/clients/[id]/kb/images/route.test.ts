import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ insertBrandImage: vi.fn(), deleteBrandImage: vi.fn(), listBrandImages: vi.fn() }));
vi.mock("@/lib/storage/gcs", () => ({ uploadBrandImage: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { deleteBrandImage } from "@/lib/db/kb";
import { startImageAnalysisQuietly } from "@/lib/image-analysis/start";

const params = Promise.resolve({ id: "c1" });
const remove = (query: string) => new NextRequest(`http://localhost/api/clients/c1/kb/images?${query}`, { method: "DELETE" });

describe("DELETE /api/clients/:id/kb/images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "o1" } as never);
  });

  it("studies the images again when one is removed on the form", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(remove("imageId=i1"), { params })).status).toBe(200);
    expect(deleteBrandImage).toHaveBeenCalledWith("c1", "i1");
    expect(startImageAnalysisQuietly).toHaveBeenCalledWith("c1");
  });

  it("starts no study when a chat attachment that was never sent is removed", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(remove("imageId=i1&studyLater=1"), { params })).status).toBe(200);
    expect(deleteBrandImage).toHaveBeenCalledWith("c1", "i1");
    expect(startImageAnalysisQuietly).not.toHaveBeenCalled();
  });
});
