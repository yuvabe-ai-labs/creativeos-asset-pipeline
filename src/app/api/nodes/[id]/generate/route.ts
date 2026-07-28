import { createOpenAI } from "@/lib/openai/server";
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { type ShotControls } from "@/lib/nodes/shot-controls";
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

// Coerce the request body's controls into a well-shaped ShotControls (unknown values are
// harmless — renderShotControls ignores anything not in the catalog).
function normalizeControls(input: unknown): ShotControls {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    lens: typeof c.lens === "string" ? c.lens : "auto",
    composition: typeof c.composition === "string" ? c.composition : "auto",
    lighting: typeof c.lighting === "string" ? c.lighting : "auto",
  };
}

// POST /api/nodes/:id/generate — the Prompt node's runAction: resolve inputs,
// compile, call the model, append a version, move the active pointer. Mirrors the
// Script parse route.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async (nodeId, _node, caller, clientId) => {
    const body = (await req.json().catch(() => null)) as
      | { instruction?: unknown; slices?: unknown; controls?: unknown }
      | null;
    const instruction = typeof body?.instruction === "string" ? body.instruction : "";
    const controls = normalizeControls(body?.controls);

    const resolved = await resolvePromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found.", 404);

    const { system, user, effectiveInstruction } = compilePrompt({
      clientContext: resolved.clientContext,
      upstream: resolved.upstream,
      instruction,
      controls,
    });

    const userContent = buildUserContent(user, resolved.upstream);

    const request = describeModelRequest({
      system,
      compiledUser: user,
      effectiveInstruction,
      upstream: resolved.upstream,
    });

    const model = `openai:${promptGeneratePrompt.model}`;
    let generation: Awaited<ReturnType<typeof insertGeneration>> | null = null;

    try {
      generation = await insertGeneration({
        nodeId,
        orgId: caller.orgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        type: "prompt",
        modelUsed: model,
        paramsSnapshot: { model: promptGeneratePrompt.model },
        inputsSnapshot: { instruction: effectiveInstruction },
      });

      const estimatedCredits = estimatePromptCredits(resolved.upstream.length);
      const reservation = await reserveCredits(caller.orgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }

      const openai = createOpenAI();
      const completion = await openai.chat.completions.create({
        model: promptGeneratePrompt.model,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: userContent },
        ],
      });
      const output = completion.choices[0]?.message?.content?.trim() ?? "";

      const version = await insertVersion({
        nodeId,
        inputsUsed: {
          upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
          kbVersionId: resolved.kbVersionId,
          kbSlices: resolved.slices,
          request, // the exact request sent to the model (frozen provenance)
        },
        paramsUsed: {
          instruction,
          controls,
          promptId: promptGeneratePrompt.id,
          promptVersion: promptGeneratePrompt.version,
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
        orgId: caller.orgId,
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
        inputsUsed: { request },
        paramsUsed: {
          instruction,
          promptId: promptGeneratePrompt.id,
          promptVersion: promptGeneratePrompt.version,
        },
        modelUsed: model,
        error: message,
      });
      if (generation?.id) {
        await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
        await refundReservation({ orgId: caller.orgId, generationId: generation.id }).catch(() => null);
      }
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
  });
}
