import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import {
  listKBDocuments,
  insertKBVersion,
  setActiveKBVersion,
  getActiveKBVersion,
} from "@/lib/db/kb";
import { setKBStatus } from "@/lib/db/clients";
import {
  TraceableBrandKBSchema,
  defaultEmptyImageAnalysis,
  type TraceableBrandKB,
} from "@/lib/kb/schema";
import { startImageAnalysisQuietly } from "@/lib/image-analysis/start";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

const TEXT_EXTENSIONS = new Set(["md", "txt"]);
const FILE_EXTENSIONS = new Set(["pdf", "docx", "pptx"]);

const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });
type DocExtractionResult = z.infer<typeof DocExtractionSchema>;

// POST /api/clients/:id/kb/re-extract
// Re-runs AI extraction with the client's existing documents. Creates a new KB version, sets it
// active, and resets kb_status to 'in_review'. Image Analysis is carried over from the current
// version and then rewritten by an image-analysis run, which reads every brand image (D312).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, async (clientId) => {
    return withTryCatch("Re-extraction failed", async () => {
      const [docs, current] = await Promise.all([listKBDocuments(clientId), getActiveKBVersion(clientId)]);

      if (docs.length === 0) {
        return apiError("No documents found. Upload at least one document first.", 400);
      }

      const docUserContent: unknown[] = [];
      for (const doc of docs) {
        if (FILE_EXTENSIONS.has(doc.file_ext)) {
          docUserContent.push({ type: "input_file", file_url: doc.storage_url });
        } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
          const res = await fetch(doc.storage_url);
          if (!res.ok) return apiError(`Could not fetch document: ${doc.filename}`, 502);
          docUserContent.push({ type: "input_text", text: await res.text() });
        }
      }
      docUserContent.push({
        type: "input_text",
        text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings.",
      });

      const openai = createOpenAI();
      const docResponse = await openai.responses.parse({
        model: kbExtractPrompt.model,
        input: [
          { role: "system", content: kbExtractPrompt.system },
          { role: "user", content: docUserContent as never },
        ],
        text: { format: zodTextFormat(DocExtractionSchema, "brand_kb") },
        temperature: 0.5,
      });

      const docKB = docResponse.output_parsed as DocExtractionResult | null;
      if (!docKB) return apiError("Model returned no parsed output.", 500);

      const previous = (current?.output as TraceableBrandKB | undefined)?.image_analysis;
      const mergedKB: TraceableBrandKB = {
        ...docKB,
        image_analysis: previous ?? defaultEmptyImageAnalysis(),
      };

      const fillRate = computeFillRate(mergedKB);
      const version = await insertKBVersion({
        clientId,
        output: mergedKB,
        modelUsed: kbExtractPrompt.model,
        docIdsUsed: docs.map((d) => d.id),
        fillRate,
      });

      await setActiveKBVersion(clientId, version.id);
      await setKBStatus(clientId, "in_review");
      await startImageAnalysisQuietly(clientId);

      return apiOk({ versionId: version.id, fillRate });
    });
  });
}
