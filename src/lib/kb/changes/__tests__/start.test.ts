import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/jobs/db", () => ({ insertJob: vi.fn(), setJobRunId: vi.fn(), failJob: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { getClientById } from "@/lib/db/clients";
import { failJob, insertJob, setJobRunId } from "@/lib/jobs/db";
import { startKbProposal } from "../start";

const input = { added: [{ id: "d1", name: "guide.pdf" }], removed: [] };

describe("startKbProposal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "o1" } as never);
    vi.mocked(insertJob).mockResolvedValue({ id: "j1" } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("inserts one job named for what it reads, and triggers one run", async () => {
    vi.mocked(tasks.trigger).mockResolvedValue({ id: "run_1" } as never);
    await startKbProposal("c1", "u1", input);
    expect(insertJob).toHaveBeenCalledWith({ orgId: "o1", clientId: "c1", kind: "kb-propose", input, phaseMessage: "Reading guide.pdf…", createdBy: "u1" });
    expect(tasks.trigger).toHaveBeenCalledWith("kb-propose", { jobId: "j1" });
    expect(setJobRunId).toHaveBeenCalledWith("j1", "run_1");
  });

  it("fails the job when the run cannot be started, so nothing waits on it", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("down"));
    await startKbProposal("c1", "u1", input);
    expect(failJob).toHaveBeenCalledWith("j1", "Could not start reading guide.pdf.");
  });

  it("starts nothing when there is nothing to read", async () => {
    await startKbProposal("c1", "u1", { added: [], removed: [] });
    expect(insertJob).not.toHaveBeenCalled();
  });
});
