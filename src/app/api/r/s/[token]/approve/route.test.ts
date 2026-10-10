// src/app/api/r/s/[token]/approve/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ getScriptReviewByToken: vi.fn(), approveVersion: vi.fn() }));

import { approveVersion, getScriptReviewByToken } from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const params = Promise.resolve({ token: TOKEN });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/r/s/${TOKEN}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const review = {
  id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};

describe("POST /api/r/s/[token]/approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
  });

  it("approves the version on screen under the typed name", async () => {
    vi.mocked(approveVersion).mockResolvedValue("ok");
    const { POST } = await import("./route");
    const res = await POST(post({ approverName: " Priya ", versionNumber: 3 }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approved: true });
    expect(approveVersion).toHaveBeenCalledWith({ reviewId: "r1", versionNumber: 3, actorName: "Priya" });
  });

  it("answers a second tap with success, not an error (Review Focus 5)", async () => {
    vi.mocked(approveVersion).mockResolvedValue("already");
    const { POST } = await import("./route");
    expect((await POST(post({ approverName: "Priya", versionNumber: 3 }), { params })).status).toBe(200);
  });

  it("refuses a version the client is not looking at any more (Review Focus 1)", async () => {
    vi.mocked(approveVersion).mockResolvedValue("stale");
    const { POST } = await import("./route");
    const res = await POST(post({ approverName: "Priya", versionNumber: 2 }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("A newer version was shared. Reload to see it.");
  });

  it("refuses a partial share and a script not In review", async () => {
    const { POST } = await import("./route");
    vi.mocked(approveVersion).mockResolvedValue("partial");
    expect((await POST(post({ approverName: "Priya", versionNumber: 1 }), { params })).status).toBe(409);
    vi.mocked(approveVersion).mockResolvedValue("not_in_review");
    expect((await POST(post({ approverName: "Priya", versionNumber: 1 }), { params })).status).toBe(409);
  });

  it("400s a missing name", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ approverName: "", versionNumber: 1 }), { params })).status).toBe(400);
    expect(approveVersion).not.toHaveBeenCalled();
  });
});
