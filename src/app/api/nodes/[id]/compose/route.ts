import { createOpenAI } from "@/lib/openai/server";
import { resolveShotComposeInputs } from "@/lib/nodes/resolve-inputs";
import {
  renderComposeContext,
  renderMultishotComposeContext,
  type ShotComposeIdea,
  type ShotComposeSequence,
} from "@/lib/nodes/shot-compose";
import { getShotRole } from "@/lib/nodes/shot-roles";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { shotComposePrompt } from "@/prompts/shot-compose";
import { shotComposeMultishotPrompt } from "@/prompts/shot-compose-multishot";
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
    // Both composers write compose rows onto the same node, so the rehydrate must recognise
    // EITHER promptId. Matching only the single-shot one left a multishot node's sheet empty
    // after a reload while its run sat in the version log.
    const COMPOSE_PROMPT_IDS = [shotComposePrompt.id, shotComposeMultishotPrompt.id] as string[];
    const latest = rows.find(
      (v) =>
        COMPOSE_PROMPT_IDS.includes((v.params_used as { promptId?: string } | null)?.promptId ?? "") &&
        !v.error,
    );
    if (!latest) {
      return apiOk({ ideas: [], sequences: [], role: null, versionId: null, selectedIndex: null });
    }

    const gen = (latest.generated_output ?? {}) as {
      ideas?: ShotComposeIdea[];
      sequences?: ShotComposeSequence[];
    };
    const out = (latest.output ?? {}) as {
      ideas?: ShotComposeIdea[];
      sequences?: ShotComposeSequence[];
      selectedIndex?: number;
    };
    return apiOk({
      ideas: gen.ideas ?? out.ideas ?? [],
      sequences: gen.sequences ?? out.sequences ?? [],
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
    const body = (await req.json().catch(() => null)) as
      | { role?: unknown; slices?: unknown }
      | null;
    const role = getShotRole(typeof body?.role === "string" ? body.role : "");

    const resolved = await resolveShotComposeInputs(nodeId, body?.slices);
    if (!resolved) return apiError("Node not found.", 404);

    // D201 — the composer's UNIT depends on the shot. A multishot shot's beats have to cut
    // together, so it composes whole SEQUENCES (one beat per beat); a single shot composes
    // alternative descriptions of itself. Different prompt, different schema, different user turn
    // — and a distinct promptId recorded below, so the eval flywheel can tell the two apart.
    const multishot = resolved.multishot;
    const spec = multishot ? shotComposeMultishotPrompt : shotComposePrompt;

    const user = multishot
      ? renderMultishotComposeContext({
          shots: resolved.shots,
          role,
          clientContext: resolved.clientContext,
          objective: resolved.objective,
        })
      : renderComposeContext({
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
            name: multishot ? "shot_sequences" : "shot_ideas",
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
      const parsed = JSON.parse(content) as {
        ideas?: ShotComposeIdea[];
        sequences?: ShotComposeSequence[];
      };
      const ideas = multishot ? [] : (Array.isArray(parsed.ideas) ? parsed.ideas : []).slice(0, 4);
      const sequences = multishot
        ? (Array.isArray(parsed.sequences) ? parsed.sequences : []).slice(0, 3)
        : [];

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
          multishot,
          promptId: spec.id,
          promptVersion: spec.version,
          tokensUsed: completion.usage ?? null,
        },
        modelUsed: `openai:${spec.model}`,
        // generated_output frozen (D22) — one key or the other, never both, so a reader can tell
        // which composer produced the row without consulting promptId.
        output: multishot ? { sequences } : { ideas },
      });
      // NB: intentionally NO setActiveVersion — capture-only (D28).

      return apiOk({ ideas, sequences, versionId: version.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Compose failed";
      await insertVersion({
        nodeId,
        operatorUserId: caller.userId, // a failed attempt still has a maker
        paramsUsed: { role: role.key, multishot, promptId: spec.id, promptVersion: spec.version },
        modelUsed: `openai:${spec.model}`,
        error: message,
      });
      return apiError(message, 500);
    }
  });
}
