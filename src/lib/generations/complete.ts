import "server-only";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { getGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { uploadVideoGen } from "@/lib/storage";

function buildVideoDownloadHeaders(modelUsed: string | null): HeadersInit {
  const base = { "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)" };
  if (modelUsed?.startsWith("veo:")) {
    const key = process.env.GOOGLE_GENAI_API_KEY ?? "";
    return { ...base, "x-goog-api-key": key };
  }
  if (modelUsed?.startsWith("openai:")) {
    const key = process.env.OPENAI_API_KEY ?? "";
    return { ...base, Authorization: `Bearer ${key}` };
  }
  return base;
}

export type CompleteGenerationInput =
  | {
      generationId: string;
      status: "succeeded";
      videoUrl: string;
      durationSeconds: number;
      meta?: Record<string, unknown>;
    }
  | {
      generationId: string;
      status: "failed";
      error: string;
    };

export async function completeGeneration(
  input: CompleteGenerationInput,
): Promise<void> {
  const generation = await getGeneration(input.generationId);

  // Idempotency: skip if already resolved (duplicate webhook delivery)
  if (generation.status !== "running") return;

  if (input.status === "failed") {
    await failGeneration({ generationId: input.generationId, error: input.error });
    return;
  }

  // 1. Download video from provider URL and upload to GCS
  const videoResponse = await fetch(input.videoUrl, {
    headers: buildVideoDownloadHeaders(generation.model_used),
  });
  if (!videoResponse.ok) {
    await failGeneration({
      generationId: input.generationId,
      error: `Failed to download video from provider: ${videoResponse.status}`,
    });
    return;
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  let storedVideoUrl: string;
  try {
    const result = await uploadVideoGen({
      nodeId: generation.node_id,
      body: videoBuffer,
      contentType: "video/mp4",
    });
    storedVideoUrl = result.url;
  } catch (e) {
    await failGeneration({
      generationId: input.generationId,
      error: `Storage upload failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
    return;
  }

  // 2. INSERT node_versions
  const version = await insertVersion({
    nodeId: generation.node_id,
    inputsUsed: generation.inputs_snapshot ?? {},
    paramsUsed: {
      ...(generation.params_snapshot ?? {}),
      durationSeconds: input.durationSeconds,
    },
    modelUsed: generation.model_used,
    output: storedVideoUrl,
  });

  // 3. Move active pointer
  await setActiveVersion(generation.node_id, version.id);

  // 4. Compute cost and mark succeeded
  const cost = generation.model_used
    ? computeVideoCost(generation.model_used, input.durationSeconds, false)
    : null;

  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    creditsConsumed: cost?.usd,
    meta: input.meta,
  });
}
