import { createOpenAI } from "@/lib/openai/server";
import { getNodeActiveKB } from "@/lib/db/nodes";
import { normalizeSlices, buildParseContext } from "@/lib/kb/parse-context";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { compileScript } from "@/lib/nodes/script";
import { scriptParsePrompt } from "@/prompts/script-parse";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/parse  — extract a finished reel script into structured JSON.
// This is the Script node's runAction: it holds the secret and runs the model.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as
    | { source?: unknown; slices?: unknown }
    | null;
  const source = typeof body?.source === "string" ? body.source : "";
  if (!source.trim()) {
    return apiError("Provide a non-empty script to parse.", 400);
  }
  const slices = normalizeSlices(body?.slices);

  const ctx = await getNodeActiveKB(nodeId);
  if (!ctx) return apiError("Node not found.", 404);

  const clientContext = ctx.kb ? buildParseContext(ctx.kb, slices) : "";
  const { system, user } = compileScript(source, clientContext);

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
      inputsUsed: { kbSlices: ctx.kb ? slices : null, kbVersionId: ctx.kbVersionId },
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
      paramsUsed: {
        promptId: scriptParsePrompt.id,
        promptVersion: scriptParsePrompt.version,
      },
      modelUsed: `openai:${scriptParsePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
