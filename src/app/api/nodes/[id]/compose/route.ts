import { createOpenAI } from "@/lib/openai/server";
import { resolveShotComposeInputs } from "@/lib/nodes/resolve-inputs";
import { renderComposeContext, type ShotComposeIdea } from "@/lib/nodes/shot-compose";
import { getShotRole } from "@/lib/nodes/shot-roles";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { shotComposePrompt } from "@/prompts/shot-compose";
import { insertVersion, listVersions } from "@/lib/db/versions";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// GET /api/nodes/:id/compose — the latest compose run for this Shot, so the sheet can
// rehydrate on canvas reload (D28: capture-only; this READS the captured row, no panel).
// Returns the frozen 4 ideas + the role that produced them + that row's id.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId) => {
    const rows = await listVersions(nodeId); // newest first (created_at desc)
    const latest = rows.find(
      (v) =>
        ((v.params_used as { promptId?: string } | null)?.promptId ?? "") === shotComposePrompt.id &&
        !v.error,
    );
    if (!latest) {
      return apiOk({ ideas: [], role: null, versionId: null, selectedIndex: null });
    }

    const gen = (latest.generated_output ?? {}) as { ideas?: ShotComposeIdea[] };
    const out = (latest.output ?? {}) as { ideas?: ShotComposeIdea[]; selectedIndex?: number };
    return apiOk({
      ideas: gen.ideas ?? out.ideas ?? [],
      role: (latest.inputs_used as { role?: string } | null)?.role ?? null,
      versionId: latest.id,
      selectedIndex: typeof out.selectedIndex === "number" ? out.selectedIndex : null,
    });
  });
}

// POST /api/nodes/:id/compose — the Shot Composer's runAction (D28). Resolve the Shot's own
// trimmed seed + KB + optional vision image, call the LLM for 4 structured ideas, and CAPTURE
// the run via insertVersion. CRITICAL: do NOT setActiveVersion — the Shot keeps rendering its
// own data.script (D19/D20); this row is frozen provenance for the eval flywheel (D22).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, _node, caller) => {
    const body = (await req.json().catch(() => null)) as { role?: unknown; slices?: unknown } | null;
    const roleKey = typeof body?.role === "string" ? body.role : "";

    const resolved = await resolveShotComposeInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found.", 404);

    const role = getShotRole(roleKey);
    const spec = shotComposePrompt;

    const user = renderComposeContext({
      seedText: resolved.seedText,
      role,
      clientContext: resolved.clientContext,
    });
    const userContent = buildUserContent(user, resolved.imageUpstream);

    try {
      const openai = createOpenAI();
      const completion = await openai.chat.completions.create({
        model: spec.model,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "shot_ideas",
            schema: spec.schema,
            strict: true,
          },
        },
        messages: [
          { role: "system", content: spec.system },
          { role: "user", content: userContent },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as { ideas?: ShotComposeIdea[] };
      const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : []).slice(0, 4);

      const version = await insertVersion({
        nodeId,
        // R11.1. A compose row is capture-only (D28, never set active), so it never
        // enters the review queue — but it still has a maker worth recording.
        operatorUserId: caller.userId,
        inputsUsed: {
          role: role.key,
          kbSlices: resolved.slices,
          kbVersionId: resolved.kbVersionId,
          imageRef: resolved.imageUpstream.map((u) => u.fileUrl).filter(Boolean),
        },
        paramsUsed: {
          role: role.key,
          promptId: spec.id,
          promptVersion: spec.version,
          tokensUsed: completion.usage ?? null,
        },
        modelUsed: `openai:${spec.model}`,
        output: { ideas },
      });
      // NB: intentionally NO setActiveVersion — capture-only (D28).

      return apiOk({ ideas, versionId: version.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Compose failed";
      await insertVersion({
        nodeId,
        operatorUserId: caller.userId, // a failed attempt still has a maker
        paramsUsed: { role: role.key, promptId: spec.id, promptVersion: spec.version },
        modelUsed: `openai:${spec.model}`,
        error: message,
      });
      return apiError(message, 500);
    }
  });
}
