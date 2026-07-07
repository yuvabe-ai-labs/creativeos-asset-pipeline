import "server-only";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { getKBProvider } from "@/lib/kb/providers/interface";
import type { TraceableBrandKB, KBField } from "@/lib/kb/schema";

export type KBExtractionResult = {
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
  skipped?: { filename: string; reason: string }[];
};

function emptyKBField<T>(value: T | null = null): KBField<T> {
  return { value, confidence: "low", evidence_type: "inferred", status: "needs_review" };
}

export function defaultEmptyImageAnalysis(): TraceableBrandKB["image_analysis"] {
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

  const provider = getKBProvider();

  const [extractResult, imageAnalysis] = await Promise.all([
    provider.extractKB({
      clientId: input.clientId,
      docIds: input.docIds,
      researchMarkdown: input.researchMarkdown,
    }),
    images.length > 0
      ? provider.analyzeImages({ clientId: input.clientId, imageIds: input.imageIds })
      : Promise.resolve(defaultEmptyImageAnalysis()),
  ]);

  const kbOutput: TraceableBrandKB = {
    ...extractResult.kbOutput,
    image_analysis: imageAnalysis,
  };

  return {
    kbOutput,
    modelUsed: extractResult.modelUsed,
    fillRate: computeFillRate(kbOutput),
    skipped: extractResult.skipped ?? [],
  };
}
