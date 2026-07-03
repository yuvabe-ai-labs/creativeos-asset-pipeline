import "server-only";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import type { KBExtractionResult } from "@/lib/kb/extraction";

export type KBAnalysisProvider = {
  extractKB(input: {
    clientId: string;
    docIds: string[];
    researchMarkdown: string | null;
  }): Promise<KBExtractionResult>;

  analyzeImages(input: {
    clientId: string;
    imageIds: string[];
  }): Promise<TraceableBrandKB["image_analysis"]>;

  researchWebsite(url: string): Promise<string>;
};

export function getKBProvider(): KBAnalysisProvider {
  if (process.env.KB_ANALYSIS_PROVIDER === "gemini") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./gemini").geminiKBProvider;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./openai").openaiKBProvider;
}
