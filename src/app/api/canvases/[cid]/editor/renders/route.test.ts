import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "u1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cv1", client_id: "cl1", name: "Reel 2", clients: { org_id: "org-1" } }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/editor/plan-saved-reel", () => ({ planSavedReel: vi.fn() }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/jobs/db", () => ({ insertJob: vi.fn(), failStaleJobs: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn(), getJob: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { getJob, insertJob } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { planSavedReel } from "@/lib/editor/plan-saved-reel";
import { POST } from "./route";
import { GET } from "./[jobId]/route";

const NODE = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ cid: "cv1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(planSavedReel).mockResolvedValue({ ok: true, plan: { name: "p" } as never, orgId: "org-1" });
  vi.mocked(insertJob).mockResolvedValue({ id: "job1" } as never);
  vi.mocked(tasks.trigger).mockResolvedValue({ id: "run1" } as never);
});

describe("POST /api/canvases/[cid]/editor/renders", () => {
  it("starts a render of the saved reel with the chosen options", async () => {
    const res = await post({ nodeId: NODE, quality: "quick", captions: false });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job1" });
    expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: "editor-render",
      lockKey: `editor-render:${NODE}`,
      input: { canvasId: "cv1", nodeId: NODE, clientId: "cl1", plan: { name: "p" }, options: { quality: "quick", captions: false } },
    }));
    expect(tasks.trigger).toHaveBeenCalledWith("editor-render", { jobId: "job1" });
  });

  it("refuses bad options", async () => {
    expect((await post({ nodeId: NODE, quality: "4k", captions: true })).status).toBe(400);
  });

  it("passes on why the reel can't be planned", async () => {
    vi.mocked(planSavedReel).mockResolvedValue({ ok: false, status: 422, reason: "Add a clip to the timeline first." });
    const res = await post({ nodeId: NODE, quality: "full", captions: true });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Add a clip to the timeline first." });
  });

  it("refuses a second render while one runs", async () => {
    vi.mocked(insertJob).mockRejectedValue(new JobLockedError(`editor-render:${NODE}`));
    expect((await post({ nodeId: NODE, quality: "full", captions: true })).status).toBe(409);
  });
});

describe("GET /api/canvases/[cid]/editor/renders/[jobId]", () => {
  it("shows only this canvas's renders", async () => {
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-render", status: "running", phase_message: "Rendering… 40%", error: null, result: null, input: { canvasId: "cv1" } } as never);
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ cid: "cv1", jobId: "job1" }) });
    expect(await ok.json()).toEqual({ status: "running", phase: "Rendering… 40%", error: null, result: null });
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-export", input: { canvasId: "cv1" } } as never);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ cid: "cv1", jobId: "job1" }) })).status).toBe(404);
  });
});
