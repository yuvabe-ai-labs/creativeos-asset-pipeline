import { describe, expect, it, vi } from "vitest";
import { RUN_STOPPED_MESSAGE, settleDeadTranscribeJob } from "../transcribe-recovery";

const job = (o: Record<string, unknown> = {}) =>
  ({ id: "job1", status: "queued", trigger_run_id: "run_1", input: { orgId: "o", generationId: "g" }, ...o }) as never;
const deps = (runStatus: string | Error) => ({
  retrieveRun: vi.fn(async () => {
    if (runStatus instanceof Error) throw runStatus;
    return { status: runStatus };
  }),
  failJob: vi.fn(async () => {}),
  refund: vi.fn(async () => {}),
  failGeneration: vi.fn(async () => {}),
});

describe("settleDeadTranscribeJob", () => {
  it.each(["SYSTEM_FAILURE", "CRASHED", "FAILED", "TIMED_OUT", "EXPIRED", "CANCELED"])("settles a job whose run ended %s: failed, refunded", async (status) => {
    const d = deps(status);
    expect(await settleDeadTranscribeJob(job(), d)).toBe(true);
    expect(d.failJob).toHaveBeenCalledWith("job1", RUN_STOPPED_MESSAGE);
    expect(d.refund).toHaveBeenCalledWith({ orgId: "o", generationId: "g" });
    expect(d.failGeneration).toHaveBeenCalledWith({ generationId: "g", error: `run ${status}` });
  });

  it.each(["QUEUED", "EXECUTING", "DEQUEUED", "WAITING", "PENDING_VERSION", "DELAYED", "COMPLETED"])("leaves a job alone while its run is %s", async (status) => {
    const d = deps(status);
    expect(await settleDeadTranscribeJob(job(), d)).toBe(false);
    expect(d.failJob).not.toHaveBeenCalled();
  });

  it("leaves finished jobs, jobs with no run yet, and unreadable runs alone", async () => {
    const d = deps("SYSTEM_FAILURE");
    expect(await settleDeadTranscribeJob(job({ status: "failed" }), d)).toBe(false);
    expect(await settleDeadTranscribeJob(job({ trigger_run_id: null }), d)).toBe(false);
    expect(d.retrieveRun).not.toHaveBeenCalled();
    expect(await settleDeadTranscribeJob(job(), deps(new Error("network")))).toBe(false);
  });
});
