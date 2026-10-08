import type { ImageAnalysisStatus } from "@/lib/image-analysis/types";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { readJson } from "./read-json";

/** The status endpoint's answer: the run's state plus the section it wrote (D312). */
export type ImageAnalysisState = ImageAnalysisStatus & {
  versionId: string | null;
  imageAnalysis: TraceableBrandKB["image_analysis"] | null;
};

class ImageAnalysisService {
  async status(clientId: string): Promise<ImageAnalysisState> {
    const res = await fetch(`/api/clients/${clientId}/image-analysis`);
    return readJson(res, "Couldn't load the image analysis.");
  }

  /** Reads any images without a card and rewrites the section, in the background. */
  async start(clientId: string): Promise<ImageAnalysisState> {
    const res = await fetch(`/api/clients/${clientId}/image-analysis`, { method: "POST" });
    return readJson(res, "Couldn't start the image analysis.");
  }
}

export const imageAnalysisService = new ImageAnalysisService();
