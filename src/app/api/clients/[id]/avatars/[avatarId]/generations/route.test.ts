import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { AVATAR_FRAMING_CLAUSE } from "@/lib/avatars/constants";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ listAvatarGenerations: vi.fn(), sumAvatarCredits: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});
vi.mock("@/lib/avatars/generate", () => ({ runAvatarGeneration: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { listAvatarGenerations, sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const url = "http://localhost/api/clients/c1/avatars/a1/generations";
const post = (body: unknown) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const row = {
  id: "g1", status: "succeeded", model_used: "seedream:seedream-5-0-lite",
  inputs_snapshot: { slot: "front", prompt: "p", batchId: "b1", referenceUrls: [] },
  output_snapshot: "https://storage.googleapis.com/b/x.png", meta: { width: 1, height: 2, sizeBytes: 3 },
  created_at: "2026-09-30T10:00:00.000Z",
};
const body = {
  description: "A chef.", attributes: { gender: "Male" }, styleId: "photoreal",
  modelId: "seedream:seedream-5-0-lite", batchId: "b1",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
  vi.mocked(runAvatarGeneration).mockResolvedValue({ generation: row as never, creditsCharged: 35 });
});

describe("GET generations", () => {
  it("returns only front candidates, and the credits spent on this avatar", async () => {
    vi.mocked(listAvatarGenerations).mockResolvedValue([
      row,
      { ...row, id: "g2", inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] } },
      { ...row, id: "g3", status: "failed", output_snapshot: null },
    ] as never);
    vi.mocked(sumAvatarCredits).mockResolvedValue(95);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(url), { params });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.candidates.map((c: { generationId: string }) => c.generationId)).toEqual(["g1"]);
    expect(json.spentCredits).toBe(95);
  });

  it("is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(url), { params })).status).toBe(404);
    expect(listAvatarGenerations).not.toHaveBeenCalled();
  });
});

describe("POST generations", () => {
  it("generates one front candidate with the framing the operator cannot remove", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(body), { params });
    expect(res.status).toBe(201);
    const call = vi.mocked(runAvatarGeneration).mock.calls[0][0];
    expect(call).toMatchObject({
      clientId: "c1", avatarId: "a1", orgId: "org-1", userId: "user-9", userEmail: "op@x.com",
      slot: "front", modelId: "seedream:seedream-5-0-lite", aspect: "3:4", referenceUrls: [], batchId: "b1",
    });
    expect(call.prompt.startsWith("A chef.")).toBe(true);
    expect(call.prompt.endsWith(AVATAR_FRAMING_CLAUSE)).toBe(true);
    const json = await res.json();
    expect(json.candidate.generationId).toBe("g1");
    expect(json.creditsCharged).toBe(35);
  });

  it("rejects an empty description and an unknown style before spending anything", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ ...body, description: "  " }), { params })).status).toBe(400);
    expect((await POST(post({ ...body, styleId: "oil-painting" }), { params })).status).toBe(400);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("is a 404 for an archived avatar", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ archivedAt: "2026-10-01T00:00:00.000Z" }));
    const { POST } = await import("./route");
    expect((await POST(post(body), { params })).status).toBe(404);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("answers 402 with the actionable message at the credit cap", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    const res = await POST(post(body), { params });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/Monthly credit limit reached\. Contact your admin/);
  });

  it("passes a provider failure through as a 500 with its message", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new Error("Content blocked"));
    const { POST } = await import("./route");
    const res = await POST(post(body), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Content blocked");
  });
});
