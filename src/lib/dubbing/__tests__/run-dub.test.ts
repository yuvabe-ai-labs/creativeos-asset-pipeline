import { describe, it, expect, vi } from "vitest";
import { runDub, type DubRunDeps } from "../run-dub";
import { DubbingFinalError } from "../poll";
import { DUB_FAILED_MESSAGE, DUB_NO_SPEECH_MESSAGE, DUB_TIMEOUT_MESSAGE } from "../copy";

const P = { generationId: "g1", sourceUrl: "https://src.mp4", targetLang: "hi-IN", dubbedPutUrl: "https://put/v", dubbedAudioPutUrl: "https://put/a" };
// What the vendor really lists: the dubbed video only (no audio exports, 2026-10-15 run).
const DONE = [
  { exportType: "video", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/v" },
];

function deps(over: Partial<DubRunDeps> = {}): DubRunDeps {
  let t = 0;
  return {
    fetchBytes: vi.fn(async (url: string) => Buffer.from(url)),
    createJob: vi.fn(async () => ({ jobId: "dub_1", uploadUrl: "https://blob/up" })),
    upload: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    liveStatus: vi.fn(async () => ({ status: "completed" as const, progress: 100, stepLabel: null, errorMessage: null })),
    exports: vi.fn(async () => DONE),
    extractAudio: vi.fn(async (video: Buffer) => Buffer.concat([Buffer.from("mp3:"), video])),
    putBytes: vi.fn(async () => undefined),
    sleep: vi.fn(async (s: number) => { t += s * 1000; }),
    now: () => t,
    ...over,
  } as DubRunDeps;
}

describe("runDub", () => {
  it("creates, uploads and starts once, then stores the dubbed video and the mp3 taken from it", async () => {
    const d = deps();
    expect(await runDub(P, d)).toEqual({ vendorJobId: "dub_1" });
    expect(d.createJob).toHaveBeenCalledWith({ srcLang: "en-IN", targetLang: "hi-IN", jobName: "g1" });
    expect(d.upload).toHaveBeenCalledWith("https://blob/up", Buffer.from("https://src.mp4"), "video/mp4");
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.putBytes).toHaveBeenCalledWith("https://put/v", Buffer.from("https://dl/v"), "video/mp4");
    expect(d.extractAudio).toHaveBeenCalledWith(Buffer.from("https://dl/v"));
    expect(d.putBytes).toHaveBeenCalledWith("https://put/a", Buffer.from("mp3:https://dl/v"), "audio/mpeg");
  });

  it("needs only the video export, whatever else is listed", async () => {
    const exports = vi.fn(async () => [{ exportType: "srt", targetLanguage: "hi-IN", status: "in_progress", downloadUrl: null }, ...DONE]);
    await expect(runDub(P, deps({ exports }))).resolves.toEqual({ vendorJobId: "dub_1" });
  });

  it("fails for good when the audio can't be taken from the dubbed video", async () => {
    const d = deps({ extractAudio: vi.fn(async () => { throw new Error("no audio stream"); }) });
    await expect(runDub(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_FAILED_MESSAGE }));
    expect(d.putBytes).not.toHaveBeenCalled();
  });

  it("retries a flaky status poll in place and never starts a second job", async () => {
    const liveStatus = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "in_progress", progress: 50, stepLabel: null, errorMessage: null })
      .mockResolvedValue({ status: "completed", progress: 100, stepLabel: null, errorMessage: null });
    const d = deps({ liveStatus });
    await runDub(P, d);
    expect(d.createJob).toHaveBeenCalledTimes(1);
    expect(d.start).toHaveBeenCalledTimes(1);
  });

  it("waits for the video export to finish", async () => {
    const exports = vi.fn()
      .mockResolvedValueOnce([{ ...DONE[0], status: "in_progress", downloadUrl: null }])
      .mockResolvedValue(DONE);
    const d = deps({ exports });
    await runDub(P, d);
    expect(exports).toHaveBeenCalledTimes(2);
  });

  it("fails for good with plain copy when the job fails", async () => {
    const d = deps({ liveStatus: vi.fn(async () => ({ status: "failed" as const, progress: 10, stepLabel: null, errorMessage: "No speech detected in audio" })) });
    await expect(runDub(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_NO_SPEECH_MESSAGE }));
    const d2 = deps({ liveStatus: vi.fn(async () => ({ status: "failed" as const, progress: 10, stepLabel: null, errorMessage: "boom" })) });
    await expect(runDub(P, d2)).rejects.toBeInstanceOf(DubbingFinalError);
    await expect(runDub(P, deps({ liveStatus: d2.liveStatus }))).rejects.toEqual(expect.objectContaining({ userMessage: DUB_FAILED_MESSAGE }));
  });

  it("gives up after the poll timeout", async () => {
    const d = deps({ liveStatus: vi.fn(async () => ({ status: "in_progress" as const, progress: 1, stepLabel: null, errorMessage: null })) });
    await expect(runDub(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_TIMEOUT_MESSAGE }));
    expect(d.start).toHaveBeenCalledTimes(1);
  });
});

describe("runDub logging", () => {
  it("logs the vendor job id and each status change once", async () => {
    const log = vi.fn();
    const liveStatus = vi.fn()
      .mockResolvedValueOnce({ status: "in_progress", progress: 10, stepLabel: "Translating", errorMessage: null })
      .mockResolvedValueOnce({ status: "in_progress", progress: 10, stepLabel: "Translating", errorMessage: null })
      .mockResolvedValue({ status: "completed", progress: 100, stepLabel: null, errorMessage: null });
    await runDub(P, deps({ liveStatus, log }));
    expect(log).toHaveBeenCalledWith("Dub job started", { jobId: "dub_1", targetLang: "hi-IN" });
    expect(log.mock.calls.filter((c) => c[0] === "Dub job status")).toHaveLength(2);
    expect(log).toHaveBeenCalledWith("Dub stored", expect.objectContaining({ jobId: "dub_1" }));
  });
});
