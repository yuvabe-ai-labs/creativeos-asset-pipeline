import { createOpenAI } from "@/lib/openai/server";
import { fileNodeExtractPrompt } from "@/prompts/file-node-extract";
import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";
import type { FileNodeData } from "@/lib/canvas-nodes";

// POST /api/nodes/:id/file/extract — run LLM extraction on the attached file.
// Body: { llmPrompt: string, fileKind: string, rawText?: string, fileUrl?: string }
// The client sends file metadata directly (canvas store is in-memory, not persisted to DB).
// Auth is deferred (decision D14) — no session check, consistent with the upload route.
// Response: { processedOutput: string }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // consume required param

  const body = await req.json().catch(() => null);
  const llmPrompt = typeof body?.llmPrompt === "string" ? body.llmPrompt.trim() : "";
  if (!llmPrompt) return apiError("llmPrompt is required.", 400);

  const fileKind = body?.fileKind as FileNodeData["fileKind"] | undefined;
  const rawText = body?.rawText as string | undefined;
  const fileUrl = body?.fileUrl as string | undefined;

  if (!fileKind) return apiError("No file attached to this node.", 400);

  type OpenAIContentItem =
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string }
    | { type: "input_file"; file_url: string };

  let fileContent: OpenAIContentItem;
  if (fileKind === "text") {
    if (!rawText) return apiError("No text content found for this node.", 400);
    fileContent = { type: "input_text", text: rawText };
  } else if (fileKind === "image") {
    if (!fileUrl) return apiError("No image URL found for this node.", 400);
    fileContent = { type: "input_image", image_url: fileUrl };
  } else {
    // document
    if (!fileUrl) return apiError("No document URL found for this node.", 400);
    fileContent = { type: "input_file", file_url: fileUrl };
  }

  return withTryCatch("Extraction failed", async () => {
    const openai = createOpenAI();
    const response = await openai.responses.create({
      model: fileNodeExtractPrompt.model,
      input: [
        { role: "system", content: fileNodeExtractPrompt.system },
        {
          role: "user",
          content: [
            { type: "input_text", text: llmPrompt },
            fileContent,
          ] as never,
        },
      ],
    });
    return apiOk({ processedOutput: response.output_text });
  });
}
