import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertVersion, setActiveVersion, getVersionById } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { imageGenRegistry, DEFAULT_MODEL_ID } from "@/lib/image-gen/registry";
import {
  buildEditPrompt,
  assembleEditReferences,
  type EditIntent,
} from "@/lib/image-gen/edit-prompt";
import type { MentionUpstream } from "@/lib/nodes/resolve-mention-tokens";
import { computeImageCost } from "@/lib/image-gen/cost";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { uploadImageGen } from "@/lib/storage";
import sharp from "sharp";
import { validateReferenceImages, type RefImageMeta } from "@/lib/image-gen/validate";
import { createServerSupabase } from "@/lib/supabase/server";

function mimeToExt(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

const EDIT_INTENTS: readonly EditIntent[] = ["remove", "replace", "add", "modify", "freeform"];
function asIntent(v: unknown): EditIntent | undefined {
  return typeof v === "string" && (EDIT_INTENTS as readonly string[]).includes(v)
    ? (v as EditIntent)
    : undefined;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as
    | {
        modelId?: unknown;
        params?: unknown;
        instruction?: unknown;
        intent?: unknown;
        prompt?: unknown;
        baseVersionId?: unknown;
        baseImageUrl?: unknown;
        extraReferenceUrls?: unknown;
        masked?: unknown;
        maskBase64?: unknown;
        maskMime?: unknown;
      }
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

  // All connected image URLs (File images, Draw sketches, other Image Gen outputs).
  const connectedImageUrls = upstream
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
    .map((u) =>
      u.type === "image-gen"
        ? (u.activeOutput as string)
        : ((u.data as Record<string, unknown>).fileUrl as string),
    );

  const promptNode = upstream.find((u) => u.type === "prompt");
  const instruction =
    typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const isEdit = instruction.length > 0;

  const mentionUpstream: MentionUpstream[] = upstream.map((u) => ({
    nodeId: u.nodeId,
    type: u.type,
    text: typeof u.activeOutput === "string" ? u.activeOutput : "",
    fileUrl:
      u.type === "image-gen"
        ? (typeof u.activeOutput === "string" ? u.activeOutput : undefined)
        : (u.data.fileUrl as string | undefined),
    fileKind:
      u.type === "image-gen"
        ? "image"
        : (u.data.fileKind as string | undefined),
    useLlm: u.type === "file" ? (u.data.useLlm as boolean | undefined) : undefined,
  }));

  let prompt: string;
  let referenceUrls: string[];
  let inputsUsed: Record<string, unknown>;
  let maskBase64: string | undefined;
  let maskMime: string | undefined;

  if (isEdit) {
    // Base image = the node's current image: a prior attempt or a connected reference.
    const baseVersionId =
      typeof body?.baseVersionId === "string" ? body.baseVersionId : undefined;
    let resolvedBaseUrl: string | undefined;
    let carriedPromptVersionId: string | null = null;

    if (baseVersionId) {
      const baseVersion = await getVersionById(baseVersionId);
      if (typeof baseVersion?.output === "string") resolvedBaseUrl = baseVersion.output;
      const prevInputs = (baseVersion?.inputs_used ?? {}) as { promptVersionId?: string };
      carriedPromptVersionId = prevInputs.promptVersionId ?? null;
    } else if (typeof body?.baseImageUrl === "string") {
      resolvedBaseUrl = body.baseImageUrl;
      carriedPromptVersionId = promptNode?.versionId ?? null;
    }
    if (!resolvedBaseUrl) return apiError("No base image to edit.", 400);

    // Region mask (OpenAI): the client painted a region and sent it as a base64 alpha PNG. The
    // base image stays CLEAN (never composited) — the mask travels separately to the provider.
    const masked =
      body?.masked === true && typeof body?.maskBase64 === "string";
    maskBase64 = masked ? (body!.maskBase64 as string) : undefined;
    maskMime =
      masked && typeof body?.maskMime === "string" ? (body.maskMime as string) : "image/png";
    const modelBaseUrl = resolvedBaseUrl; // clean base — no composite

    // Extra references: the client's chosen connected-node URLs when provided; otherwise the
    // D27 default (all other connected images). Dedup the real base out either way.
    const bodyExtras = Array.isArray(body?.extraReferenceUrls)
      ? (body.extraReferenceUrls as unknown[]).filter(
          (u): u is string => typeof u === "string",
        )
      : undefined;
    const extraReferenceUrls = (bodyExtras ?? connectedImageUrls).filter(
      (u) => u !== resolvedBaseUrl,
    );

    referenceUrls = assembleEditReferences({
      baseImageUrl: modelBaseUrl,
      extraUrls: extraReferenceUrls,
      max: config.maxReferenceImages,
    });
    const intent = asIntent(body?.intent) ?? "freeform";
    // Use the operator's (possibly hand-edited) final prompt when provided; otherwise compose
    // it from the per-intent template. The literal prompt sent is recorded for traceability.
    const editedPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    prompt =
      editedPrompt ||
      buildEditPrompt({
        instruction,
        intent,
        hasExtraReference: extraReferenceUrls.length > 0,
        masked,
        upstream: mentionUpstream,
      });
    inputsUsed = {
      promptVersionId: carriedPromptVersionId,
      baseVersionId: baseVersionId ?? null,
      intent,
      instruction,
      editPrompt: prompt,
      extraReferenceUrls,
      masked,
    };
  } else {
    // Fresh generation (unchanged): requires a connected Prompt node with output.
    if (!promptNode?.activeOutput) {
      return apiError("No connected Prompt node with output found.", 400);
    }
    prompt = String(promptNode.activeOutput);
    referenceUrls = connectedImageUrls.slice(0, config.maxReferenceImages);
    inputsUsed = {
      promptNodeId: promptNode.nodeId,
      promptVersionId: promptNode.versionId,
      referenceImageUrls: referenceUrls,
    };
  }

  // Build RefImageMeta[] from upstream node data; lazy-backfill missing metadata
  const refMetas: RefImageMeta[] = await Promise.all(
    referenceUrls.map(async (url) => {
      const ownerNode = upstream.find((u) => {
        if (u.type === "image-gen") return u.activeOutput === url;
        const d = u.data as Record<string, unknown>;
        return d.fileUrl === url;
      });

      const data = ownerNode?.data as Record<string, unknown> | undefined;
      let fileSizeBytes = data?.fileSizeBytes as number | undefined;
      let imageWidth = data?.imageWidth as number | undefined;
      let imageHeight = data?.imageHeight as number | undefined;

      if (fileSizeBytes === undefined && ownerNode) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            fileSizeBytes = buf.length;
            const meta = await sharp(buf).metadata();
            imageWidth = meta.width;
            imageHeight = meta.height;
            const supabase = createServerSupabase();
            await supabase
              .from("nodes")
              .update({
                data: {
                  ...(ownerNode.data as Record<string, unknown>),
                  fileSizeBytes,
                  imageWidth,
                  imageHeight,
                },
              })
              .eq("id", ownerNode.nodeId);
          }
        } catch {
          // best-effort
        }
      }

      const filename = data?.filename as string | undefined;
      return { url, filename, fileSizeBytes, imageWidth, imageHeight };
    }),
  );

  const validationResult = validateReferenceImages(refMetas, config);
  if (!validationResult.ok) {
    const count = validationResult.violations.length;
    const message =
      count === 1
        ? `One of your reference images can't be used: ${validationResult.violations[0].message}`
        : `${count} reference images can't be used — resize them before generating.`;
    return apiError(message, 422);
  }

  // Join the shared generations substrate (D26) — image is the synchronous fast path.
  const generation = await insertGeneration({
    nodeId,
    type: "image",
    modelUsed: modelId,
    paramsSnapshot: validatedParams,
    inputsSnapshot: inputsUsed,
  });

  try {
    const result = await config.generate({
      prompt,
      referenceUrls,
      params: validatedParams,
      ...(maskBase64 ? { maskBase64, maskMime } : {}),
    });

    const genBuffer = Buffer.from(result.imageBase64, "base64");
    const { url: imageUrl } = await uploadImageGen({
      nodeId,
      ext: mimeToExt(result.mimeType),
      body: genBuffer,
      contentType: result.mimeType,
    });

    let genWidth: number | undefined;
    let genHeight: number | undefined;
    try {
      const meta = await sharp(genBuffer).metadata();
      genWidth = meta.width;
      genHeight = meta.height;
    } catch {
      // best-effort
    }

    // Record the version
    const version = await insertVersion({
      nodeId,
      inputsUsed,
      paramsUsed: {
        modelId,
        ...validatedParams,
        tokensUsed: result.tokensUsed,
        imageWidth: genWidth,
        imageHeight: genHeight,
        fileSizeBytes: genBuffer.length,
      },
      modelUsed: modelId,
      output: imageUrl,
    });
    await setActiveVersion(nodeId, version.id);

    const cost = result.tokensUsed ? computeImageCost(modelId, result.tokensUsed) : null;
    await succeedGeneration({
      generationId: generation.id,
      versionId: version.id,
      creditsConsumed: cost?.usd,
    });

    return apiOk({
      imageUrl,
      versionId: version.id,
      fileSizeBytes: genBuffer.length,
      imageWidth: genWidth,
      imageHeight: genHeight,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    await insertVersion({
      nodeId,
      paramsUsed: { modelId, ...validatedParams },
      modelUsed: modelId,
      error: message,
    }).catch(() => null);
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    return apiError(message, 500);
  }
}
