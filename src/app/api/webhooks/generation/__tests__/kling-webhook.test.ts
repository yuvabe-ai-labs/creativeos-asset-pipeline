import { describe, it, expect, vi } from "vitest";
import { mapKlingWebhookPayload } from "../kling-mapper";

describe("mapKlingWebhookPayload", () => {
  it("maps succeed status to succeeded", () => {
    const payload = {
      task_id: "abc123",
      task_status: "succeed",
      task_status_msg: "",
      task_result: { videos: [{ url: "https://cdn.kling.com/video.mp4", duration: "5.0" }] },
    };
    const result = mapKlingWebhookPayload(payload);
    expect(result).toEqual({
      providerJobId: "abc123",
      status: "succeeded",
      videoUrl: "https://cdn.kling.com/video.mp4",
      durationSeconds: 5,
    });
  });

  it("maps failed status to failed", () => {
    const payload = {
      task_id: "abc123",
      task_status: "failed",
      task_status_msg: "NSFW content detected",
      task_result: { videos: [] },
    };
    const result = mapKlingWebhookPayload(payload);
    expect(result).toEqual({
      providerJobId: "abc123",
      status: "failed",
      error: "NSFW content detected",
    });
  });

  it("returns null for unrecognised status (still processing)", () => {
    const payload = {
      task_id: "abc123",
      task_status: "processing",
      task_status_msg: "",
      task_result: { videos: [] },
    };
    expect(mapKlingWebhookPayload(payload)).toBeNull();
  });
});
