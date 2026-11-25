import { createOpenAI } from "@/lib/openai/server";
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { buildUserContent, isVisionAttachment } from "@/lib/nodes/compose-message";
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { type ShotControls } from "@/lib/nodes/shot-controls";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { NO_PRICE_MESSAGE, priceForNewRun } from "@/lib/ai-models/run-price";
import { PROMPT_MODEL_ID } from "@/lib/ai-models/service-models";
import { promptFlatCredits, promptRunRecord } from "@/lib/ai-models/service-price";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
import { describeModelRequest } from "@/lib/nodes/model-request";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";
import { creditLimitError } from "@/lib/billing/credit-limit-error";

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
  return withNode(req, params, { need: "generate" }, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
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
    // D559 — the row is looked up before anything is recorded: no row, no run.
    const attachmentCount = resolved.upstream.filter(isVisionAttachment).length;
    const price = await priceForNewRun(PROMPT_MODEL_ID);
    const estimatedCredits = price ? promptFlatCredits(price, attachmentCount) : null;
    if (!price || estimatedCredits === null) return apiError(NO_PRICE_MESSAGE, 409);
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
        paramsSnapshot: { model: promptGeneratePrompt.model },
        inputsSnapshot: { instruction: effectiveInstruction },
        modelPriceId: price.id,
      });

      const reservation = await reserveCredits(effectiveOrgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw creditLimitError(reservation.reason);
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
          promptId: promptGeneratePrompt.id,
          promptVersion: promptGeneratePrompt.version,
          tokensUsed: completion.usage ?? null,
        },
        modelUsed: model,
        output,
      });
      await setActiveVersion(nodeId, version.id);

      const usage = completion.usage ?? null;
      // D559 — a prompt run keeps its flat price, set in the database, for reserve and settle. The
      // token cost OpenAI billed is recorded for comparison and never drives credits_charged.
      const record = promptRunRecord(price, usage, attachmentCount);
      const credits = record?.credits ?? estimatedCredits;
      await settleGeneration({
        orgId: effectiveOrgId,
        generationId: generation.id,
        actualAmount: credits,
      });
      await succeedGeneration({
        generationId: generation.id,
        versionId: version.id,
        costUsd: record?.costUsd ?? undefined,
        creditsCharged: credits,
        tokensUsed: usage ? { ...usage } : null,
        providerBill: record?.bill ?? null,
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
          promptId: promptGeneratePrompt.id,
          promptVersion: promptGeneratePrompt.version,
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
