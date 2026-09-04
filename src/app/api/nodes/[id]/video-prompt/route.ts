import { createOpenAI } from "@/lib/openai/server";
import { resolveVideoPromptInputs } from "@/lib/nodes/resolve-inputs";
import { compileVideoPrompt } from "@/lib/nodes/video-prompt";
import { buildUserContent, isVisionAttachment } from "@/lib/nodes/compose-message";
import { videoPromptGeneratePromptFor, type VideoProvider } from "@/prompts/video-prompt-generate";
import { normalizeVideoControls } from "@/lib/nodes/video-controls";
import { insertVersion } from "@/lib/db/versions";
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
import { runPromptGeneration, CreditLimitError, type ModelUsage } from "@/lib/api/prompt-run";
import { describeModelRequest } from "@/lib/nodes/model-request";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

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
    const controls = normalizeVideoControls(body?.controls);

    const VALID_PROVIDERS: VideoProvider[] = ["veo", "kling", "gemini-omni"];
    const targetProvider: VideoProvider = VALID_PROVIDERS.includes(body?.targetProvider as VideoProvider)
      ? (body?.targetProvider as VideoProvider)
      : "veo";
    // D231 — the multishot ladder prompt now lives entirely on the Multishot Prompt node
    // (multishotPromptGenerate). A Shot upstream is always a single continuous take (D229), and a
    // Multishot node cannot connect to this route at all — so this route always gets the
    // continuous-take spine and the operator's own targetProvider, with no coercion.
    const resolved = await resolveVideoPromptInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found.", 404);

    const promptSpec = videoPromptGeneratePromptFor({ provider: targetProvider });

    const { system, user, effectiveInstruction } = compileVideoPrompt({
      clientContext: resolved.clientContext,
      upstream: resolved.upstream,
      instruction,
      controls,
      targetProvider,
    });

    const userContent = buildUserContent(user, resolved.upstream);

    const request = describeModelRequest({
      system,
      compiledUser: user,
      effectiveInstruction,
      upstream: resolved.upstream,
    });

    const model = `openai:${promptSpec.model}`;
    const estimatedCredits = estimatePromptCredits(resolved.upstream.filter(isVisionAttachment).length);

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
        generationParamsSnapshot: { model: promptSpec.model, targetProvider },
        generationInputsSnapshot: { instruction: effectiveInstruction },
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
        },
        // A failed attempt is still a version — the log learns from failures too. This runs
        // BEFORE the helper's own failGeneration/refundReservation cleanup, preserving the
        // original call order (insertVersion(failed) → failGeneration → refundReservation)
        // across the extraction — the route's own catch below only turns the error into a
        // response now.
        onFailure: async (e) => {
          const message = e instanceof Error ? e.message : "Generation failed";
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
        },
        call: async () => {
          const openai = createOpenAI();
          const completion = await openai.chat.completions.create({
            model: promptSpec.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userContent },
            ],
          });
          const output = completion.choices[0]?.message?.content?.trim() ?? "";
          // Raw, un-narrowed — persisted as-is by the helper. Narrowing to the three
          // canonical fields here would silently drop whatever else the provider returned
          // (e.g. prompt_tokens_details.cached_tokens) before it ever reached storage. The
          // cast just tells TS what we already know structurally (OpenAI's CompletionUsage
          // has the three canonical fields plus extras) — the object itself is untouched.
          const usage = (completion.usage ?? null) as ModelUsage | null;
          return { output, usage };
        },
      });

      return apiOk({ output, versionId, compiled: user });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      const status = e instanceof CreditLimitError ? 402 : 500;
      return apiError(message, status);
    }
  });
}
