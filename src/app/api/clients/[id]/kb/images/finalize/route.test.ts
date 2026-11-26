import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ insertBrandImage: vi.fn() }));
vi.mock("@/lib/storage/gcs", () => ({ publicUrlFor: (path: string) => `https://cdn/${path}` }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { insertBrandImage } from "@/lib/db/kb";
import { startImageAnalysisQuietly } from "@/lib/image-analysis/start";

const params = Promise.resolve({ id: "c1" });
const finalize = (extra: Record<string, unknown> = {}) =>
  new NextRequest("http://localhost/api/clients/c1/kb/images/finalize", {
    method: "POST",
    body: JSON.stringify({ path: "clients/c1/brand-images/a.png", filename: "a.png", size: 10, ...extra }),
  });

describe("POST /api/clients/:id/kb/images/finalize", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "o1" } as never);
    vi.mocked(insertBrandImage).mockResolvedValue({ id: "i1" } as never);
  });

  it("studies the images at once for an upload from the form", async () => {
    const { POST } = await import("./route");
    expect((await POST(finalize(), { params })).status).toBe(200);
    expect(startImageAnalysisQuietly).toHaveBeenCalledWith("c1");
  });

  it("leaves the study for later when the chat attaches the image, until the message is sent", async () => {
    const { POST } = await import("./route");
    expect((await POST(finalize({ studyLater: true }), { params })).status).toBe(200);
    expect(insertBrandImage).toHaveBeenCalled();
    expect(startImageAnalysisQuietly).not.toHaveBeenCalled();
  });
});
