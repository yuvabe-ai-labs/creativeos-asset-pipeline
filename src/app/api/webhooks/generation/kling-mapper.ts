type KlingWebhookPayload = {
  task_id: string;
  task_status: string;
  task_status_msg: string;
  task_result: { videos: Array<{ url: string; duration: string }> };
};

type KlingMappedResult =
  | { providerJobId: string; status: "succeeded"; videoUrl: string; durationSeconds: number }
  | { providerJobId: string; status: "failed"; error: string }
  | null;

export function mapKlingWebhookPayload(payload: KlingWebhookPayload): KlingMappedResult {
  if (payload.task_status === "succeed") {
    const video = payload.task_result.videos[0];
    return {
      providerJobId: payload.task_id,
      status: "succeeded",
      videoUrl: video.url,
      durationSeconds: parseFloat(video.duration),
    };
  }
  if (payload.task_status === "failed") {
    return {
      providerJobId: payload.task_id,
      status: "failed",
      error: payload.task_status_msg || "Kling generation failed",
    };
  }
  return null;
}
