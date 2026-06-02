import { NextResponse } from "next/server";
import { createOpenAI } from "@/lib/openai/server";
import { getNodeClientContext } from "@/lib/db/nodes";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { compileBrief } from "@/lib/nodes/brief";

const MODEL = "gpt-4o-mini";

// POST /api/nodes/:id/parse  — parse a brief into structured JSON.
// This is the Brief node's runAction: it holds the secret and runs the model.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;

  // body carries the *current* source (fresher than the debounced-saved node)
  const body = (await req.json().catch(() => null)) as { source?: unknown } | null;
  const source = typeof body?.source === "string" ? body.source : "";
  if (!source.trim()) {
    return NextResponse.json(
      { error: "Provide a non-empty brief to parse." },
      { status: 400 },
    );
  }

  // resolveInputs — ambient client context (walk node → canvas → client)
  const ctx = await getNodeClientContext(nodeId);
  if (!ctx) {
    return NextResponse.json({ error: "Node not found." }, { status: 404 });
  }

  // compile — pure (source + context) → payload
  const { system, user } = compileBrief(source, ctx.contextNotes);

  try {
    // runAction — the model call
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const output = JSON.parse(content);

    // writeVersion (append-only) + setActive (move the pointer)
    const version = await insertVersion({
      nodeId,
      inputsUsed: { clientContext: ctx.contextNotes ? "included" : "none" },
      paramsUsed: { instruction: system },
      modelUsed: `openai:${MODEL}`,
      output,
    });
    await setActiveVersion(nodeId, version.id);

    return NextResponse.json({ output, versionId: version.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse failed";
    // a failed attempt is still a version — the log learns from failures too
    await insertVersion({
      nodeId,
      paramsUsed: { instruction: system },
      modelUsed: `openai:${MODEL}`,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
