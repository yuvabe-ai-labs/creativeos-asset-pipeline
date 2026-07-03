import { createOpenAI } from "@/lib/openai/server";
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { type ShotControls } from "@/lib/nodes/shot-controls";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { describeModelRequest } from "@/lib/nodes/model-request";
import { apiError, apiOk } from "@/lib/api/route-helpers";

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
  const { id: nodeId } = await params;
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

  try {
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
      modelUsed: `openai:${promptGeneratePrompt.model}`,
      output,
    });
    await setActiveVersion(nodeId, version.id);

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
      modelUsed: `openai:${promptGeneratePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
