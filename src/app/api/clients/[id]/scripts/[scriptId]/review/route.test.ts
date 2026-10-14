// src/app/api/clients/[id]/scripts/[scriptId]/review/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { event, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ getScriptReviewForScript: vi.fn() }));
vi.mock("@/lib/script-review/load", () => ({ loadReviewState: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadReviewState } from "@/lib/script-review/load";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review`);
const script = (stage: Script["stage"]): Script => ({ id: SCRIPT_ID, clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });

describe("GET …/review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  });

  it("answers before the first share with the stage and no link", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    vi.mocked(loadReviewState).mockResolvedValue({ versions: [], comments: [], events: [event({ kind: "moved_to_review", versionNumber: null, scope: null })] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const { review } = await res.json();
    expect(review).toMatchObject({ stage: "in_review", shareToken: null, latest: null });
    expect(loadReviewState).toHaveBeenCalledWith(null, SCRIPT_ID);
  });

  it("404s another client's script", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(req(), { params })).status).toBe(404);
    expect(getScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
  });
});
