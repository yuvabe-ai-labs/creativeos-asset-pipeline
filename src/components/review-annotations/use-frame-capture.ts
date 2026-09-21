"use client";

export class FrameCaptureError extends Error {}

// Freeze the paused frame at the video's intrinsic size (spec §4.2). Throws
// FrameCaptureError when the canvas is tainted (CORS) or the frame can't decode —
// the caller toasts and the senior falls back to the overall note (no partial rows).
export function captureFrame(video: HTMLVideoElement): {
  base64: string;
  timecodeMs: number;
} {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0) {
    throw new FrameCaptureError("This frame can't be captured.");
  }
  try {
    ctx.drawImage(video, 0, 0);
    // toDataURL is what throws SecurityError on a tainted canvas, so the try must
    // wrap it, not just drawImage.
    const base64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
    if (!base64) throw new FrameCaptureError("This frame can't be captured.");
    return { base64, timecodeMs: Math.round(video.currentTime * 1000) };
  } catch {
    throw new FrameCaptureError(
      "This video can't be annotated in the browser (cross-origin frame).",
    );
  }
}
