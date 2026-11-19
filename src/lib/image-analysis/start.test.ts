import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/image-cards", () => ({ countImageCoverage: vi.fn() }));
vi.mock("@/lib/jobs/db", () => ({ failJob: vi.fn(), failStaleJobs: vi.fn(), insertJob: vi.fn(), listRecentJobs: vi.fn(), setJobRunId: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/job-failed", () => ({ sayJobFailed: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { getClientById } from "@/lib/db/clients";
import { failJob, insertJob } from "@/lib/jobs/db";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import { startImageAnalysis } from "./start";

describe("startImageAnalysis, when the run cannot be queued", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-1" } as never);
    vi.mocked(insertJob).mockResolvedValue({ id: "job-1" } as never);
  });

  it("fails the job and says so once in the copilot thread (D506)", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("trigger down"));
    await startImageAnalysis("client-1", null, { force: true } as never);
    expect(failJob).toHaveBeenCalledWith("job-1", expect.any(String));
    expect(sayJobFailed).toHaveBeenCalledWith({ client_id: "client-1", kind: "image-analysis", input: { force: true } });
  });

  it("says nothing when the run was queued", async () => {
    vi.mocked(tasks.trigger).mockResolvedValue({ id: "run-1" } as never);
    await startImageAnalysis("client-1");
    expect(sayJobFailed).not.toHaveBeenCalled();
  });
});
