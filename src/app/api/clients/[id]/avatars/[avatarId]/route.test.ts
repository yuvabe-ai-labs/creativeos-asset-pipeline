import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({
  getAvatar: vi.fn(), updateAvatar: vi.fn(), archiveAvatar: vi.fn(),
}));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar, archiveAvatar } from "@/lib/db/avatars";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const url = "http://localhost/api/clients/c1/avatars/a1";
const patch = (body: unknown) =>
  new NextRequest(url, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

describe("/api/clients/[id]/avatars/[avatarId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
    vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
  });

  it("GET is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(url), { params });
    expect(res.status).toBe(404);
    expect(getAvatar).toHaveBeenCalledWith("c1", "a1");
  });

  it("PATCH is a 404 for an archived avatar", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ archivedAt: "2026-10-01T00:00:00.000Z" }));
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ name: "x" }), { params })).status).toBe(404);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("PATCH refuses ready while a part is missing, and says which", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft", sheet: null }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ status: "ready" }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Still needed: a profile sheet.");
  });

  it("PATCH ignores an unknown 'declaration' field in the body", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ name: "Riya", declaration: { personType: "specific" } }), { params });
    expect(res.status).toBe(200);
    const written = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(written).not.toHaveProperty("personType");
  });

  it("DELETE archives, and is a 404 when there was nothing to archive", async () => {
    const { DELETE } = await import("./route");
    vi.mocked(archiveAvatar).mockResolvedValue(true);
    expect((await DELETE(new NextRequest(url, { method: "DELETE" }), { params })).status).toBe(200);
    expect(archiveAvatar).toHaveBeenCalledWith("c1", "a1");
    vi.mocked(archiveAvatar).mockResolvedValue(false);
    expect((await DELETE(new NextRequest(url, { method: "DELETE" }), { params })).status).toBe(404);
  });
});
