import { createOpenAI } from "@/lib/openai/server";
import { getNodeActiveKB } from "@/lib/db/nodes";
import { listSignalsWithItems } from "@/lib/db/signals";
import {
  buildSignalBrief,
  normalizeSignalIds,
  normalizeSignalMode,
  selectSignalsByIds,
} from "@/lib/market/signal-brief";
import { normalizeSlices, buildParseContext } from "@/lib/kb/parse-context";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { compileScript } from "@/lib/nodes/script";
import { scriptParsePrompt } from "@/prompts/script-parse";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/parse  — extract a finished reel script into structured JSON.
// This is the Script node's runAction: it holds the secret and runs the model.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(req, params, async (nodeId, _node, caller) => {
    const body = (await req.json().catch(() => null)) as
      | { source?: unknown; slices?: unknown; signalIds?: unknown; signalMode?: unknown }
      | null;
    const source = typeof body?.source === "string" ? body.source : "";
    if (!source.trim()) {
      return apiError("Provide a non-empty script to parse.", 400);
    }
    const slices = normalizeSlices(body?.slices);
    const requestedSignalIds = normalizeSignalIds(body?.signalIds);
    const signalMode = normalizeSignalMode(body?.signalMode);

    const ctx = await getNodeActiveKB(nodeId);
    if (!ctx) return apiError("Node not found.", 404);

    const clientContext = ctx.kb ? buildParseContext(ctx.kb, slices) : "";

    // D204: client scoping is the authorization boundary — ids not owned by this
    // node's client (or since deleted) drop silently instead of failing the parse.
    let signalBrief = "";
    let usedSignalIds: string[] = [];
    if (requestedSignalIds.length > 0) {
      const signals = selectSignalsByIds(
        await listSignalsWithItems(ctx.clientId),
        requestedSignalIds,
      );
      usedSignalIds = signals.map((s) => s.id);
      signalBrief = buildSignalBrief(signals);
    }
    const { system, user } = compileScript(source, clientContext, signalBrief, signalMode);

    try {
      const openai = createOpenAI();
      const completion = await openai.chat.completions.create({
        model: scriptParsePrompt.model,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "reel_script",
            schema: scriptParsePrompt.schema,
            strict: true,
          },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? "{}";
      const output = JSON.parse(content);

      const version = await insertVersion({
        nodeId,
        operatorUserId: caller.userId, // R11.1: the maker
        inputsUsed: {
          kbSlices: ctx.kb ? slices : null,
          kbVersionId: ctx.kbVersionId,
          signalIds: usedSignalIds.length ? usedSignalIds : null,
          signalMode: usedSignalIds.length ? signalMode : null,
        },
        paramsUsed: {
          promptId: scriptParsePrompt.id,
          promptVersion: scriptParsePrompt.version,
        },
        modelUsed: `openai:${scriptParsePrompt.model}`,
        output,
      });
      await setActiveVersion(nodeId, version.id);

      return apiOk({ output, versionId: version.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Parse failed";
      // a failed attempt is still a version — the log learns from failures too
      await insertVersion({
        nodeId,
        operatorUserId: caller.userId, // a failed attempt still has a maker
        paramsUsed: {
          promptId: scriptParsePrompt.id,
          promptVersion: scriptParsePrompt.version,
        },
        modelUsed: `openai:${scriptParsePrompt.model}`,
        error: message,
      });
      return apiError(message, 500);
    }
  });
}
