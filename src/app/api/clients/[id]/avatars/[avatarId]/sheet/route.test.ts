import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});
vi.mock("@/lib/avatars/generate", () => ({ runAvatarGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/sheet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const row = {
  id: "g5", status: "succeeded", model_used: "gemini:gemini-3-pro-image",
  inputs_snapshot: { slot: "sheet", prompt: "sheet", batchId: null, referenceUrls: ["front-url"] },
  output_snapshot: "https://storage.googleapis.com/b/sheet.png", meta: { width: 16, height: 9, sizeBytes: 3 },
  created_at: "2026-09-30T10:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
  vi.mocked(runAvatarGeneration).mockResolvedValue({ generation: row as never, creditsCharged: 40 });
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
});

describe("POST sheet", () => {
  it("generates the sheet from the front image and makes it current", async () => {
    const front = makeAvatar().front!;
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(runAvatarGeneration).mock.calls[0][0]).toMatchObject({
      slot: "sheet", aspect: "16:9", modelId: "gemini:gemini-3-pro-image",
      referenceUrls: [front.url], batchId: null, userId: "user-9",
    });
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheet?.source).toMatchObject({ kind: "generated", mode: "edit", generationId: "g5" });
    expect(patch.sheetStale).toBe(false);
    expect((await res.json()).creditsCharged).toBe(40);
  });

  it("removes an uploaded sheet it replaces", async () => {
    const { POST } = await import("./route");
    await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(removeObject).toHaveBeenCalledTimes(1);
  });

  it("needs a front image first", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: null, sheet: null, status: "draft" }));
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(res.status).toBe(400);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("answers 402 at the credit cap and leaves the avatar alone", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params })).status).toBe(402);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("refuses when the front image changed while the sheet was generating", async () => {
    const before = makeAvatar({ sheetStale: true, status: "draft" });
    const after = makeAvatar({
      status: "draft",
      front: { ...before.front!, url: "https://storage.googleapis.com/b/other.png" },
    });
    vi.mocked(getAvatar).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "gemini:gemini-3-pro-image" }), { params });
    expect(res.status).toBe(409);
    expect(updateAvatar).not.toHaveBeenCalled();
  });
});
