import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ getAvatarGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { getAvatarGeneration } from "@/lib/db/generations";
import { removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/front", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const row = {
  id: "g1", avatar_id: "a1", status: "succeeded", model_used: "seedream:seedream-5-0-lite",
  inputs_snapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
  output_snapshot: "https://storage.googleapis.com/b/gen.png", meta: { width: 1, height: 2, sizeBytes: 3 },
  created_at: "2026-09-30T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
  vi.mocked(getAvatarGeneration).mockResolvedValue(row as never);
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
});

describe("POST front", () => {
  it("re-picking the candidate that is already the front is a no-op", async () => {
    // makeAvatar()'s front is at row.output_snapshot's URL once we point them at the same file.
    const sameFront = { ...row, output_snapshot: makeAvatar().front!.url };
    vi.mocked(getAvatarGeneration).mockResolvedValue(sameFront as never);
    const { POST } = await import("./route");
    const res = await POST(post({ generationId: "g1" }), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).avatar).toEqual(makeAvatar());
    expect(updateAvatar).not.toHaveBeenCalled();
    expect(removeObject).not.toHaveBeenCalled();
  });

  it("a generated front makes the avatar generic, clears consent, stales the sheet and returns to draft", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ generationId: "g1" }), { params });
    expect(res.status).toBe(200);
    expect(getAvatarGeneration).toHaveBeenCalledWith("a1", "g1");
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.front?.source).toMatchObject({ kind: "generated", generationId: "g1", mode: "text" });
    expect(patch).toMatchObject({
      personType: "generic", likenessConsentBy: null, likenessConsentAt: null,
      sheetStale: true, status: "draft",
    });
  });

  it("removes the uploaded photo it replaces", async () => {
    const { POST } = await import("./route");
    await POST(post({ generationId: "g1" }), { params });
    expect(removeObject).toHaveBeenCalledTimes(1);
  });

  it("is a 404 for a generation of another avatar, and a 400 for a sheet or failed one", async () => {
    const { POST } = await import("./route");
    vi.mocked(getAvatarGeneration).mockResolvedValue(null);
    expect((await POST(post({ generationId: "g9" }), { params })).status).toBe(404);

    vi.mocked(getAvatarGeneration).mockResolvedValue({
      ...row, inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] },
    } as never);
    expect((await POST(post({ generationId: "g1" }), { params })).status).toBe(400);

    vi.mocked(getAvatarGeneration).mockResolvedValue({ ...row, status: "failed", output_snapshot: null } as never);
    expect((await POST(post({ generationId: "g1" }), { params })).status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("passes the front-URL precondition read for this request", async () => {
    const { POST } = await import("./route");
    const current = makeAvatar();
    vi.mocked(getAvatar).mockResolvedValue(current);
    await POST(post({ generationId: "g1" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: current.front!.url });
  });

  it("passes a null precondition — 'front is still empty' — for a fresh draft with no front yet", async () => {
    const { POST } = await import("./route");
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: null, sheet: null }));
    await POST(post({ generationId: "g1" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: null });
  });

  it("is a 409 when updateAvatar finds no row, though the avatar still exists — the front changed mid-request", async () => {
    const { POST } = await import("./route");
    vi.mocked(getAvatar)
      .mockResolvedValueOnce(makeAvatar())
      .mockResolvedValueOnce(makeAvatar()); // still there on the existence re-check
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const res = await POST(post({ generationId: "g1" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("The front image changed. Pick again.");
  });

  it("is a 404 when updateAvatar finds no row and the avatar no longer exists", async () => {
    const { POST } = await import("./route");
    vi.mocked(getAvatar)
      .mockResolvedValueOnce(makeAvatar())
      .mockResolvedValueOnce(null); // gone by the existence re-check
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const res = await POST(post({ generationId: "g1" }), { params });
    expect(res.status).toBe(404);
  });

  it("is a 404 when updateAvatar finds no row and the avatar is archived", async () => {
    const { POST } = await import("./route");
    vi.mocked(getAvatar)
      .mockResolvedValueOnce(makeAvatar())
      .mockResolvedValueOnce(makeAvatar({ archivedAt: "2026-09-30T10:00:00.000Z" })); // archived by the existence re-check
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const res = await POST(post({ generationId: "g1" }), { params });
    expect(res.status).toBe(404);
  });
});
