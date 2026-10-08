import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ listScripts: vi.fn(), getScript: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { listScripts } from "@/lib/db/scripts";

const params = Promise.resolve({ id: "c1" });
const get = (qs = "") => new NextRequest(`http://localhost/api/clients/c1/scripts${qs}`);

describe("GET /api/clients/[id]/scripts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(listScripts).mockResolvedValue([]);
  });

  it("lists the client's scripts", async () => {
    const { GET } = await import("./route");
    const res = await GET(get(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scripts: [] });
    expect(listScripts).toHaveBeenCalledWith("c1", {});
  });

  it("filters by a known stage", async () => {
    const { GET } = await import("./route");
    await GET(get("?stage=approved"), { params });
    expect(listScripts).toHaveBeenCalledWith("c1", { stage: "approved" });
  });

  it("rejects an unknown stage", async () => {
    const { GET } = await import("./route");
    const res = await GET(get("?stage=shipped"), { params });
    expect(res.status).toBe(400);
    expect(listScripts).not.toHaveBeenCalled();
  });

  it("is a 404 for a client in another org", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Other", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    const res = await GET(get(), { params });
    expect(res.status).toBe(404);
    expect(listScripts).not.toHaveBeenCalled();
  });
});
