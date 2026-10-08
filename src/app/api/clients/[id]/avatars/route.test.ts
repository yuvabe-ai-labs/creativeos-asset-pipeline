import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(),
  resolveOrgId: vi.fn(),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ listAvatars: vi.fn(), createDraftAvatar: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { listAvatars, createDraftAvatar } from "@/lib/db/avatars";

const params = Promise.resolve({ id: "c1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

describe("/api/clients/[id]/avatars", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  });

  it("GET lists the client's avatars", async () => {
    vi.mocked(listAvatars).mockResolvedValue([makeAvatar()]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/c1/avatars"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).avatars).toHaveLength(1);
    expect(listAvatars).toHaveBeenCalledWith("c1");
  });

  it("GET is a 404 for a client in another org", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/c1/avatars"), { params });
    expect(res.status).toBe(404);
    expect(listAvatars).not.toHaveBeenCalled();
  });

  it("POST creates a draft owned by the caller", async () => {
    vi.mocked(createDraftAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
    const { POST } = await import("./route");
    const res = await POST(post({ name: " Riya " }), { params });
    expect(res.status).toBe(201);
    expect(createDraftAvatar).toHaveBeenCalledWith({ clientId: "c1", userId: "user-1", name: "Riya" });
  });

  it("POST rejects a name over the limit", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ name: "x".repeat(61) }), { params });
    expect(res.status).toBe(400);
    expect(createDraftAvatar).not.toHaveBeenCalled();
  });
});
