// src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { content, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ getLatestVersion: vi.fn(), shareVersion: vi.fn() }));
vi.mock("@/lib/script-review/ensure-review", () => ({ ensureScriptReview: vi.fn() }));
vi.mock("@/lib/script-review/visuals", () => ({ collectVisuals: vi.fn() }));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, shareVersion } from "@/lib/db/script-reviews";
import { ensureScriptReview } from "@/lib/script-review/ensure-review";
import { collectVisuals } from "@/lib/script-review/visuals";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/share`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script = (stage: Script["stage"]): Script => ({ id: SCRIPT_ID, clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });
const review = { id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: "6f1c", created_by: "u1", created_at: "t" };
const NO_VISUALS = { avatars: {}, panels: {} };

describe("POST …/review/share", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
    vi.mocked(ensureScriptReview).mockResolvedValue(review);
    vi.mocked(collectVisuals).mockResolvedValue(NO_VISUALS);
  });

  it("is only offered In review (spec 4 §3)", async () => {
    vi.mocked(getScript).mockResolvedValue(script("visualise"));
    const { POST } = await import("./route");
    const res = await POST(post({ scope: "script" }), { params });
    expect(res.status).toBe(409);
    expect(ensureScriptReview).not.toHaveBeenCalled();
  });

  it("shares version 1 with no changes, and returns the link's code", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(getLatestVersion).mockResolvedValue(null);
    vi.mocked(shareVersion).mockResolvedValue({ status: "ok", version: { ...content(), id: "v1", number: 1, sharedAt: "t1" } });
    const { POST } = await import("./route");
    const res = await POST(post({ scope: "script" }), { params });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ version: { number: 1, scope: "script", sharedAt: "t1" }, shareToken: "6f1c" });
    expect(shareVersion).toHaveBeenCalledWith(expect.objectContaining({
      reviewId: "r1", expectedLatest: 0, scope: "script", changes: [], sharedBy: "u1", actorName: "Arun", visuals: NO_VISUALS,
    }));
    expect(collectVisuals).toHaveBeenCalledWith("c1", expect.objectContaining({ id: SCRIPT_ID }), "script");
  });

  it("names what changed against the version before", async () => {
    const live = script("in_review");
    live.doc.shots[0].vo = "Edited after version 1";
    vi.mocked(getScript).mockResolvedValue(live);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v1", number: 1, sharedAt: "t1" });
    vi.mocked(shareVersion).mockResolvedValue({ status: "ok", version: { ...content(), id: "v2", number: 2, sharedAt: "t2" } });
    const { POST } = await import("./route");
    await POST(post({ scope: "script" }), { params });
    expect(vi.mocked(shareVersion).mock.calls[0][0]).toMatchObject({
      expectedLatest: 1,
      changes: [{ part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" }],
    });
  });

  it("409s when another share landed first", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(getLatestVersion).mockResolvedValue(null);
    vi.mocked(shareVersion).mockResolvedValue({ status: "stale" });
    const { POST } = await import("./route");
    const res = await POST(post({ scope: "panels" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Someone else shared a version just now. Reload, then share again.");
  });

  it("400s an unknown scope", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ scope: "everything" }), { params })).status).toBe(400);
  });
});
