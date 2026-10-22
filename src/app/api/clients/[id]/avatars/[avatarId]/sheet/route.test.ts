import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar, makeViews } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ sumAvatarCredits: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});
vi.mock("@/lib/avatars/generate", () => ({ runAvatarGeneration: vi.fn() }));
vi.mock("@/lib/avatars/sheet-cut", () => ({ cutSheetIntoViews: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { cutSheetIntoViews } from "@/lib/avatars/sheet-cut";
import { removeObject } from "@/lib/storage";

const NB2 = "gemini:gemini-3.1-flash-image";
const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/sheet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const SHEET_URL = "https://storage.googleapis.com/b/sheet.png";
const SHEET_ROW = {
  id: "g-sheet", status: "succeeded", model_used: NB2,
  inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["front-url"] },
  output_snapshot: SHEET_URL,
  meta: { width: 1920, height: 1080, sizeBytes: 3 }, created_at: "2026-10-22T10:00:00.000Z",
};
const VIEWS = makeViews();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
  vi.mocked(runAvatarGeneration).mockResolvedValue({ generation: SHEET_ROW as never, creditsCharged: 12 });
  vi.mocked(cutSheetIntoViews).mockResolvedValue(VIEWS as never);
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
  vi.mocked(sumAvatarCredits).mockResolvedValue(40);
});

describe("POST sheet — one turnaround sheet, cut into four views (D395)", () => {
  it("makes ONE 16:9 sheet from the front with every view stated, cuts it, and saves both", async () => {
    const front = makeAvatar().front!;
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    expect(runAvatarGeneration).toHaveBeenCalledTimes(1);
    const [args] = vi.mocked(runAvatarGeneration).mock.calls[0];
    expect(args).toMatchObject({ slot: "sheet", aspect: "16:9", modelId: NB2, referenceUrls: [front.url], batchId: null });
    expect(args.view).toBeUndefined();
    expect(args.prompt).toContain("turnaround sheet");
    expect(args.prompt).toContain("LEFT edge");
    expect(args.prompt).toContain("RIGHT edge");
    expect(vi.mocked(cutSheetIntoViews).mock.calls[0][0].sheet.url).toBe(SHEET_URL);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheet?.url).toBe(SHEET_URL);
    expect(patch.sheetViews).toEqual(VIEWS);
    expect(patch.sheetStale).toBe(false);
    expect(await res.json()).toMatchObject({ creditsCharged: 12, spentCredits: 40, failed: [] });
  });

  it("always makes the whole sheet, even when an older client asks for one view", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetViews: makeViews() }));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2, views: ["left"] }), { params })).status).toBe(200);
    expect(runAvatarGeneration).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateAvatar).mock.calls[0][2].sheetViews).toEqual(VIEWS);
  });

  it("keeps the paid-for sheet when cutting fails, with no views, and names every view", async () => {
    vi.mocked(cutSheetIntoViews).mockRejectedValue(new Error("fetch failed"));
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheet?.url).toBe(SHEET_URL);
    expect(patch.sheetViews).toBeNull();
    const json = await res.json();
    expect(json.failed.map((f: { view: string }) => f.view)).toEqual(["front", "left", "right", "back"]);
  });

  it("answers 402 at the credit cap, and leaves the avatar alone", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(402);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("answers 500 with the model's reason when the sheet fails, and leaves the avatar alone", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new Error("Content blocked"));
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Content blocked");
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("is a 400 for a model that is not in the registry, before touching the avatar", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "nope:none" }), { params });
    expect(res.status).toBe(400);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("needs a front image first", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: null, sheet: null, status: "draft" }));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(400);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("refuses when the front changed while the views were generating", async () => {
    const before = makeAvatar({ sheetStale: true, status: "draft" });
    const after = makeAvatar({ status: "draft", front: { ...before.front!, url: "https://storage.googleapis.com/b/other.png" } });
    vi.mocked(getAvatar).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(409);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("writes on the front it generated from, and is a 409 when that precondition catches a race", async () => {
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: makeAvatar().front!.url });
    expect(res.status).toBe(409);
  });

  it("removes an older uploaded sheet the new views replace", async () => {
    const { POST } = await import("./route");
    await POST(post({ modelId: NB2 }), { params });
    expect(removeObject).toHaveBeenCalledWith(makeAvatar().sheet!.url);
  });

  it("still answers with the avatar when the spend total cannot be read", async () => {
    vi.mocked(sumAvatarCredits).mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    const json = await (await POST(post({ modelId: NB2 }), { params })).json();
    expect(json.avatar).toBeTruthy();
    expect(json.spentCredits).toBeNull();
  });
});
