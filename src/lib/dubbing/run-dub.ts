// D377 — the video-dub task's steps, dependencies injected so tests need no network.
// create → upload → start happen once; status, exports and downloads retry in place.
import { DUB_SOURCE_LANGUAGE } from "./types";
import { DUB_POLL_INTERVAL_SECONDS, DUB_POLL_TIMEOUT_MS } from "./constants";
import { DUB_FAILED_MESSAGE, DUB_NO_SPEECH_MESSAGE, DUB_TIMEOUT_MESSAGE } from "./copy";
import { DubbingFinalError, retryInPlace } from "./poll";
import type { SarvamExport, SarvamJobStatus } from "@/lib/sarvam/client";

export type DubRunPayload = {
  generationId: string;
  sourceUrl: string;
  targetLang: string;
  dubbedPutUrl: string;
  dubbedAudioPutUrl: string;
};

export type DubRunDeps = {
  fetchBytes: (url: string) => Promise<Buffer>;
  createJob: (a: { srcLang: string; targetLang: string; jobName?: string }) => Promise<{ jobId: string; uploadUrl: string }>;
  upload: (uploadUrl: string, body: Buffer, contentType: string) => Promise<void>;
  start: (jobId: string) => Promise<void>;
  liveStatus: (jobId: string) => Promise<{ status: SarvamJobStatus; progress: number; stepLabel: string | null; errorMessage: string | null }>;
  exports: (jobId: string) => Promise<SarvamExport[]>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  sleep: (seconds: number) => Promise<void>;
  now: () => number;
};

const FAILED: SarvamJobStatus[] = ["failed", "partial_failure", "deleted"];

function failureCopy(vendorMessage: string | null): string {
  return vendorMessage && /speech|audio|silent/i.test(vendorMessage) ? DUB_NO_SPEECH_MESSAGE : DUB_FAILED_MESSAGE;
}

export async function runDub(p: DubRunPayload, d: DubRunDeps): Promise<{ vendorJobId: string }> {
  const deadline = d.now() + DUB_POLL_TIMEOUT_MS;
  const source = await d.fetchBytes(p.sourceUrl);

  // The paid part. Each runs once: a failure here fails the run (nothing has been charged yet
  // that a retry would recover, and a retry after `start` would pay twice).
  const { jobId, uploadUrl } = await d.createJob({ srcLang: DUB_SOURCE_LANGUAGE, targetLang: p.targetLang, jobName: p.generationId });
  await d.upload(uploadUrl, source, "video/mp4");
  await d.start(jobId);

  // 1. The job.
  for (;;) {
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `job ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
    const live = await retryInPlace(() => d.liveStatus(jobId), d.sleep);
    if (FAILED.includes(live.status)) throw new DubbingFinalError(failureCopy(live.errorMessage), live.errorMessage ?? live.status);
    if (live.status === "completed") break;
  }

  // 2. Its exports finish one by one, after the job: wait for the video and the mp3.
  let video: SarvamExport | undefined;
  let audio: SarvamExport | undefined;
  for (;;) {
    const all = (await retryInPlace(() => d.exports(jobId), d.sleep)).filter((e) => e.targetLanguage === p.targetLang);
    video = all.find((e) => e.exportType === "video");
    audio = all.find((e) => e.exportType === "mp3");
    if ([video, audio].some((e) => e?.status === "failed")) throw new DubbingFinalError(DUB_FAILED_MESSAGE, "export failed");
    if (video?.status === "completed" && video.downloadUrl && audio?.status === "completed" && audio.downloadUrl) break;
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `exports of ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
  }

  const [videoBytes, audioBytes] = await Promise.all([
    retryInPlace(() => d.fetchBytes(video!.downloadUrl!), d.sleep),
    retryInPlace(() => d.fetchBytes(audio!.downloadUrl!), d.sleep),
  ]);
  await retryInPlace(() => d.putBytes(p.dubbedPutUrl, videoBytes, "video/mp4"), d.sleep);
  await retryInPlace(() => d.putBytes(p.dubbedAudioPutUrl, audioBytes, "audio/mpeg"), d.sleep);
  return { vendorJobId: jobId };
}
