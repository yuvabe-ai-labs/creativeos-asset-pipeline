import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import {
  listKBDocuments,
  listBrandImages,
  insertKBVersion,
  setActiveKBVersion,
} from "@/lib/db/kb";
import { setKBStatus } from "@/lib/db/clients";
import {
  TraceableBrandKBSchema,
  ImageAnalysisSchema,
  type TraceableBrandKB,
  type KBField,
} from "@/lib/kb/schema";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { kbImageAnalyzePrompt } from "@/prompts/kb-image-analyze";
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

const TEXT_EXTENSIONS = new Set(["md", "txt"]);
const FILE_EXTENSIONS = new Set(["pdf", "docx", "pptx"]);

const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });
type DocExtractionResult = z.infer<typeof DocExtractionSchema>;

function emptyKBField<T>(value: T | null = null): KBField<T> {
  return { value, confidence: "low", evidence_type: "inferred", status: "needs_review" };
}

function defaultEmptyImageAnalysis(): TraceableBrandKB["image_analysis"] {
  return {
    dominant_colors: emptyKBField<string[]>(null),
    visual_mood: emptyKBField(null),
    aesthetic: emptyKBField(null),
    subjects: emptyKBField(null),
    composition_style: emptyKBField(null),
    lighting_character: emptyKBField(null),
    brand_consistency_notes: emptyKBField(null),
  };
}

// POST /api/clients/:id/kb/re-extract
// Re-runs AI extraction with the client's existing documents and images.
// Creates a new KB version, sets it active, and resets kb_status to 'in_review'.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    return withTryCatch("Re-extraction failed", async () => {
      const [docs, images] = await Promise.all([
        listKBDocuments(clientId),
        listBrandImages(clientId),
      ]);

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

      const imageUserContent: unknown[] = images.map((img) => ({
        type: "input_image",
        image_url: img.storage_url,
      }));
      if (imageUserContent.length > 0) {
        imageUserContent.push({
          type: "input_text",
          text: "Analyze all provided brand images and extract visual identity signals for the image_analysis section.",
        });
      }

      const openai = createOpenAI();
      const [docResponse, imageResponse] = await Promise.all([
        openai.responses.parse({
          model: kbExtractPrompt.model,
          input: [
            { role: "system", content: kbExtractPrompt.system },
            { role: "user", content: docUserContent as never },
          ],
          text: { format: zodTextFormat(DocExtractionSchema, "brand_kb") },
          temperature: 0.5,
        }),
        images.length > 0
          ? openai.responses.parse({
              model: kbImageAnalyzePrompt.model,
              input: [
                { role: "system", content: kbImageAnalyzePrompt.system },
                { role: "user", content: imageUserContent as never },
              ],
              text: { format: zodTextFormat(ImageAnalysisSchema, "image_analysis") },
              temperature: 0.3,
            })
          : Promise.resolve(null),
      ]);

      const docKB = docResponse.output_parsed as DocExtractionResult | null;
      if (!docKB) return apiError("Model returned no parsed output.", 500);

      const mergedKB: TraceableBrandKB = {
        ...docKB,
        image_analysis: imageResponse?.output_parsed ?? defaultEmptyImageAnalysis(),
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

      return apiOk({ versionId: version.id, fillRate });
    });
  });
}
