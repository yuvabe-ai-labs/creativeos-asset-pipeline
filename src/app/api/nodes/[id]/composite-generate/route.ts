import { imageGenRegistry } from "@/lib/image-gen/registry";
import { getVersionById } from "@/lib/db/versions";
import type { EditIntent } from "@/lib/image-gen/edit-prompt";
import { apiError, withNode } from "@/lib/api/route-helpers";
import { loadCompositeInputs } from "@/lib/composite/load-inputs";
import {
  referenceImagesOf,
  resolveCompositeMentions,
  danglingMentions,
  danglingMentionMessage,
  mentionIds,
  type CompositeRef,
} from "@/lib/composite/references";
import { resolveCompositeModelId } from "@/lib/composite/model";
import { referenceProblem, runCompositeGeneration } from "@/lib/composite/run-generation";
import {
  buildCompositePrompt,
  buildCompositeEditBrief,
  withCompositeEditRules,
  COMPOSITE_PROMPT_ID,
  COMPOSITE_EDIT_PROMPT_ID,
} from "@/prompts/composite-generate";

const EDIT_INTENTS: readonly EditIntent[] = ["remove", "replace", "add", "modify", "freeform"];

type EditBody = {
  baseVersionId?: unknown;
  intent?: unknown;
  prompt?: unknown;
  extraIds?: unknown;
  maskBase64?: unknown;
  maskMime?: unknown;
};

// D312 — the Composite node's generation. image-generate/route.ts is the template, not the
// route: the pipeline lives in runCompositeGeneration; the prompt comes from the node's own
// instruction and the reference roster instead of a connected Prompt node. Every operator error
// is refused BEFORE a generation row exists, so nothing is reserved for a request that could
// never run.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withNode(req, params, async (nodeId, node, caller, clientId, effectiveOrgId) => {
    const body = (await req.json().catch(() => null)) as
      | { instruction?: unknown; modelId?: unknown; params?: unknown; edit?: EditBody }
      | null;

    // The body wins: the canvas autosaves on a delay, so the stored instruction can lag what the
    // operator just typed and clicked Generate on.
    const stored = (node.data as Record<string, unknown> | null)?.instruction;
    const rawInstruction =
      typeof body?.instruction === "string" ? body.instruction : typeof stored === "string" ? stored : "";
    if (!rawInstruction.trim()) return apiError("Say what to make — the instruction is empty.", 400);

    const inputs = await loadCompositeInputs(nodeId, clientId);
    if (!inputs.ok) return apiError(inputs.error, 400);
    const { refs, avatarIds } = inputs;

    const dangling = danglingMentions(rawInstruction, refs);
    if (dangling.length) return apiError(danglingMentionMessage(dangling), 400);

    // D312 — the operator's model, Seedream by default. A non-Seedream composite of an avatar
    // works with Gemini Omni, Kling and Veo but not Seedance; the picker says so.
    const modelId = resolveCompositeModelId(typeof body?.modelId === "string" ? body.modelId : undefined);
    const config = imageGenRegistry[modelId];
    if (!config) return apiError(`Unknown modelId: ${modelId}`, 400);

    const parsed = config.schema.safeParse(body?.params ?? {});
    if (!parsed.success) return apiError(`Invalid params: ${parsed.error.message}`, 400);
    const validatedParams = parsed.data as Record<string, unknown>;

    const run = { nodeId, clientId, orgId: effectiveOrgId, caller, modelId, config, params: validatedParams };

    // D312 — Edit: the composite's current picture is image 1; the ticked references and any the
    // instruction mentions follow it. Image Gen's per-intent template, plus the composite's
    // preservation rules, so an edit cannot drift the face or invent branding.
    if (body?.edit) {
      const edit = body.edit;
      // A painted region (GPT Image): only a model that takes a mask may receive one.
      const mask =
        typeof edit.maskBase64 === "string" && edit.maskBase64
          ? { base64: edit.maskBase64, mime: typeof edit.maskMime === "string" ? edit.maskMime : "image/png" }
          : undefined;
      if (mask && !config.supportsMask) {
        return apiError(`${config.label} can't edit a painted region — type the change instead, or pick GPT Image.`, 400);
      }
      const base = typeof edit.baseVersionId === "string" ? await getVersionById(edit.baseVersionId) : null;
      if (!base || base.node_id !== nodeId || typeof base.output !== "string") {
        return apiError("No picture to edit — generate one first.", 400);
      }
      const wanted = new Set([
        ...(Array.isArray(edit.extraIds) ? edit.extraIds.filter((id): id is string => typeof id === "string") : []),
        ...mentionIds(rawInstruction),
      ]);
      const extras: CompositeRef[] = refs
        .filter((r) => wanted.has(r.nodeId))
        .map((r, i) => ({ ...r, position: i + 2 }));
      const images = [{ url: base.output }, ...referenceImagesOf(extras)];
      const problem = referenceProblem(images, config);
      if (problem) return apiError(problem.message, problem.status);

      const intent = EDIT_INTENTS.find((i) => i === edit.intent) ?? "freeform";
      const handEdited = typeof edit.prompt === "string" ? edit.prompt.trim() : "";
      // The operator sees and may edit the brief; the rules are always appended here, out of sight.
      const brief =
        handEdited ||
        buildCompositeEditBrief({
          instruction: resolveCompositeMentions(rawInstruction, extras),
          intent,
          extras,
          masked: Boolean(mask),
        });
      const prompt = withCompositeEditRules(brief, refs.some((r) => r.role === "avatar"));
      const referenceUrls = images.map((i) => i.url);
      return runCompositeGeneration({
        ...run,
        prompt,
        referenceUrls,
        mask,
        inputsUsed: {
          promptId: COMPOSITE_EDIT_PROMPT_ID,
          mode: "edit",
          masked: Boolean(mask),
          baseVersionId: base.id,
          baseImageUrl: base.output,
          intent,
          instruction: rawInstruction,
          prompt,
          referenceImageUrls: referenceUrls,
          avatarIds,
        },
      });
    }

    const images = referenceImagesOf(refs);
    const problem = referenceProblem(images, config);
    if (problem) return apiError(problem.message, problem.status);

    const referenceUrls = images.map((i) => i.url);
    const prompt = buildCompositePrompt({ refs, instruction: resolveCompositeMentions(rawInstruction, refs) });

    return runCompositeGeneration({
      ...run,
      prompt,
      referenceUrls,
      inputsUsed: { promptId: COMPOSITE_PROMPT_ID, instruction: rawInstruction, prompt, referenceImageUrls: referenceUrls, avatarIds },
    });
  });
}
