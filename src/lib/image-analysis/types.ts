import type { BrandImageSource } from "@/lib/asset-import/constants";
import type { JobStatus } from "@/lib/jobs/types";

/** An `image-analysis` background job's input. `force` rewrites the section even when no image
 *  changed (the tab's Refresh); automatic runs leave an up-to-date section alone (D318). */
export type ImageAnalysisInput = { force?: boolean };

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
  /** The set of cards the active section is built from, when known; an unchanged set skips the
   *  summary next time (D318). */
  cardSetKey?: string;
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
