import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar, makeImage, makeViews } from "@/lib/avatars/__tests__/fixtures";

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
vi.mock("@/lib/avatars/sheet-compose", () => ({ composeSheetStrip: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { composeSheetStrip } from "@/lib/avatars/sheet-compose";
import { removeObject } from "@/lib/storage";
import type { AvatarViewId } from "@/lib/avatars/schema";

const NB2 = "gemini:gemini-3.1-flash-image";
const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/sheet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const rowFor = (view: AvatarViewId) => ({
  id: `g-${view}`, status: "succeeded", model_used: NB2,
  inputs_snapshot: { slot: "sheet", view, prompt: "p", batchId: null, referenceUrls: ["front-url"] },
  output_snapshot: `https://storage.googleapis.com/b/${view}.png`,
  meta: { width: 768, height: 1024, sizeBytes: 3 }, created_at: "2026-10-08T10:00:00.000Z",
});
const STRIP = { ...makeImage(), url: "https://storage.googleapis.com/b/strip.png" };
const generatedViews = () => vi.mocked(runAvatarGeneration).mock.calls.map((c) => c[0].view);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
  vi.mocked(runAvatarGeneration).mockImplementation(async (args) => ({
    generation: rowFor(args.view!) as never, creditsCharged: 10,
  }));
  vi.mocked(composeSheetStrip).mockResolvedValue(STRIP);
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
  vi.mocked(sumAvatarCredits).mockResolvedValue(40);
});

describe("POST sheet — four views (D339)", () => {
  it("makes all four views from the front, each 3:4 with its direction stated, and composes the strip", async () => {
    const front = makeAvatar().front!;
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    expect(generatedViews()).toEqual(["front", "left", "right", "back"]);
    for (const [args] of vi.mocked(runAvatarGeneration).mock.calls) {
      expect(args).toMatchObject({ slot: "sheet", aspect: "3:4", modelId: NB2, referenceUrls: [front.url], batchId: null });
    }
    expect(vi.mocked(runAvatarGeneration).mock.calls[1][0].prompt).toContain("LEFT edge");
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.left?.url).toBe("https://storage.googleapis.com/b/left.png");
    expect(patch.sheet).toEqual(STRIP);
    expect(patch.sheetStale).toBe(false);
    const json = await res.json();
    expect(json).toMatchObject({ creditsCharged: 40, spentCredits: 40, failed: [] });
  });

  it("remakes only the view asked for when the sheet is current, and recomposes the strip", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetViews: makeViews() }));
    const { POST } = await import("./route");
    await POST(post({ modelId: NB2, views: ["left"] }), { params });
    expect(generatedViews()).toEqual(["left"]);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.front).toEqual(makeViews().front);
    expect(patch.sheetViews?.left?.url).toBe("https://storage.googleapis.com/b/left.png");
    expect(composeSheetStrip).toHaveBeenCalledTimes(1);
  });

  it("makes all four when the views show an older front, even if one was asked for", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetViews: makeViews(), sheetStale: true }));
    const { POST } = await import("./route");
    await POST(post({ modelId: NB2, views: ["left"] }), { params });
    expect(generatedViews()).toEqual(["front", "left", "right", "back"]);
  });

  it("keeps the views that succeeded when one fails, names it, and composes nothing", async () => {
    vi.mocked(runAvatarGeneration).mockImplementation(async (args) => {
      if (args.view === "back") throw new Error("Content blocked");
      return { generation: rowFor(args.view!) as never, creditsCharged: 10 };
    });
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.front).not.toBeNull();
    expect(patch.sheetViews?.back).toBeNull();
    expect(patch.sheet).toBeNull();
    expect(composeSheetStrip).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.creditsCharged).toBe(30);
    expect(json.failed).toEqual([{ view: "back", label: "Back", error: "Content blocked" }]);
  });

  it("answers 402 when every view hits the credit cap, and leaves the avatar alone", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(402);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("still saves the views when composing the strip fails", async () => {
    vi.mocked(composeSheetStrip).mockRejectedValue(new Error("fetch failed"));
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.back).not.toBeNull();
    expect(patch.sheet).toBeNull();
  });

  it("is a 400 for a model that is not in the registry, before touching the avatar", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "nope:none" }), { params });
    expect(res.status).toBe(400);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("is a 400 for an unknown view", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2, views: ["top"] }), { params })).status).toBe(400);
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
