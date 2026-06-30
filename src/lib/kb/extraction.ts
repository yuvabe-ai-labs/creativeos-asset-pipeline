import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import {
  TraceableBrandKBSchema,
  ImageAnalysisSchema,
  type TraceableBrandKB,
  type KBField,
} from "@/lib/kb/schema";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { kbImageAnalyzePrompt } from "@/prompts/kb-image-analyze";

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
    visual_mood: emptyKBField<string>(null),
    aesthetic: emptyKBField<string>(null),
    subjects: emptyKBField<string>(null),
    composition_style: emptyKBField<string>(null),
    lighting_character: emptyKBField<string>(null),
    brand_consistency_notes: emptyKBField<string>(null),
  };
}

export type KBExtractionResult = {
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
};

// Pure orchestration: takes already-frozen doc/image id lists + optional research
// Markdown; returns the structured KB. Does NOT write to DB or storage.
export async function runKBExtraction(input: {
  clientId: string;
  docIds: string[];
  imageIds: string[];
  researchMarkdown: string | null;
}): Promise<KBExtractionResult> {
  const allDocs = await listKBDocuments(input.clientId);
  const allImages = await listBrandImages(input.clientId);
  const docs = allDocs.filter((d) => input.docIds.includes(d.id));
  const images = allImages.filter((i) => input.imageIds.includes(i.id));

  if (docs.length === 0 && !input.researchMarkdown) {
    throw new Error("Need at least one document or website research to extract.");
  }

  const docUserContent: unknown[] = [];
  for (const doc of docs) {
    if (FILE_EXTENSIONS.has(doc.file_ext)) {
      docUserContent.push({ type: "input_file", file_url: doc.storage_url });
    } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
      const res = await fetch(doc.storage_url);
      if (!res.ok) throw new Error(`Could not fetch document: ${doc.filename}`);
      docUserContent.push({ type: "input_text", text: await res.text() });
    }
  }
  if (input.researchMarkdown) {
    docUserContent.push({
      type: "input_text",
      text: `--- Brand website research ---\n${input.researchMarkdown}`,
    });
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
  if (!docKB) throw new Error("Model returned no parsed output.");

  const kbOutput: TraceableBrandKB = {
    ...docKB,
    image_analysis: imageResponse?.output_parsed ?? defaultEmptyImageAnalysis(),
  };

  return {
    kbOutput,
    modelUsed: kbExtractPrompt.model,
    fillRate: computeFillRate(kbOutput),
  };
}
