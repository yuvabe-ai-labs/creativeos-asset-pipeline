import { createOpenAI } from "@/lib/openai/server";
import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/generate — the Prompt node's runAction: resolve inputs,
// compile, call the model, append a version, move the active pointer. Mirrors the
// Script parse route.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { instruction?: unknown; slices?: unknown }
    | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";

  const resolved = await resolvePromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const { system, user } = compilePrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
  });

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: promptGeneratePrompt.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const output = completion.choices[0]?.message?.content?.trim() ?? "";

    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
        kbVersionId: resolved.kbVersionId,
        kbSlices: resolved.slices,
      },
      paramsUsed: {
        instruction,
        promptId: promptGeneratePrompt.id,
        promptVersion: promptGeneratePrompt.version,
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
