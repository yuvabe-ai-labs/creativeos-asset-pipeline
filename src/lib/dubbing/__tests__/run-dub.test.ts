import { describe, it, expect, vi } from "vitest";
import { runDub, type DubRunDeps } from "../run-dub";
import { DubbingFinalError } from "../poll";
import { DUB_FAILED_MESSAGE, DUB_NO_SPEECH_MESSAGE, DUB_TIMEOUT_MESSAGE } from "../copy";

const P = { generationId: "g1", sourceUrl: "https://src.mp4", targetLang: "hi-IN", style: "formal", dubbedPutUrl: "https://put/v", dubbedAudioPutUrl: "https://put/a" };
// Audio in, audio out: the vendor lists the dubbed audio (plus the SRT we do not use yet).
const DONE = [
  { exportType: "srt", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/s" },
  { exportType: "audio", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/a" },
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
    replaceAudio: vi.fn(async (video: Buffer, wav: Buffer) => Buffer.concat([video, Buffer.from("+"), wav])),
    putBytes: vi.fn(async () => undefined),
    sleep: vi.fn(async (s: number) => { t += s * 1000; }),
    now: () => t,
    ...over,
  } as DubRunDeps;
}

describe("runDub", () => {
  it("uploads only the clip's audio, starts once, and builds the dubbed video from the original picture", async () => {
    const d = deps();
    expect(await runDub(P, d)).toEqual({ vendorJobId: "dub_1" });
    expect(d.extractAudio).toHaveBeenCalledWith(Buffer.from("https://src.mp4"));
    expect(d.createJob).toHaveBeenCalledWith({ srcLang: "en-IN", targetLang: "hi-IN", register: "formal", jobName: "g1" });
    expect(d.upload).toHaveBeenCalledWith("https://blob/up", Buffer.from("mp3:https://src.mp4"), "audio/mpeg");
    expect(d.start).toHaveBeenCalledTimes(1);
    expect(d.replaceAudio).toHaveBeenCalledWith(Buffer.from("https://src.mp4"), Buffer.from("https://dl/a"));
    expect(d.putBytes).toHaveBeenCalledWith("https://put/v", Buffer.from("https://src.mp4+https://dl/a"), "video/mp4");
    expect(d.putBytes).toHaveBeenCalledWith("https://put/a", Buffer.from("https://dl/a"), "audio/wav");
  });

  it("takes the dubbed audio whether it is listed as audio or mp3", async () => {
    const exports = vi.fn(async () => [{ exportType: "mp3", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/m" }]);
    const d = deps({ exports });
    await runDub(P, d);
    expect(d.putBytes).toHaveBeenCalledWith("https://put/a", Buffer.from("https://dl/m"), "audio/wav");
  });

  it("refuses a clip with no audio before paying for anything", async () => {
    const d = deps({ extractAudio: vi.fn(async () => { throw new Error("no audio stream"); }) });
    await expect(runDub(P, d)).rejects.toEqual(expect.objectContaining({ userMessage: DUB_NO_SPEECH_MESSAGE }));
    expect(d.createJob).not.toHaveBeenCalled();
  });

  it("fails for good when the dubbed audio can't be laid into the video", async () => {
    const d = deps({ replaceAudio: vi.fn(async () => { throw new Error("ffmpeg"); }) });
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

  it("waits for the audio export to finish", async () => {
    const exports = vi.fn()
      .mockResolvedValueOnce([{ ...DONE[1], status: "in_progress", downloadUrl: null }])
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
    expect(log).toHaveBeenCalledWith("Dub job started", expect.objectContaining({ jobId: "dub_1", targetLang: "hi-IN" }));
    expect(log.mock.calls.filter((c) => c[0] === "Dub job status")).toHaveLength(2);
    expect(log).toHaveBeenCalledWith("Dub stored", expect.objectContaining({ jobId: "dub_1" }));
  });
});
