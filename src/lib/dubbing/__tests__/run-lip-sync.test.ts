import { describe, it, expect, vi } from "vitest";
import { runLipSync, type LipSyncRunDeps } from "../run-lip-sync";
import { LIP_SYNC_FAILED_MESSAGE, DUB_TIMEOUT_MESSAGE } from "../copy";
import { FalHttpError } from "@/lib/fal/client";

const P = { videoUrl: "https://o.mp4", audioUrl: "https://a.mp3", model: "lipsync-2-pro", lipSyncedPutUrl: "https://put/l" };

function deps(over: Partial<LipSyncRunDeps> = {}): LipSyncRunDeps {
  let t = 0;
  return {
    submit: vi.fn(async () => ({ requestId: "r1", statusUrl: "https://q/s", responseUrl: "https://q/r" })),
    status: vi.fn(async () => "COMPLETED" as const),
    result: vi.fn(async () => ({ videoUrl: "https://out.mp4" })),
    fetchBytes: vi.fn(async (u: string) => Buffer.from(u)),
    putBytes: vi.fn(async () => undefined),
    sleep: vi.fn(async (s: number) => { t += s * 1000; }),
    now: () => t,
    ...over,
  } as LipSyncRunDeps;
}

describe("runLipSync", () => {
  it("submits once and stores the result", async () => {
    const d = deps({ status: vi.fn().mockResolvedValueOnce("IN_QUEUE").mockRejectedValueOnce(new Error("net")).mockResolvedValue("COMPLETED") });
    expect(await runLipSync(P, d)).toEqual({ vendorRequestId: "r1" });
    expect(d.submit).toHaveBeenCalledTimes(1);
    expect(d.submit).toHaveBeenCalledWith({ videoUrl: "https://o.mp4", audioUrl: "https://a.mp3", model: "lipsync-2-pro" });
    expect(d.putBytes).toHaveBeenCalledWith("https://put/l", Buffer.from("https://out.mp4"), "video/mp4");
  });

  it("a rejected result is final, with plain copy", async () => {
    const d = deps({ result: vi.fn(async () => { throw new FalHttpError(422, "face", "result"); }) });
    await expect(runLipSync(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: LIP_SYNC_FAILED_MESSAGE }));
    expect(d.submit).toHaveBeenCalledTimes(1);
  });

  it("times out", async () => {
    const d = deps({ status: vi.fn(async () => "IN_PROGRESS" as const) });
    await expect(runLipSync(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_TIMEOUT_MESSAGE }));
  });
});

describe("runLipSync logging", () => {
  it("logs the vendor request id and each status change once", async () => {
    const log = vi.fn();
    const status = vi.fn().mockResolvedValueOnce("IN_QUEUE").mockResolvedValueOnce("IN_QUEUE").mockResolvedValue("COMPLETED");
    await runLipSync(P, deps({ status, log }));
    expect(log).toHaveBeenCalledWith("Lip sync submitted", { requestId: "r1", model: "lipsync-2-pro" });
    expect(log.mock.calls.filter((c) => c[0] === "Lip sync status")).toHaveLength(2);
    expect(log).toHaveBeenCalledWith("Lip sync stored", expect.objectContaining({ requestId: "r1" }));
  });
});
