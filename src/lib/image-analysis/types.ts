import type { BrandImageSource } from "@/lib/asset-import/constants";
import type { JobStatus } from "@/lib/jobs/types";

/** An `image-analysis` background job's result (D306, D312). */
export type ImageAnalysisResult = {
  /** Images read into new cards this run. */
  read: number;
  failed: number;
  /** Brand images the section was built from (third-party and interface images excluded). */
  counted: number;
  bySource: Record<BrandImageSource, number>;
  /** Whether the KB's Image Analysis section was rewritten (needs an active KB version). */
  written: boolean;
};

/** The Image Analysis tab's status, as the browser sees it. */
export type ImageAnalysisStatus = {
  /** Still images the brand has, and how many have a current card. */
  images: number;
  carded: number;
  job: {
    id: string;
    status: JobStatus;
    phaseMessage: string | null;
    error: string | null;
    finishedAt: string | null;
    result: ImageAnalysisResult | null;
  } | null;
};
