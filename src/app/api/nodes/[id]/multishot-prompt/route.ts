import { createOpenAI } from "@/lib/openai/server";
import { resolveMultishotPromptInputs, buildMultishotUserTurn } from "@/lib/nodes/resolve-inputs";
import { parsePlan, renderPlan } from "@/lib/nodes/multishot-plan";
import { multishotPromptGenerate } from "@/prompts/multishot-prompt-generate";
import { buildUserContent, isVisionAttachment } from "@/lib/nodes/compose-message";
import { insertVersion } from "@/lib/db/versions";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { runPromptGeneration, CreditLimitError, type ModelUsage } from "@/lib/api/prompt-run";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// A returned plan that fails parsePlan must never become the node's output — it is thrown from
// inside `call()` below, BEFORE runPromptGeneration ever reaches its insertVersion step, so the
// credit/version envelope naturally never writes a bad plan as a version. The outer catch turns
// this into a 422 (a schema/parser disagreement, not a credit or infra failure).
class PlanValidationError extends Error {}

// POST /api/nodes/:id/multishot-prompt — the Multishot Prompt node's runAction: resolve inputs
// (KB + upstream + the upstream Multishot node's cut list), build the per-shot user turn, call
// the writer, validate the WHOLE plan against the node's cuts, then append a version. Reuses
// runPromptGeneration (Task 12) for the reserve -> generation row -> call -> settle/refund ->
// version -> activate envelope — this route supplies only the withNode wrapper, body parsing and
// the model call itself.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, _node, caller, clientId, effectiveOrgId) => {
    const body = (await req.json().catch(() => null)) as {
      instruction?: unknown;
      slices?: unknown;
      cutInstructions?: unknown;
      /** Present on a per-beat re-run: rewrite ONLY this beat. */
      onlyCutId?: unknown;
      /** The plan being edited, required when onlyCutId is set. */
      plan?: unknown;
    } | null;

    const instruction = typeof body?.instruction === "string" ? body.instruction : "";
    const cutInstructions = (
      typeof body?.cutInstructions === "object" && body?.cutInstructions !== null
        ? body.cutInstructions
        : {}
    ) as Record<string, string>;
    const onlyCutId = typeof body?.onlyCutId === "string" ? body.onlyCutId : null;

    const resolved = await resolveMultishotPromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found", 404);
    if (resolved.cuts.length === 0) {
      return apiError("Connect a Multishot node with at least one shot", 400);
    }
    if (onlyCutId && !resolved.cuts.some((c) => c.id === onlyCutId)) {
      return apiError("That shot is not on this node", 400);
    }

    // One prompt, no provider routing — Omni is the only multishot model.
    const spec = multishotPromptGenerate();

    let user = buildMultishotUserTurn({
      clientContext: resolved.clientContext,
      upstream: resolved.upstream,
      cuts: resolved.cuts,
      instruction,
      cutInstructions,
    });

    // A per-beat re-run carries the whole current plan as context, so the rewritten beat still
    // cuts against its neighbours instead of being written in isolation.
    const previous = onlyCutId ? parsePlan(body?.plan, resolved.cuts) : null;
    if (onlyCutId) {
      if (!previous?.ok) return apiError("Generate the whole sequence first", 400);
      user +=
        `\n\nThe current plan is below. Rewrite ONLY the beat whose cutId is ${onlyCutId}, ` +
        `so it still cuts against the beats either side of it. Return every beat, ` +
        `with the others unchanged.\n\n${JSON.stringify(previous.plan, null, 2)}`;
    }

    const model = `openai:${spec.model}`;
    const estimatedCredits = estimatePromptCredits(resolved.upstream.filter(isVisionAttachment).length);

    // Set inside `call()` as soon as the (real, billed) completion comes back — BEFORE the
    // parsePlan check below, which can throw. onFailure closes over this too, so a plan that
    // fails validation still writes the token usage of the call that actually happened, instead
    // of a refund with no accounting trail. See Finding 1: usage read after the throw meant a
    // rejected plan cost money nothing recorded.
    let usage: ModelUsage | null = null;

    try {
      const { output, versionId } = await runPromptGeneration({
        nodeId,
        orgId: effectiveOrgId,
        clientId,
        userId: caller.userId,
        userEmail: caller.email,
        operatorUserId: caller.userId, // R11.1: the maker
        type: "prompt",
        model,
        estimatedCredits,
        generationParamsSnapshot: { model: spec.model, promptId: spec.id },
        generationInputsSnapshot: { instruction, onlyCutId },
        inputsUsed: {
          upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
          kbVersionId: resolved.kbVersionId,
          kbSlices: resolved.slices,
          cuts: resolved.cuts,
          onlyCutId,
        },
        paramsUsed: {
          instruction,
          cutInstructions,
          onlyCutId,
          promptId: spec.id,
        },
        // A failed attempt is still a version — mirrors video-prompt/route.ts's onFailure, which
        // runs BEFORE the helper's own failGeneration/refundReservation cleanup.
        onFailure: async (e) => {
          const message = e instanceof Error ? e.message : "Generation failed";
          await insertVersion({
            nodeId,
            operatorUserId: caller.userId, // a failed attempt still has a maker
            inputsUsed: {
              kbVersionId: resolved.kbVersionId,
              kbSlices: resolved.slices,
              cuts: resolved.cuts,
              onlyCutId,
            },
            // Raw, un-narrowed (see prompt-run.ts's ModelUsage contract) — null only when the
            // call never returned a completion at all (e.g. a network failure before the
            // response), never when a returned plan simply failed validation.
            paramsUsed: { instruction, cutInstructions, onlyCutId, promptId: spec.id, tokensUsed: usage },
            modelUsed: model,
            error: message,
          });
        },
        call: async () => {
          const openai = createOpenAI();
          const completion = await openai.chat.completions.create({
            model: spec.model,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "multishot_plan",
                schema: spec.schema,
                strict: true,
              },
            },
            messages: [
              { role: "system", content: spec.system },
              {
                role: "user",
                content: buildUserContent(user, resolved.upstream.filter(isVisionAttachment)),
              },
            ],
          });

          const raw = JSON.parse(completion.choices[0]?.message?.content ?? "null");

          // Read BEFORE the parsePlan check below — that check throws on a rejected plan, and
          // the completion above already really happened (and was billed) by this point. Raw,
          // un-narrowed — persisted as-is by the helper. See prompt-run.ts's ModelUsage
          // contract: narrowing here would silently drop whatever else the provider returned.
          usage = (completion.usage ?? null) as ModelUsage | null;

          // Validated WHOLE before anything is written. A rejected plan must never become the
          // node's output — a partially applied one leaves a mix of new and stale beats that
          // nothing downstream could tell apart.
          const parsed = parsePlan(raw, resolved.cuts);
          if (!parsed.ok) {
            throw new PlanValidationError(parsed.reason);
          }

          return { output: parsed.plan, usage };
        },
      });

      return apiOk({
        plan: output,
        prompt: renderPlan(output, resolved.cuts),
        versionId,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      const status =
        e instanceof PlanValidationError ? 422 : e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
  });
}
