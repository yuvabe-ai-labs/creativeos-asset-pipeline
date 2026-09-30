import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GENERATED, makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  signAvatarImageUpload: vi.fn(),
  removeObject: vi.fn(),
  publicUrlFor: (path: string) => `https://storage.googleapis.com/b/${path}`,
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { signAvatarImageUpload, removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const req = (path: string, body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/avatars/a1/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const FRONT_PATH = "clients/c1/avatars/a1/front/new__t.png";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
});

describe("POST images/sign", () => {
  it("signs a valid image for the avatar's slot", async () => {
    vi.mocked(signAvatarImageUpload).mockResolvedValue({ signedUrl: "s", path: FRONT_PATH, url: "u" });
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "new.png", contentType: "image/png", size: 100, slot: "front" }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(signAvatarImageUpload).toHaveBeenCalledWith({
      clientId: "c1", avatarId: "a1", slot: "front", filename: "new.png", contentType: "image/png",
    });
  });

  it("rejects an unsupported type before signing", async () => {
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "new.gif", contentType: "image/gif", size: 100, slot: "front" }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(signAvatarImageUpload).not.toHaveBeenCalled();
  });

  it("is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "new.png", contentType: "image/png", size: 100, slot: "front" }),
      { params },
    );
    expect(res.status).toBe(404);
  });

  it("rejects a content type outside the allowed set, even with a valid extension", async () => {
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", {
        filename: "new.png", contentType: "application/octet-stream", size: 100, slot: "front",
      }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(signAvatarImageUpload).not.toHaveBeenCalled();
  });
});

describe("POST images (finalize)", () => {
  const body = { path: FRONT_PATH, filename: "new.png", size: 100, slot: "front", imageWidth: 900, imageHeight: 1200 };

  it("refuses a path outside this avatar's slot folder", async () => {
    const { POST } = await import("./route");
    const foreign = { ...body, path: "clients/c2/avatars/a9/front/x.png" };
    expect((await POST(req("images", foreign), { params })).status).toBe(400);
    const wrongSlot = { ...body, path: "clients/c1/avatars/a1/sheet/x.png" };
    expect((await POST(req("images", wrongSlot), { params })).status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("refuses a path that traverses out of the slot folder even though it matches the prefix", async () => {
    const { POST } = await import("./route");
    const traversal = { ...body, path: "clients/c1/avatars/a1/front/../../a9/front/x.png" };
    expect((await POST(req("images", traversal), { params })).status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("refuses a path with a nested segment after the slot folder", async () => {
    const { POST } = await import("./route");
    const nested = { ...body, path: "clients/c1/avatars/a1/front/sub/x.png" };
    expect((await POST(req("images", nested), { params })).status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("a new front records its source, follows the upload as a specific person, stales the sheet and returns to draft", async () => {
    const { POST } = await import("./route");
    const res = await POST(req("images", body), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.front).toMatchObject({
      url: `https://storage.googleapis.com/b/${FRONT_PATH}`, width: 900, height: 1200, sizeBytes: 100,
      source: { kind: "upload", filename: "new.png", uploadedBy: "user-9" },
    });
    expect(patch).toMatchObject({
      sheetStale: true, personType: "specific", status: "draft",
      likenessConsentBy: null, likenessConsentAt: null,
    });
  });

  it("removes the uploaded image it replaces, but never a generated one", async () => {
    const { POST } = await import("./route");
    await POST(req("images", body), { params });
    expect(removeObject).toHaveBeenCalledTimes(1);

    vi.mocked(removeObject).mockClear();
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: makeImage(GENERATED) }));
    await POST(req("images", body), { params });
    expect(removeObject).not.toHaveBeenCalled();
  });

  it("does not remove the object when finalizing the same upload twice — its URL is unchanged", async () => {
    const { POST } = await import("./route");
    // makeAvatar()'s front is at this same path; publicUrlFor(path) resolves to its own URL.
    const samePath = "clients/c1/avatars/a1/front/face.png";
    await POST(req("images", { ...body, path: samePath }), { params });
    expect(removeObject).not.toHaveBeenCalled();
  });

  it("a new sheet is current", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
    const { POST } = await import("./route");
    await POST(req("images", { ...body, slot: "sheet", path: "clients/c1/avatars/a1/sheet/s.png" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toMatchObject({ sheetStale: false });
  });
});
