import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GENERATED, makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({
  getAvatar: vi.fn(), updateAvatar: vi.fn(), archiveAvatar: vi.fn(),
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
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
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", orgId: "org-1" } as never);
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
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft", front: null }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ status: "ready" }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Still needed: a front image.");
  });

  it("PATCH ignores an unknown 'declaration' field in the body", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ name: "Riya", declaration: { personType: "specific" } }), { params });
    expect(res.status).toBe(200);
    const written = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(written).not.toHaveProperty("personType");
  });

  it("PATCH consent with the matching frontUrl records the caller and the time", async () => {
    const current = makeAvatar({ status: "draft", likenessConsentBy: null, likenessConsentAt: null });
    vi.mocked(getAvatar).mockResolvedValue(current);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ consent: { frontUrl: current.front!.url } }), { params });
    expect(res.status).toBe(200);
    const written = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(written.likenessConsentBy).toBe("user-9");
    expect(typeof written.likenessConsentAt).toBe("string");
  });

  it("PATCH consent with a different frontUrl is refused, and does not write", async () => {
    const current = makeAvatar({ status: "draft", likenessConsentBy: null, likenessConsentAt: null });
    vi.mocked(getAvatar).mockResolvedValue(current);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      patch({ consent: { frontUrl: "https://storage.googleapis.com/b/other/face.png" } }), { params },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("The front image changed. Confirm the permission again.");
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("PATCH consent is a 400 for a generated front, and does not write", async () => {
    const current = makeAvatar({
      front: makeImage(GENERATED), likenessConsentBy: null, likenessConsentAt: null,
    });
    vi.mocked(getAvatar).mockResolvedValue(current);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ consent: { frontUrl: current.front!.url } }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Only an uploaded front image needs consent.");
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("PATCH { consent: true } (the old shape) is a 400", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ consent: true }), { params });
    expect(res.status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("PATCH passes the front-URL precondition to updateAvatar for a consent patch", async () => {
    const current = makeAvatar({ status: "draft", likenessConsentBy: null, likenessConsentAt: null });
    vi.mocked(getAvatar).mockResolvedValue(current);
    const { PATCH } = await import("./route");
    await PATCH(patch({ consent: { frontUrl: current.front!.url } }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: current.front!.url });
  });

  it("PATCH passes the front-URL precondition for status: ready on an uploaded front", async () => {
    const current = makeAvatar({ status: "draft" }); // already complete and consented by default
    vi.mocked(getAvatar).mockResolvedValue(current);
    const { PATCH } = await import("./route");
    await PATCH(patch({ status: "ready" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: current.front!.url });
  });

  it("PATCH does not pass a front-URL precondition for a plain name/story patch", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
    const { PATCH } = await import("./route");
    await PATCH(patch({ name: "Riya" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({});
  });

  it("PATCH is a 409 when updateAvatar finds no row for a consent patch, though the avatar exists", async () => {
    const current = makeAvatar({ status: "draft", likenessConsentBy: null, likenessConsentAt: null });
    vi.mocked(getAvatar).mockResolvedValue(current);
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ consent: { frontUrl: current.front!.url } }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("The front image changed. Confirm the permission again.");
  });

  it("PATCH is a 404 when the avatar does not exist", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ name: "x" }), { params });
    expect(res.status).toBe(404);
    expect(updateAvatar).not.toHaveBeenCalled();
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
