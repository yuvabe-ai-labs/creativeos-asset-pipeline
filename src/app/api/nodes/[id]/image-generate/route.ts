import { getUpstreamOutputs } from "@/lib/db/nodes";
import { insertVersion, setActiveVersion, getVersionById } from "@/lib/db/versions";
import { imageGenRegistry, DEFAULT_MODEL_ID } from "@/lib/image-gen/registry";
import {
  buildEditPrompt,
  assembleEditReferences,
  type EditIntent,
} from "@/lib/image-gen/edit-prompt";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { uploadImageGen } from "@/lib/storage";

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
        annotated?: unknown;
        annotatedBaseImageBase64?: unknown;
        annotatedBaseImageMime?: unknown;
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

  let prompt: string;
  let referenceUrls: string[];
  let inputsUsed: Record<string, unknown>;

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

    // Annotation: the client composited base + drawn marks into one PNG (base64). Upload it and
    // send THAT as the image the model sees; lineage still points at the un-annotated base.
    const annotated =
      body?.annotated === true && typeof body?.annotatedBaseImageBase64 === "string";
    let annotatedBaseUrl: string | null = null;
    let modelBaseUrl = resolvedBaseUrl;
    if (annotated) {
      const mime =
        typeof body?.annotatedBaseImageMime === "string"
          ? body.annotatedBaseImageMime
          : "image/png";
      const uploaded = await uploadImageGen({
        nodeId,
        ext: mimeToExt(mime),
        body: Buffer.from(body!.annotatedBaseImageBase64 as string, "base64"),
        contentType: mime,
      });
      annotatedBaseUrl = uploaded.url;
      modelBaseUrl = uploaded.url;
    }

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
        annotated,
      });
    inputsUsed = {
      promptVersionId: carriedPromptVersionId,
      baseVersionId: baseVersionId ?? null,
      intent,
      instruction,
      editPrompt: prompt,
      extraReferenceUrls,
      annotated,
      annotatedBaseUrl,
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

  try {
    const result = await config.generate({ prompt, referenceUrls, params: validatedParams });

    const { url: imageUrl } = await uploadImageGen({
      nodeId,
      ext: mimeToExt(result.mimeType),
      body: Buffer.from(result.imageBase64, "base64"),
      contentType: result.mimeType,
    });

    // Record the version
    const version = await insertVersion({
      nodeId,
      inputsUsed,
      paramsUsed: { modelId, ...validatedParams, tokensUsed: result.tokensUsed },
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
