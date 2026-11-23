import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(), setMarketStatus: vi.fn() }));

import { revalidatePath } from "next/cache";
import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById, setMarketStatus } from "@/lib/db/clients";

const params = Promise.resolve({ id: "c1" });
const post = () => new NextRequest("http://localhost/api/clients/c1/market/approve", { method: "POST" });
const client = (over: Record<string, unknown>) =>
  ({ id: "c1", slug: "chupps", name: "Chupps", org_id: "org-1", kb_status: "ready", market_status: "pending", ...over }) as never;

describe("POST /api/clients/[id]/market/approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue(client({}));
  });

  it("approves when the brand KB is ready", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setMarketStatus).toHaveBeenCalledWith("c1", "approved");
    expect(revalidatePath).toHaveBeenCalledWith("/clients/chupps/scripts");
  });

  it("refuses while the brand KB is not ready", async () => {
    vi.mocked(getClientById).mockResolvedValue(client({ kb_status: "in_review" }));
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Approve the brand KB before market research.");
    expect(setMarketStatus).not.toHaveBeenCalled();
  });

  it("is a no-op when already approved", async () => {
    vi.mocked(getClientById).mockResolvedValue(client({ market_status: "approved", kb_status: "in_review" }));
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(200);
    expect(setMarketStatus).not.toHaveBeenCalled();
  });

  it("404s for a client outside the caller's org", async () => {
    vi.mocked(getClientById).mockResolvedValue(client({ org_id: "org-2" }));
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(404);
    expect(setMarketStatus).not.toHaveBeenCalled();
  });
});
