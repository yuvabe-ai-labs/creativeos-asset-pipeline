import { createOpenAI } from "@/lib/openai/server";
import { resolveShotComposeInputs } from "@/lib/nodes/resolve-inputs";
import { renderComposeContext, type ShotComposeIdea } from "@/lib/nodes/shot-compose";
import { getShotRole } from "@/lib/nodes/shot-roles";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { shotComposePrompt } from "@/prompts/shot-compose";
import { insertVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compose — the Shot Composer's runAction (D28). Resolve the Shot's own
// trimmed seed + KB + optional vision image, call the LLM for 4 structured ideas, and CAPTURE
// the run via insertVersion. CRITICAL: do NOT setActiveVersion — the Shot keeps rendering its
// own data.script (D19/D20); this row is frozen provenance for the eval flywheel (D22).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { role?: unknown; slices?: unknown }
    | null;
  const role = getShotRole(typeof body?.role === "string" ? body.role : "");

  const resolved = await resolveShotComposeInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const user = renderComposeContext({
    seedText: resolved.seedText,
    role,
    clientContext: resolved.clientContext,
  });
  const userContent = buildUserContent(user, resolved.imageUpstream);

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: shotComposePrompt.model,
      response_format: {
        type: "json_schema",
        json_schema: { name: "shot_ideas", schema: shotComposePrompt.schema, strict: true },
      },
      messages: [
        { role: "system", content: shotComposePrompt.system },
        { role: "user", content: userContent },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { ideas?: ShotComposeIdea[] };
    const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : []).slice(0, 4);

    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        role: role.key,
        kbSlices: resolved.slices,
        kbVersionId: resolved.kbVersionId,
        imageRef: resolved.imageUpstream.map((u) => u.fileUrl).filter(Boolean),
      },
      paramsUsed: {
        role: role.key,
        promptId: shotComposePrompt.id,
        promptVersion: shotComposePrompt.version,
        tokensUsed: completion.usage ?? null,
      },
      modelUsed: `openai:${shotComposePrompt.model}`,
      output: { ideas }, // generated_output frozen = { ideas } (D22)
    });
    // NB: intentionally NO setActiveVersion — capture-only (D28).

    return apiOk({ ideas, versionId: version.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Compose failed";
    await insertVersion({
      nodeId,
      paramsUsed: { role: role.key, promptId: shotComposePrompt.id, promptVersion: shotComposePrompt.version },
      modelUsed: `openai:${shotComposePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
