import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { getGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeVideoCost } from "@/lib/video-gen/cost";
import { NODE_FILE_BUCKET } from "@/lib/nodes/file-constants";

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

  // 1. Download video from provider URL and upload to Supabase Storage
  const supabase = createServerSupabase();
  const videoResponse = await fetch(input.videoUrl);
  if (!videoResponse.ok) {
    await failGeneration({
      generationId: input.generationId,
      error: `Failed to download video from provider: ${videoResponse.status}`,
    });
    return;
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const fileId = crypto.randomUUID();
  const storagePath = `video-gen/${generation.node_id}/${fileId}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(NODE_FILE_BUCKET)
    .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: false });

  if (uploadError) {
    await failGeneration({
      generationId: input.generationId,
      error: `Storage upload failed: ${uploadError.message}`,
    });
    return;
  }

  const { data: publicData } = supabase.storage
    .from(NODE_FILE_BUCKET)
    .getPublicUrl(storagePath);
  const storedVideoUrl = publicData.publicUrl;

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
  const paramsSnapshot = (generation.params_snapshot ?? {}) as Record<string, unknown>;
  const cost = generation.model_used
    ? computeVideoCost(
        generation.model_used,
        input.durationSeconds,
        Boolean(paramsSnapshot.audio),
      )
    : null;

  await succeedGeneration({
    generationId: input.generationId,
    versionId: version.id,
    creditsConsumed: cost?.usd,
    meta: input.meta,
  });
}
