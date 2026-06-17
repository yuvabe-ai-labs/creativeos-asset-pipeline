import { createServerSupabase } from "@/lib/supabase/server";
import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { imageGenRegistry, DEFAULT_MODEL_ID } from "@/lib/image-gen/registry";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { NODE_FILE_BUCKET } from "@/lib/nodes/file-constants";

function mimeToExt(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { modelId?: unknown; params?: unknown }
    | null;

  const modelId = typeof body?.modelId === "string" ? body.modelId : DEFAULT_MODEL_ID;
  const config = imageGenRegistry[modelId];
  if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

  // Validate params with the model's Zod schema
  const parseResult = config.schema.safeParse(body?.params ?? {});
  if (!parseResult.success) {
    return apiError(`Invalid params: ${parseResult.error.message}`, 400);
  }
  const validatedParams = parseResult.data as Record<string, unknown>;

  // Resolve upstream nodes
  const upstream = await getUpstreamOutputs(nodeId);

  // Find the connected Prompt node's output
  const promptNode = upstream.find((u) => u.type === "prompt");
  if (!promptNode?.activeOutput) {
    return apiError("No connected Prompt node with output found.", 400);
  }
  const prompt = String(promptNode.activeOutput);

  // Collect reference image URLs from connected image nodes
  const allRefUrls = upstream
    .filter((u) => {
      if (u.type === "image-gen") return typeof u.activeOutput === "string";
      if (u.type === "file") {
        const d = u.data as Record<string, unknown>;
        return d.fileKind === "image" && typeof d.fileUrl === "string";
      }
      if (u.type === "draw") {
        const d = u.data as Record<string, unknown>;
        return typeof d.fileUrl === "string";
      }
      return false;
    })
    .map((u) => {
      if (u.type === "image-gen") return u.activeOutput as string;
      return (u.data as Record<string, unknown>).fileUrl as string;
    });

  // Enforce per-model reference image limit
  const referenceUrls = allRefUrls.slice(0, config.maxReferenceImages);

  try {
    const result = await config.generate({ prompt, referenceUrls, params: validatedParams });

    // Upload generated image to Supabase Storage
    const supabase = createServerSupabase();
    const ext = mimeToExt(result.mimeType);
    const versionFileId = crypto.randomUUID();
    const storagePath = `image-gen/${nodeId}/${versionFileId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(NODE_FILE_BUCKET)
      .upload(storagePath, Buffer.from(result.imageBase64, "base64"), {
        contentType: result.mimeType,
        upsert: false,
      });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicData } = supabase.storage
      .from(NODE_FILE_BUCKET)
      .getPublicUrl(storagePath);
    const imageUrl = publicData.publicUrl;

    // Record the version
    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        promptNodeId:       promptNode.nodeId,
        promptVersionId:    promptNode.versionId,
        referenceImageUrls: referenceUrls,
      },
      paramsUsed: {
        modelId,
        ...validatedParams,
        tokensUsed: result.tokensUsed,
      },
      modelUsed: modelId,
      output: imageUrl,
    });
    await setActiveVersion(nodeId, version.id);

    return apiOk({ imageUrl, versionId: version.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    await insertVersion({
      nodeId,
      paramsUsed: { modelId, ...validatedParams },
      modelUsed: modelId,
      error: message,
    }).catch(() => null);
    return apiError(message, 500);
  }
}
