import { createOpenAI } from "@/lib/openai/server";
import { getNodeClientContext } from "@/lib/db/nodes";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { compileBrief } from "@/lib/nodes/brief";
import { briefParsePrompt } from "@/prompts/brief-parse";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/parse  — parse a brief into structured JSON.
// This is the Brief node's runAction: it holds the secret and runs the model.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  const body = (await req.json().catch(() => null)) as { source?: unknown } | null;
  const source = typeof body?.source === "string" ? body.source : "";
  if (!source.trim()) {
    return apiError("Provide a non-empty brief to parse.", 400);
  }

  const ctx = await getNodeClientContext(nodeId);
  if (!ctx) return apiError("Node not found.", 404);

  const { system, user } = compileBrief(source, ctx.contextNotes);

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: briefParsePrompt.model,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reel_brief",
          schema: briefParsePrompt.schema,
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
      inputsUsed: { clientContext: "none" },
      paramsUsed: {
        promptId: briefParsePrompt.id,
        promptVersion: briefParsePrompt.version,
      },
      modelUsed: `openai:${briefParsePrompt.model}`,
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
        promptId: briefParsePrompt.id,
        promptVersion: briefParsePrompt.version,
      },
      modelUsed: `openai:${briefParsePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
