// D377 — the video-dub task's steps, dependencies injected so tests need no network.
// create → upload → start happen once; status, exports and downloads retry in place.
//
// Audio in, audio out (research, 2026-10-15): the vendor dubs from the sound alone, so only the
// clip's audio is uploaded (a fraction of the video's size) and only the dubbed audio comes back.
// The "Dubbed" video is ours: the original picture, untouched, with that audio laid in.
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
  /** The source clip's audio, as mp3: what is uploaded to the vendor. */
  extractAudio: (video: Buffer) => Promise<Buffer>;
  createJob: (a: { srcLang: string; targetLang: string; jobName?: string }) => Promise<{ jobId: string; uploadUrl: string }>;
  upload: (uploadUrl: string, body: Buffer, contentType: string) => Promise<void>;
  start: (jobId: string) => Promise<void>;
  liveStatus: (jobId: string) => Promise<{ status: SarvamJobStatus; progress: number; stepLabel: string | null; errorMessage: string | null }>;
  exports: (jobId: string) => Promise<SarvamExport[]>;
  /** The original video with the dubbed WAV laid in: the "Dubbed" stage. */
  replaceAudio: (video: Buffer, wav: Buffer) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  sleep: (seconds: number) => Promise<void>;
  now: () => number;
  /** Run log (the task passes Trigger's logger): the job id, and each change in what the vendor reports. */
  log?: (message: string, data: Record<string, unknown>) => void;
};

const FAILED: SarvamJobStatus[] = ["failed", "partial_failure", "deleted"];
/** The dubbed-audio export, by the names the vendor lists it under. */
const AUDIO_EXPORTS = ["audio", "mp3"];

function failureCopy(vendorMessage: string | null): string {
  return vendorMessage && /speech|audio|silent/i.test(vendorMessage) ? DUB_NO_SPEECH_MESSAGE : DUB_FAILED_MESSAGE;
}

function detail(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runDub(p: DubRunPayload, d: DubRunDeps): Promise<{ vendorJobId: string }> {
  const deadline = d.now() + DUB_POLL_TIMEOUT_MS;
  const log = d.log ?? (() => {});
  const source = await d.fetchBytes(p.sourceUrl);
  let sourceAudio: Buffer;
  try {
    sourceAudio = await d.extractAudio(source);
  } catch (e) {
    // No audio stream: nothing to dub, and nothing has been paid for yet.
    throw new DubbingFinalError(DUB_NO_SPEECH_MESSAGE, `could not take the source audio: ${detail(e)}`);
  }

  // The paid part. Each runs once: a failure here fails the run (nothing has been charged yet
  // that a retry would recover, and a retry after `start` would pay twice).
  const { jobId, uploadUrl } = await d.createJob({ srcLang: DUB_SOURCE_LANGUAGE, targetLang: p.targetLang, jobName: p.generationId });
  await d.upload(uploadUrl, sourceAudio, "audio/mpeg");
  await d.start(jobId);
  log("Dub job started", { jobId, targetLang: p.targetLang, uploadBytes: sourceAudio.length });

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

  // 2. Its exports finish after the job: wait for the dubbed audio (the SRT is not needed yet).
  let audioUrl: string | undefined;
  let lastExports = "";
  for (;;) {
    const listed = await retryInPlace(() => d.exports(jobId), d.sleep);
    const exportsKey = listed.map((e) => `${e.exportType}:${e.targetLanguage}:${e.status}`).join(",");
    if (exportsKey !== lastExports) log("Dub exports", { jobId, exports: exportsKey || "(none)" });
    lastExports = exportsKey;
    const audio = listed.find((e) => e.targetLanguage === p.targetLang && AUDIO_EXPORTS.includes(e.exportType));
    if (audio?.status === "failed") throw new DubbingFinalError(DUB_FAILED_MESSAGE, "audio export failed");
    if (audio?.status === "completed" && audio.downloadUrl) {
      audioUrl = audio.downloadUrl;
      break;
    }
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `exports of ${jobId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
  }

  // 3. Ours from here: the original picture with the dubbed audio, then both stored.
  log("Dub ready, storing", { jobId });
  const ready = audioUrl;
  const wav = await retryInPlace(() => d.fetchBytes(ready), d.sleep);
  let dubbedVideo: Buffer;
  try {
    dubbedVideo = await d.replaceAudio(source, wav);
  } catch (e) {
    throw new DubbingFinalError(DUB_FAILED_MESSAGE, `could not lay the dubbed audio into the video: ${detail(e)}`);
  }
  await retryInPlace(() => d.putBytes(p.dubbedPutUrl, dubbedVideo, "video/mp4"), d.sleep);
  await retryInPlace(() => d.putBytes(p.dubbedAudioPutUrl, wav, "audio/wav"), d.sleep);
  log("Dub stored", { jobId, videoBytes: dubbedVideo.length, audioBytes: wav.length });
  return { vendorJobId: jobId };
}
