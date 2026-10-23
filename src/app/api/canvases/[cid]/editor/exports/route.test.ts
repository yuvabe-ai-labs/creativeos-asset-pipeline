import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "u1", orgId: "org-1", orgRole: "owner" })),
  resolveOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cv1", client_id: "cl1", clients: { org_id: "org-1" } }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/editor/load-state", () => ({ loadEditorState: vi.fn() }));
vi.mock("@/lib/editor/sequence-plan", () => ({ planSequence: vi.fn() }));
vi.mock("@/lib/editor/transcribe-plan", () => ({ planTranscription: vi.fn(() => ({ files: [], noSound: [] })) }));
vi.mock("@/lib/db/media-transcripts", () => ({ listTranscripts: vi.fn(async () => new Map()) }));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/jobs/db", () => ({
  insertJob: vi.fn(), failStaleJobs: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn(), getJob: vi.fn(),
}));

import { tasks } from "@trigger.dev/sdk";
import { failJob, getJob, insertJob } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { loadEditorState } from "@/lib/editor/load-state";
import { planSequence } from "@/lib/editor/sequence-plan";
import { POST } from "./route";
import { GET } from "./[jobId]/route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ cid: "cv1" }) });
const NODE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(loadEditorState).mockResolvedValue({ editorNodeId: NODE, doc: {}, sources: [] } as never);
  vi.mocked(planSequence).mockReturnValue({ ok: true, plan: { name: "p" } } as never);
  vi.mocked(insertJob).mockResolvedValue({ id: "job1" } as never);
  vi.mocked(tasks.trigger).mockReset().mockResolvedValue({ id: "run1" } as never);
});

describe("POST /api/canvases/[cid]/editor/exports", () => {
  it("passes on the plan's reason", async () => {
    vi.mocked(planSequence).mockReturnValue({ ok: false, reason: "Add a clip to the timeline first." });
    const res = await post({ nodeId: NODE });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Add a clip to the timeline first." });
    expect(insertJob).not.toHaveBeenCalledWith(expect.anything());
  });

  it("404s for a node that isn't this canvas's Editor", async () => {
    expect((await post({ nodeId: "22222222-2222-4222-8222-222222222222" })).status).toBe(404);
  });

  it("refuses a second export while one runs", async () => {
    vi.mocked(insertJob).mockRejectedValue(new JobLockedError(`editor-export:${NODE}`));
    const res = await post({ nodeId: NODE });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "An export of this reel is already running." });
  });

  it("starts the task with the job id only", async () => {
    const res = await post({ nodeId: NODE });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job1" });
    expect(tasks.trigger).toHaveBeenCalledWith("editor-export", { jobId: "job1" });
    expect(vi.mocked(insertJob).mock.calls.at(-1)![0]).toMatchObject({
      orgId: "org-1", clientId: "cl1", kind: "editor-export", lockKey: `editor-export:${NODE}`,
      input: { canvasId: "cv1", nodeId: NODE, clientId: "cl1", plan: { name: "p" } },
    });
  });

  it("fails the job when the task can't start", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("down"));
    expect((await post({ nodeId: NODE })).status).toBe(502);
    expect(failJob).toHaveBeenCalledWith("job1", "Couldn't start the export. Try again.");
  });
});

describe("GET /api/canvases/[cid]/editor/exports/[jobId]", () => {
  const get = () => GET(new Request("http://x"), { params: Promise.resolve({ cid: "cv1", jobId: "job1" }) });

  it("404s for a job on another canvas", async () => {
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-export", input: { canvasId: "other" } } as never);
    expect((await get()).status).toBe(404);
  });

  it("returns the job's status", async () => {
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-export", status: "running", phase_message: "Writing the sequence…", error: null, result: null, input: { canvasId: "cv1" } } as never);
    expect(await (await get()).json()).toEqual({ status: "running", phase: "Writing the sequence…", error: null, result: null });
  });
});
