import "server-only";
import { listKBDocuments } from "@/lib/db/kb";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { getKBProvider } from "@/lib/kb/providers/interface";
import { defaultEmptyImageAnalysis, type TraceableBrandKB } from "@/lib/kb/schema";

export type KBExtractionResult = {
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
  skipped?: { filename: string; reason: string }[];
};

/**
 * Builds the KB from documents and website research. The Image Analysis section starts empty: the
 * image-analysis run started once the build lands writes it from every brand image (D312).
 */
export async function runKBExtraction(input: {
  clientId: string;
  docIds: string[];
  researchMarkdown: string | null;
}): Promise<KBExtractionResult> {
  const allDocs = await listKBDocuments(input.clientId);
  const docs = allDocs.filter((d) => input.docIds.includes(d.id));

  if (docs.length === 0 && !input.researchMarkdown) {
    throw new Error("Need at least one document or website research to extract.");
  }

  const provider = getKBProvider();

  const extractResult = await provider.extractKB({
    clientId: input.clientId,
    docIds: input.docIds,
    researchMarkdown: input.researchMarkdown,
  });

  const kbOutput: TraceableBrandKB = {
    ...extractResult.kbOutput,
    image_analysis: defaultEmptyImageAnalysis(),
  };

  return {
    kbOutput,
    modelUsed: extractResult.modelUsed,
    fillRate: computeFillRate(kbOutput),
    skipped: extractResult.skipped ?? [],
  };
}
