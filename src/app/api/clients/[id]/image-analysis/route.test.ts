import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContextOrNull: vi.fn(async () => ({ userId: "user-1" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({
  resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })),
}));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(async () => ({ id: "client-1", org_id: "org-1" })) }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ getImageAnalysisStatus: vi.fn(), startImageAnalysis: vi.fn() }));

import { getClientById } from "@/lib/db/clients";
import { getActiveKBVersion } from "@/lib/db/kb";
import { getImageAnalysisStatus, startImageAnalysis } from "@/lib/image-analysis/start";

const params = Promise.resolve({ id: "client-1" });
const url = "http://test/api/clients/client-1/image-analysis";
const STATUS = { images: 10, carded: 4, job: null };
const SECTION = { aesthetic: { value: "Clean" } };

describe("/api/clients/[id]/image-analysis", () => {
  beforeEach(() => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-1" } as never);
    vi.mocked(getImageAnalysisStatus).mockResolvedValue(STATUS as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue({ id: "v-1", output: { image_analysis: SECTION } } as never);
    vi.mocked(startImageAnalysis).mockReset();
  });

  it("GET returns the status and the stored section of the active version", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request(url), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...STATUS, versionId: "v-1", imageAnalysis: SECTION });
  });

  it("GET has no section before the KB is built", async () => {
    vi.mocked(getActiveKBVersion).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect(await (await GET(new Request(url), { params })).json()).toMatchObject({ versionId: null, imageAnalysis: null });
  });

  it("POST starts a run for the caller and returns the status", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request(url, { method: "POST" }), { params });
    expect(res.status).toBe(200);
    expect(startImageAnalysis).toHaveBeenCalledWith("client-1", "user-1", { force: true });
  });

  it("is a 404 for another org's client", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    expect((await GET(new Request(url), { params })).status).toBe(404);
  });
});
