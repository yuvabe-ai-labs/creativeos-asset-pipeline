import { createOpenAI } from "@/lib/openai/server";
import { resolveMultishotPromptInputs, buildMultishotUserTurn } from "@/lib/nodes/resolve-inputs";
import { parsePlan, renderPlan, mergeRefinedPlan } from "@/lib/nodes/multishot-plan";
import { resolvePlanMentions } from "@/lib/nodes/plan-mentions";
import {
  multishotPromptGenerate,
  MULTISHOT_LOOK_SCHEMA,
  MULTISHOT_BEAT_SCHEMA,
  refineInstruction,
} from "@/prompts/multishot-prompt-generate";
import { buildUserContent, isVisionAttachment } from "@/lib/nodes/compose-message";
import { insertVersion } from "@/lib/db/versions";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { runPromptGeneration, CreditLimitError, type ModelUsage } from "@/lib/api/prompt-run";
import { describeModelRequest } from "@/lib/nodes/model-request";
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
      /** "all" (default) rewrites everything; "look" and "cut" rewrite one fragment. */
      scope?: unknown;
      /** The operator's one-off steer. Never persisted on the node — see paramsUsed below. */
      note?: unknown;
      /** Required when scope is "cut". */
      cutId?: unknown;
      /** The plan being refined. Required when scope is "look" or "cut". */
      plan?: unknown;
    } | null;

    const instruction = typeof body?.instruction === "string" ? body.instruction : "";
    const cutInstructions = (
      typeof body?.cutInstructions === "object" && body?.cutInstructions !== null
        ? body.cutInstructions
        : {}
    ) as Record<string, string>;

    const scope =
      body?.scope === "look" || body?.scope === "cut" ? body.scope : ("all" as const);
    const cutId = typeof body?.cutId === "string" ? body.cutId : null;
    const note = typeof body?.note === "string" ? body.note : "";

    // Capped so an accidental paste cannot silently dominate the turn and push the actual brief
    // out of the model's attention.
    if (note.length > 2000) return apiError("That note is too long.", 400);

    const resolved = await resolveMultishotPromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found", 404);
    if (resolved.cuts.length === 0) {
      return apiError("Connect a Multishot node with at least one shot", 400);
    }
    if (scope === "cut" && !cutId) {
      return apiError("No shot was named for this rewrite", 400);
    }
    // Scoped to "cut" only — a stale cutId riding along on a scope: "all" or "look" request is
    // irrelevant to that request and should not 400 it.
    if (scope === "cut" && !resolved.cuts.some((c) => c.id === cutId)) {
      return apiError("That shot is not on this node", 400);
    }

    // A narrow refine edits an existing plan, so there has to BE one. Parsed here rather than
    // trusted: the merge below writes it back out as the node's plan.
    const previous = scope === "all" ? null : parsePlan(body?.plan, resolved.cuts);
    if (scope !== "all" && !previous?.ok) {
      return apiError("Generate the whole sequence first", 400);
    }
    // Narrowed once, right after the guard above proves it: whenever scope !== "all", `previous`
    // is guaranteed `{ ok: true }` — anything else already 400ed. Everything downstream (the
    // refineInstruction call and the merge inside call()) reads this instead of re-deriving
    // `previous?.ok` a second time.
    const previousPlan = previous?.ok ? previous.plan : null;

    // One prompt, no provider routing — Omni is the only multishot model.
    const spec = multishotPromptGenerate();

    const user =
      buildMultishotUserTurn({
        clientContext: resolved.clientContext,
        upstream: resolved.upstream,
        cuts: resolved.cuts,
        instruction,
        cutInstructions,
      }) +
      refineInstruction({
        scope,
        cutId,
        // The note is authored in the chip editor, so it may carry `@[Shot 2](c2)` tokens. The
        // model has never seen that syntax — resolved here into "Shot 2 (cutId: c2)", which names
        // the same shot the turn's own shot list already names. Unresolved, it would reach the
        // writer as literal markup and be read as prose.
        note: resolvePlanMentions(note, resolved.cuts),
        plan: previousPlan ?? { look: "", beats: [] },
      });

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
        generationInputsSnapshot: { instruction, scope, cutId },
        inputsUsed: {
          upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
          kbVersionId: resolved.kbVersionId,
          kbSlices: resolved.slices,
          cuts: resolved.cuts,
          scope,
          cutId,
          // Frozen provenance — the exact request this generation sent. Was missing, so the focus
          // view's "Sent to model" tab had nothing to render and always showed its empty state.
          request: describeModelRequest({
            system: spec.system,
            compiledUser: user,
            // This node has no separate "instruction" the way the Video Prompt node does; the
            // whole compiled user turn IS what was asked, so the sequence steer stands in.
            effectiveInstruction: instruction,
            upstream: resolved.upstream,
          }),
        },
        paramsUsed: {
          instruction,
          cutInstructions,
          scope,
          cutId,
          // Not persisted on the NODE, but a version that cannot say what was asked of it is
          // useless to the eval flywheel (D22), which is the whole reason these rows exist.
          note,
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
              scope,
              cutId,
            },
            // Raw, un-narrowed (see prompt-run.ts's ModelUsage contract) — null only when the
            // call never returned a completion at all (e.g. a network failure before the
            // response), never when a returned plan simply failed validation.
            paramsUsed: { instruction, cutInstructions, scope, cutId, note, promptId: spec.id, tokensUsed: usage },
            modelUsed: model,
            error: message,
          });
        },
        call: async () => {
          const openai = createOpenAI();
          const schema =
            scope === "look"
              ? MULTISHOT_LOOK_SCHEMA
              : scope === "cut"
                ? MULTISHOT_BEAT_SCHEMA
                : spec.schema;

          const completion = await openai.chat.completions.create({
            model: spec.model,
            response_format: {
              type: "json_schema",
              json_schema: { name: "multishot_plan", schema, strict: true },
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
          usage = (completion.usage ?? null) as ModelUsage | null;

          // MERGED BEFORE VALIDATION, and validated WHOLE. The merge is what makes the version
          // row equal the plan the node ends up holding — the look re-run used to record a full
          // returned plan while the client kept only its `look`, so restoring that version
          // resurrected beats the operator never accepted.
          // `!previous?.ok` is unreachable here for a non-"all" scope: line ~79 already 400s that
          // case before `call()` ever runs. Checking only `scope === "all"` says that plainly,
          // instead of reading as if a narrow refine could fall back to a full-plan parse. The `!`
          // on previousPlan is a TS-only assertion (TS cannot correlate `scope` and
          // `previousPlan`'s nullability across two separate bindings) — not a re-check of `.ok`.
          const parsed =
            scope === "all"
              ? parsePlan(raw, resolved.cuts)
              : mergeRefinedPlan(
                  previousPlan!,
                  scope,
                  (raw ?? {}) as { look?: string; text?: string },
                  cutId ?? undefined,
                  resolved.cuts,
                );
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
