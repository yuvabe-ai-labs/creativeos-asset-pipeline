// D366 — the image-generate task's work, with its I/O injected so it is unit-testable outside
// Trigger.dev. No `server-only`: trigger/image-generate.ts imports it.
import type { ImageGenInput, ImageGenResult, ImageTokenUsage } from "@/lib/image-gen/types";
import type { ImageGenerateTaskPayload, ImageResultMime } from "@/lib/image-gen/task-payload";
import { PaidResultError } from "@/lib/generations/task-failure";
import { IMAGE_PROVIDER_TIMEOUT_MS } from "@/lib/image-gen/constants";

export type ImageGenerateTaskDeps = {
  generate: (input: ImageGenInput) => Promise<ImageGenResult>;
  fetchFn: typeof fetch;
  readSize: (bytes: Buffer) => Promise<{ width?: number; height?: number }>;
  postWebhook: (body: object) => Promise<Response>;
  /** Overrides IMAGE_PROVIDER_TIMEOUT_MS (tests). */
  providerTimeoutMs?: number;
};

/** The body this task posts to the generation webhook on success (completeGeneration reads it). */
export type ImageGenerationSucceeded = {
  generationId: string;
  status: "succeeded";
  kind: "image";
  imageUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  fileSizeBytes: number;
  tokensUsed?: ImageTokenUsage | null;
  costUsd?: number;
};

export async function runImageGenerateTask(
  payload: ImageGenerateTaskPayload,
  deps: ImageGenerateTaskDeps,
): Promise<void> {
  let maskBase64: string | undefined;
  if (payload.maskUrl) {
    const res = await deps.fetchFn(payload.maskUrl);
    if (!res.ok) throw new Error(`Could not read the edit mask: ${res.status}`);
    maskBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  }

  // The task retries a failed call itself (one retry), so the provider's client must not stack its
  // own retries on top. A call that hangs is abandoned inside the task's maxDuration and reported,
  // instead of the run being killed silently. It is never retried: the provider may still finish,
  // and bill, the abandoned call, so a retry could pay twice.
  const result = await withTimeout(
    deps.generate({
      prompt: payload.prompt,
      referenceUrls: payload.referenceUrls,
      params: payload.params,
      ...(maskBase64 ? { maskBase64, maskMime: payload.maskMime ?? "image/png" } : {}),
      providerMaxRetries: 0,
    }),
    deps.providerTimeoutMs ?? IMAGE_PROVIDER_TIMEOUT_MS,
  );

  // The provider has returned, and been paid. Nothing below may lead to a retry, which would pay it
  // again: every failure from here is a PaidResultError (see task-failure.ts).
  try {
    await deliverResult(payload, result, deps);
  } catch (e) {
    throw e instanceof PaidResultError ? e : new PaidResultError(e instanceof Error ? e.message : String(e));
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PaidResultError(`The image model did not answer within ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function deliverResult(
  payload: ImageGenerateTaskPayload,
  result: ImageGenResult,
  deps: ImageGenerateTaskDeps,
): Promise<void> {
  const upload = payload.uploads[result.mimeType as ImageResultMime];
  if (!upload) throw new PaidResultError(`The model returned an unsupported image type: ${result.mimeType}`);

  const bytes = Buffer.from(result.imageBase64, "base64");
  const put = await deps.fetchFn(upload.putUrl, {
    method: "PUT",
    headers: { "Content-Type": result.mimeType },
    body: bytes,
  });
  if (!put.ok) throw new PaidResultError(`Image upload failed: ${put.status}`);

  const size = await deps.readSize(bytes).catch(() => ({}) as { width?: number; height?: number });

  const body: ImageGenerationSucceeded = {
    generationId: payload.generationId,
    status: "succeeded",
    kind: "image",
    imageUrl: upload.url,
    mimeType: result.mimeType,
    ...(size.width !== undefined ? { width: size.width } : {}),
    ...(size.height !== undefined ? { height: size.height } : {}),
    fileSizeBytes: bytes.length,
    tokensUsed: result.tokensUsed,
    ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
  };

  let res: Response;
  try {
    res = await deps.postWebhook(body);
  } catch (e) {
    throw new PaidResultError(
      `Image generated but the webhook was unreachable — imageUrl=${upload.url}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    // The image EXISTS, is stored and has been billed. Name it, so it can be attached by hand.
    throw new PaidResultError(`Image generated but the webhook rejected it (${res.status}) — imageUrl=${upload.url}`);
  }
}
