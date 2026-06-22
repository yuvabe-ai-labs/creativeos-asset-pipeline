import type { ParamSpec } from "@/lib/image-gen/types";

export type { ParamSpec };

export type VideoGenInput = {
  prompt: string;
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
};

export type VideoGenResult = {
  videoUrl: string;
  durationSeconds: number;
};

export type VideoGenModelSpec = {
  id: string;
  provider: "veo";
  label: string;
  providerLabel: string;
  maxDurationSeconds: number;
  params: ParamSpec[];
  generate: (input: VideoGenInput) => Promise<VideoGenResult>;
};

export type VideoGenClientModelSpec = Omit<VideoGenModelSpec, "generate">;
