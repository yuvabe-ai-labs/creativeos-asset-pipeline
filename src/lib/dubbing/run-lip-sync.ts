// D377 — the video-lip-sync task's steps. Submit happens once; status, result and downloads
// retry in place. A non-2xx result from the vendor is final (the request already ran and was paid).
import { DUB_POLL_INTERVAL_SECONDS, DUB_POLL_TIMEOUT_MS } from "./constants";
import { DUB_TIMEOUT_MESSAGE, LIP_SYNC_FAILED_MESSAGE } from "./copy";
import { DubbingFinalError, retryInPlace } from "./poll";
import { FalHttpError } from "@/lib/fal/client";

export type LipSyncRunPayload = { videoUrl: string; audioUrl: string; model: string; lipSyncedPutUrl: string };

export type LipSyncRunDeps = {
  submit: (a: { videoUrl: string; audioUrl: string; model: string }) => Promise<{ requestId: string; statusUrl: string; responseUrl: string }>;
  status: (statusUrl: string) => Promise<"IN_QUEUE" | "IN_PROGRESS" | "COMPLETED">;
  result: (responseUrl: string) => Promise<{ videoUrl: string }>;
  fetchBytes: (url: string) => Promise<Buffer>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
  sleep: (seconds: number) => Promise<void>;
  now: () => number;
  /** Run log (the task passes Trigger's logger): the request id, and each change in what the vendor reports. */
  log?: (message: string, data: Record<string, unknown>) => void;
};

export async function runLipSync(p: LipSyncRunPayload, d: LipSyncRunDeps): Promise<{ vendorRequestId: string }> {
  const deadline = d.now() + DUB_POLL_TIMEOUT_MS;
  const log = d.log ?? (() => {});
  const req = await d.submit({ videoUrl: p.videoUrl, audioUrl: p.audioUrl, model: p.model });
  const requestId = req.requestId;
  log("Lip sync submitted", { requestId, model: p.model });

  let lastStatus = "";
  for (;;) {
    if (d.now() > deadline) throw new DubbingFinalError(DUB_TIMEOUT_MESSAGE, `request ${requestId}`);
    await d.sleep(DUB_POLL_INTERVAL_SECONDS);
    const status = await retryInPlace(() => d.status(req.statusUrl), d.sleep);
    if (status !== lastStatus) log("Lip sync status", { requestId, status });
    lastStatus = status;
    if (status === "COMPLETED") break;
  }

  const out = await retryInPlace(async () => {
    try {
      return await d.result(req.responseUrl);
    } catch (e) {
      // 4xx on the result = the request ran and failed (no face, bad media). Final.
      if (e instanceof FalHttpError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        log("Lip sync rejected", { requestId, status: e.status, error: e.message });
        throw new DubbingFinalError(LIP_SYNC_FAILED_MESSAGE, e.message);
      }
      throw e;
    }
  }, d.sleep);

  log("Lip sync ready, storing", { requestId });
  const bytes = await retryInPlace(() => d.fetchBytes(out.videoUrl), d.sleep);
  await retryInPlace(() => d.putBytes(p.lipSyncedPutUrl, bytes, "video/mp4"), d.sleep);
  log("Lip sync stored", { requestId, bytes: bytes.length });
  return { vendorRequestId: requestId };
}
