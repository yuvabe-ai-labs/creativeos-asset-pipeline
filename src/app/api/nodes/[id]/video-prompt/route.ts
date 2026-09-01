import { createOpenAI } from "@/lib/openai/server";
import { resolveVideoPromptInputs } from "@/lib/nodes/resolve-inputs";
import { compileVideoPrompt } from "@/lib/nodes/video-prompt";
import { buildUserContent, isVisionAttachment } from "@/lib/nodes/compose-message";
import { videoPromptGeneratePromptFor, type VideoProvider } from "@/prompts/video-prompt-generate";
import { DEFAULT_VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeCost } from "@/lib/pricing";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
import { describeModelRequest } from "@/lib/nodes/model-request";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

function normalizeControls(input: unknown): VideoControls {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    camera: typeof c.camera === "string" ? c.camera : DEFAULT_VIDEO_CONTROLS.camera,
    speed: typeof c.speed === "string" ? c.speed : DEFAULT_VIDEO_CONTROLS.speed,
  };
}

// POST /api/nodes/:id/video-prompt — the Video Prompt node's runAction: resolve inputs
// (KB + upstream, with the Image Gen still as a vision part), compile, call the text LLM
// synchronously, append a version, move the active pointer. Mirrors the Prompt generate route,
// including its credit reservation/settlement flow (src/app/api/nodes/[id]/generate/route.ts) —
// this route previously logged a version but never joined the credit ledger at all.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
    const body = (await req.json().catch(() => null)) as
      | { instruction?: unknown; slices?: unknown; controls?: unknown; targetProvider?: unknown }
      | null;
    const instruction = typeof body?.instruction === "string" ? body.instruction : "";
    const controls = normalizeControls(body?.controls);

    const VALID_PROVIDERS: VideoProvider[] = ["veo", "kling", "gemini-omni"];
    const targetProvider: VideoProvider = VALID_PROVIDERS.includes(body?.targetProvider as VideoProvider)
      ? (body?.targetProvider as VideoProvider)
      : "veo";
    const resolved = await resolveVideoPromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found.", 404);

    // D201 — the prompt routes on the upstream Shot being multishot, not on the provider alone, so
    // this has to come after resolving. A multishot shot gets the timecode-ladder prompt; a single
    // one gets the continuous-take spine, which describes it better than a one-line ladder would.
    const multishot = resolved.upstreamMultishot === true;
    const promptSpec = videoPromptGeneratePromptFor({ provider: targetProvider, multishot });

    const { system, user, effectiveInstruction } = compileVideoPrompt({
      clientContext: resolved.clientContext,
      upstream: resolved.upstream,
      instruction,
      controls,
      targetProvider,
      multishot,
    });

    const userContent = buildUserContent(user, resolved.upstream);

    const request = describeModelRequest({
      system,
      compiledUser: user,
      effectiveInstruction,
      upstream: resolved.upstream,
    });

    const model = `openai:${promptSpec.model}`;
    let generation: Awaited<ReturnType<typeof insertGeneration>> | null = null;

    try {
      generation = await insertGeneration({
        nodeId,
        orgId: effectiveOrgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "prompt",
        modelUsed: model,
        paramsSnapshot: { model: promptSpec.model, targetProvider },
        inputsSnapshot: { instruction: effectiveInstruction },
      });

      const estimatedCredits = estimatePromptCredits(resolved.upstream.filter(isVisionAttachment).length);
      const reservation = await reserveCredits(effectiveOrgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }

      const openai = createOpenAI();
      const completion = await openai.chat.completions.create({
        model: promptSpec.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      });
      const output = completion.choices[0]?.message?.content?.trim() ?? "";

      const version = await insertVersion({
        nodeId,
        operatorUserId: caller.userId, // R11.1: the maker
        inputsUsed: {
          upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
          kbVersionId: resolved.kbVersionId,
          kbSlices: resolved.slices,
          request, // the exact request sent to the model (frozen provenance)
        },
        paramsUsed: {
          instruction,
          controls,
          targetProvider,
          promptId: promptSpec.id,
          promptVersion: promptSpec.version,
          tokensUsed: completion.usage ?? null,
        },
        modelUsed: model,
        output,
      });
      await setActiveVersion(nodeId, version.id);

      const usage = completion.usage;
      const cost = usage
        ? computeCost(model, {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          })
        : null;
      // Prompt-type generations settle on the same flat estimate used for the reservation
      // (5 base + 2.5/attachment), not real OpenAI token cost — unlike image/video, whose
      // real vendor $ cost IS the charge. Real cost is still recorded via costUsd below for
      // admin visibility; it no longer drives credits_charged. Settling on real cost here
      // silently dropped the attachment premium: a short completion's real cost never clears
      // usdToFinalCredits' 5-credit rounding step, so every prompt generation — regardless
      // of attachment count — settled at the same 5-credit floor.
      await settleGeneration({
        orgId: effectiveOrgId,
        generationId: generation.id,
        actualAmount: estimatedCredits,
      });
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: cost?.usd,
        creditsCharged: estimatedCredits,
        tokensUsed: usage ? { ...usage } : null,
        outputSnapshot: output,
      });

      return apiOk({ output, versionId: version.id, compiled: user });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      // a failed attempt is still a version — the log learns from failures too
      await insertVersion({
        nodeId,
        operatorUserId: caller.userId, // a failed attempt still has a maker
        inputsUsed: { request },
        paramsUsed: {
          instruction,
          targetProvider,
          promptId: promptSpec.id,
          promptVersion: promptSpec.version,
        },
        modelUsed: model,
        error: message,
      });
      if (generation?.id) {
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: effectiveOrgId, generationId: generation.id }).catch(() => null);
      }
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
  });
}
