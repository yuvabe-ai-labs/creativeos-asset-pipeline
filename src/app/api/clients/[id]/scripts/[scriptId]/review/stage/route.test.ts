// src/app/api/clients/[id]/scripts/[scriptId]/review/stage/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ moveScriptStage: vi.fn() }));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));
vi.mock("@/lib/script-review/share-now", () => ({ shareNow: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { moveScriptStage } from "@/lib/db/script-reviews";
import { teamActorName } from "@/lib/script-review/actor";
import { shareNow } from "@/lib/script-review/share-now";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/stage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script = (stage: Script["stage"]): Script => ({ id: SCRIPT_ID, clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });

describe("POST …/review/stage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
  });

  it("moves a Visualise script to In review, records who, and shares the script as it is now", async () => {
    vi.mocked(getScript).mockResolvedValue(script("visualise"));
    vi.mocked(moveScriptStage).mockResolvedValue(true);
    const version = { number: 2, scope: "panels", sharedAt: "2026-10-09T10:00:00.000Z" };
    vi.mocked(shareNow).mockResolvedValue({ ok: true, version: version as never, shareToken: "tok" });
    const { POST } = await import("./route");
    const res = await POST(post({ move: "to_review", scope: "panels" }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stage: "in_review", version, shareToken: "tok" });
    expect(vi.mocked(shareNow).mock.calls[0][0]).toMatchObject({ clientId: "c1", scope: "panels", script: { id: SCRIPT_ID } });
    expect(moveScriptStage).toHaveBeenCalledWith({
      scriptId: SCRIPT_ID, clientId: "c1", from: "visualise", to: "in_review", event: "moved_to_review", actorName: "Arun",
    });
  });

  it("refuses a move from the wrong stage without writing", async () => {
    vi.mocked(getScript).mockResolvedValue(script("generate"));
    const { POST } = await import("./route");
    const res = await POST(post({ move: "to_review", scope: "script" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Move to In review works from Visualise; this script is at Generate.");
    expect(moveScriptStage).not.toHaveBeenCalled();
  });

  it("says so when the move landed but the share did not, so the team can press Share", async () => {
    vi.mocked(getScript).mockResolvedValue(script("visualise"));
    vi.mocked(moveScriptStage).mockResolvedValue(true);
    vi.mocked(shareNow).mockResolvedValue({ ok: false, error: "Someone else shared a version just now.", status: 409 });
    const { POST } = await import("./route");
    const res = await POST(post({ move: "to_review", scope: "script" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Moved to In review, but the share did not go through: Someone else shared a version just now. Press Share to send it.");
  });

  it("never shares on the other moves", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(moveScriptStage).mockResolvedValue(true);
    const { POST } = await import("./route");
    expect(await (await POST(post({ move: "back_to_visualise" }), { params })).json()).toEqual({ stage: "visualise" });
    expect(shareNow).not.toHaveBeenCalled();
  });

  it("400s approve, which is never a team move", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ move: "approve" }), { params })).status).toBe(400);
  });

  it("409s when someone else moved it first", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(moveScriptStage).mockResolvedValue(false);
    const { POST } = await import("./route");
    expect((await POST(post({ move: "back_to_visualise" }), { params })).status).toBe(409);
  });
});
