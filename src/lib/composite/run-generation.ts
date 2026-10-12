import "server-only";
import type { NextResponse } from "next/server";
import { validateReferenceImages, type RefImageMeta } from "@/lib/image-gen/validate";
import type { MediaGenModelSpec } from "@/lib/image-gen/types";
import type { CallerContext } from "@/lib/dal-logic";
import { startImageGeneration } from "@/lib/image-gen/start-generation";

// D312/D366 — a composite generation's references check, and its start as a background job.

/** Why these images cannot be sent, or null. Never slices: every later "image N" the
 *  instruction resolved to would point at the wrong one. */
export function referenceProblem(
  images: RefImageMeta[],
  config: MediaGenModelSpec,
): { message: string; status: number } | null {
  if (images.length > config.maxReferenceImages) {
    return {
      message: `${images.length} reference images are connected — ${config.label} takes ${config.maxReferenceImages}. Disconnect some before generating.`,
      status: 422,
    };
  }
  const validation = validateReferenceImages(images, config);
  if (validation.ok) return null;
  const count = validation.violations.length;
  return {
    message:
      count === 1
        ? `One of your reference images can't be used: ${validation.violations[0].message}`
        : `${count} reference images can't be used — resize them before generating.`,
    status: 422,
  };
}

export type CompositeRun = {
  nodeId: string;
  clientId: string;
  orgId: string;
  caller: CallerContext;
  modelId: string;
  config: MediaGenModelSpec;
  params: Record<string, unknown>;
  prompt: string;
  referenceUrls: string[];
  inputsUsed: Record<string, unknown>;
  /** A painted edit region (models with supportsMask). The base image stays clean. */
  mask?: { base64: string; mime: string };
};

/** D312/D366 — one composite generation, once the prompt and images are decided: started as a
 *  background image generation through the same shared step as Image Gen, so a credit-path fix
 *  still lands once. Answers 202 with the generation id. */
export async function runCompositeGeneration(run: CompositeRun): Promise<NextResponse> {
  return startImageGeneration({
    nodeId: run.nodeId,
    clientId: run.clientId,
    orgId: run.orgId,
    caller: run.caller,
    modelId: run.modelId,
    params: run.params,
    prompt: run.prompt,
    referenceUrls: run.referenceUrls,
    inputsUsed: run.inputsUsed,
    ...(run.mask ? { mask: run.mask } : {}),
  });
}
