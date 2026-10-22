import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(async () => ({ userId: "u1", email: "a@b.c", orgId: "org-1", orgRole: "owner" })),
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
vi.mock("@/lib/editor/transcribe-plan", () => ({ planTranscription: vi.fn() }));
vi.mock("@/lib/db/media-transcripts", () => ({ listTranscribedUrls: vi.fn(), listTranscripts: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), failGeneration: vi.fn(async () => {}) }));
vi.mock("@/lib/db/credit-transactions", () => ({
  reserveCredits: vi.fn(),
  refundReservation: vi.fn(async () => {}),
  CreditLimitError: class CreditLimitError extends Error {},
}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/jobs/db", () => ({ insertJob: vi.fn(), failStaleJobs: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn(), getJob: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { refundReservation, reserveCredits } from "@/lib/db/credit-transactions";
import { insertGeneration } from "@/lib/db/generations";
import { listTranscribedUrls, listTranscripts } from "@/lib/db/media-transcripts";
import { loadEditorState } from "@/lib/editor/load-state";
import { planTranscription } from "@/lib/editor/transcribe-plan";
import { failJob, getJob, insertJob } from "@/lib/jobs/db";
import { JobLockedError } from "@/lib/jobs/types";
import { GET as getTranscripts } from "../transcripts/route";
import { GET as getStatus } from "./[jobId]/route";
import { POST } from "./route";

const NODE = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ cid: "cv1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ELEVEN_LABS_API_KEY = "k";
  vi.mocked(loadEditorState).mockResolvedValue({ editorNodeId: NODE, doc: {}, sources: [] } as never);
  vi.mocked(planTranscription).mockReturnValue({ files: [{ url: "https://s/a.mp4", seconds: 8 }, { url: "https://s/b.mp4", seconds: 9 }], noSound: [] });
  vi.mocked(listTranscribedUrls).mockResolvedValue(new Set());
  vi.mocked(insertGeneration).mockResolvedValue({ id: "gen1" } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  vi.mocked(insertJob).mockResolvedValue({ id: "job1" } as never);
  vi.mocked(tasks.trigger).mockResolvedValue({ id: "run1" } as never);
});

describe("POST /api/canvases/[cid]/editor/transcribe", () => {
  it("needs no job when every file is already transcribed", async () => {
    vi.mocked(listTranscribedUrls).mockResolvedValue(new Set(["https://s/a.mp4", "https://s/b.mp4"]));
    const res = await post({ nodeId: NODE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jobId: null, noSound: [] });
    expect(insertGeneration).not.toHaveBeenCalled();
  });

  it("reserves for the new files only and starts the task with the job id", async () => {
    vi.mocked(listTranscribedUrls).mockResolvedValue(new Set(["https://s/a.mp4"]));
    const res = await post({ nodeId: NODE, pieceIds: ["p1"] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job1", noSound: [] });
    expect(planTranscription).toHaveBeenCalledWith({}, [], ["p1"]);
    expect(vi.mocked(insertGeneration).mock.calls[0][0]).toMatchObject({ nodeId: NODE, type: "transcribe", userId: "u1", paramsSnapshot: { seconds: 9 } });
    expect(vi.mocked(insertJob).mock.calls[0][0]).toMatchObject({
      kind: "editor-transcribe",
      lockKey: `editor-transcribe:${NODE}`,
      input: { canvasId: "cv1", nodeId: NODE, generationId: "gen1", orgId: "org-1", files: [{ url: "https://s/b.mp4", seconds: 9 }] },
    });
    expect(tasks.trigger).toHaveBeenCalledWith("editor-transcribe", { jobId: "job1" });
  });

  it("402s at the credit limit and gives the reservation back", async () => {
    vi.mocked(reserveCredits).mockResolvedValue({ ok: false });
    expect((await post({ nodeId: NODE })).status).toBe(402);
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen1" });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("409s while a run is going", async () => {
    vi.mocked(insertJob).mockRejectedValue(new JobLockedError(`editor-transcribe:${NODE}`));
    expect((await post({ nodeId: NODE })).status).toBe(409);
    expect(refundReservation).toHaveBeenCalled();
  });

  it("fails the job and refunds when the task can't start", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("down"));
    expect((await post({ nodeId: NODE })).status).toBe(502);
    expect(failJob).toHaveBeenCalledWith("job1", "Couldn't start captions. Try again.");
    expect(refundReservation).toHaveBeenCalled();
  });

  it("404s for another node, 400s for bad pieceIds, 400s when not set up", async () => {
    expect((await post({ nodeId: "22222222-2222-4222-8222-222222222222" })).status).toBe(404);
    expect((await post({ nodeId: NODE, pieceIds: [1] })).status).toBe(400);
    delete process.env.ELEVEN_LABS_API_KEY;
    expect((await post({ nodeId: NODE })).status).toBe(400);
  });
});

describe("GET /api/canvases/[cid]/editor/transcribe/[jobId]", () => {
  const get = () => getStatus(new Request("http://x"), { params: Promise.resolve({ cid: "cv1", jobId: "job1" }) });

  it("404s for a job on another canvas or of another kind", async () => {
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-transcribe", input: { canvasId: "other" } } as never);
    expect((await get()).status).toBe(404);
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-export", input: { canvasId: "cv1" } } as never);
    expect((await get()).status).toBe(404);
  });

  it("returns the run's status", async () => {
    vi.mocked(getJob).mockResolvedValue({ kind: "editor-transcribe", status: "succeeded", error: null, result: { failed: [] }, input: { canvasId: "cv1" } } as never);
    expect(await (await get()).json()).toEqual({ status: "succeeded", error: null, result: { failed: [] } });
  });
});

describe("GET /api/canvases/[cid]/editor/transcripts", () => {
  it("returns the stored transcripts for the reel's sound files", async () => {
    vi.mocked(listTranscripts).mockResolvedValue(new Map([["https://s/a.mp4", { url: "https://s/a.mp4", language: "eng", words: [], engine: "e", model: "m", durationSeconds: 8 }]]));
    const res = await getTranscripts(new Request("http://x"), { params: Promise.resolve({ cid: "cv1" }) });
    expect(listTranscripts).toHaveBeenCalledWith(["https://s/a.mp4", "https://s/b.mp4"]);
    expect((await res.json()).transcripts).toHaveLength(1);
  });
});
