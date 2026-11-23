import "server-only";
import type { KBExtractionResult } from "@/lib/kb/extraction";
import type { RecordFor } from "@/lib/generations/record-for";

export type KBAnalysisProvider = {
  extractKB(input: {
    clientId: string;
    docIds: string[];
    researchMarkdown: string | null;
    /** D537 — whom the provider call's cost is recorded for; without it nothing is recorded. */
    recordFor?: RecordFor;
  }): Promise<KBExtractionResult>;

  researchWebsite(url: string, recordFor?: RecordFor): Promise<string>;
};

export function getKBProvider(): KBAnalysisProvider {
  if (process.env.KB_ANALYSIS_PROVIDER === "gemini") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./gemini").geminiKBProvider;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./openai").openaiKBProvider;
}
