import { createOpenAI } from "@/lib/openai/server";
import { resolveVideoPromptInputs } from "@/lib/nodes/resolve-inputs";
import { compileVideoPrompt } from "@/lib/nodes/video-prompt";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { videoPromptGeneratePrompt } from "@/prompts/video-prompt-generate";
import { DEFAULT_VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

function normalizeControls(input: unknown): VideoControls {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    camera: typeof c.camera === "string" ? c.camera : DEFAULT_VIDEO_CONTROLS.camera,
    speed: typeof c.speed === "string" ? c.speed : DEFAULT_VIDEO_CONTROLS.speed,
  };
}

// POST /api/nodes/:id/video-prompt — the Video Prompt node's runAction: resolve inputs
// (KB + upstream, with the Image Gen still as a vision part), compile, call the text LLM
// synchronously, append a version, move the active pointer. Mirrors the Prompt generate route.
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

  const resolved = await resolveVideoPromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const { system, user } = compileVideoPrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
    controls,
  });

  const userContent = buildUserContent(user, resolved.upstream);

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: videoPromptGeneratePrompt.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
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
        controls,
        promptId: videoPromptGeneratePrompt.id,
        promptVersion: videoPromptGeneratePrompt.version,
        tokensUsed: completion.usage ?? null,
      },
      modelUsed: `openai:${videoPromptGeneratePrompt.model}`,
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
        promptId: videoPromptGeneratePrompt.id,
        promptVersion: videoPromptGeneratePrompt.version,
      },
      modelUsed: `openai:${videoPromptGeneratePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
