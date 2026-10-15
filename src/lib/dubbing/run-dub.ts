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
  /** The dubbed track, as mp3, taken from the dubbed video (lip sync's audio input). */
  extractAudio: (video: Buffer) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  sleep: (seconds: number) => Promise<void>;
  now: () => number;
  /** Run log (the task passes Trigger's logger): the job id, and each change in what the vendor reports. */
  log?: (message: string, data: Record<string, unknown>) => void;
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
  const log = d.log ?? (() => {});
  log("Dub job started", { jobId, targetLang: p.targetLang });

  // 1. The job.
  let lastLive = "";
  for (;;) {
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `job ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
    const live = await retryInPlace(() => d.liveStatus(jobId), d.sleep);
    const liveKey = `${live.status}|${live.progress}|${live.stepLabel ?? ""}`;
    if (liveKey !== lastLive) log("Dub job status", { jobId, status: live.status, progress: live.progress, step: live.stepLabel, error: live.errorMessage });
    lastLive = liveKey;
    if (FAILED.includes(live.status)) throw new DubbingFinalError(failureCopy(live.errorMessage), live.errorMessage ?? live.status);
    if (live.status === "completed") break;
  }

  // 2. Its export finishes after the job: wait for the dubbed video. Only the video is relied on:
  // the vendor does not always list the audio exports its docs describe, so the audio track is
  // taken from the video below.
  let videoUrl: string | undefined;
  let lastExports = "";
  for (;;) {
    const listed = await retryInPlace(() => d.exports(jobId), d.sleep);
    const exportsKey = listed.map((e) => `${e.exportType}:${e.targetLanguage}:${e.status}`).join(",");
    if (exportsKey !== lastExports) log("Dub exports", { jobId, exports: exportsKey || "(none)" });
    lastExports = exportsKey;
    const all = listed.filter((e) => e.targetLanguage === p.targetLang);
    const video = all.find((e) => e.exportType === "video");
    if (video?.status === "failed") throw new DubbingFinalError(DUB_FAILED_MESSAGE, "export failed");
    if (video?.status === "completed" && video.downloadUrl) {
      videoUrl = video.downloadUrl;
      break;
    }
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `exports of ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
  }

  log("Dub ready, storing", { jobId });
  const ready = videoUrl;
  const videoBytes = await retryInPlace(() => d.fetchBytes(ready), d.sleep);
  let audioBytes: Buffer;
  try {
    audioBytes = await d.extractAudio(videoBytes);
  } catch (e) {
    throw new DubbingFinalError(DUB_FAILED_MESSAGE, `could not take the audio from the dubbed video: ${e instanceof Error ? e.message : String(e)}`);
  }
  await retryInPlace(() => d.putBytes(p.dubbedPutUrl, videoBytes, "video/mp4"), d.sleep);
  await retryInPlace(() => d.putBytes(p.dubbedAudioPutUrl, audioBytes, "audio/mpeg"), d.sleep);
  log("Dub stored", { jobId, videoBytes: videoBytes.length, audioBytes: audioBytes.length });
  return { vendorJobId: jobId };
}
