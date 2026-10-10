import "server-only";
import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { uploadAvatarGenerated } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import type { GenerationRow } from "@/lib/db/types";
import type { AvatarImageSlot, AvatarViewId } from "./schema";

export type AvatarGenerationArgs = {
  clientId: string;
  avatarId: string;
  orgId: string;
  userId: string;
  userEmail: string | null;
  slot: AvatarImageSlot;
  /** D340 — which of the sheet's four views this image is. */
  view?: AvatarViewId;
  modelId: string;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
  batchId: string | null;
};

// D291 — one avatar image, through the shared billed run.
export async function runAvatarGeneration(
  args: AvatarGenerationArgs,
): Promise<{ generation: GenerationRow; creditsCharged: number }> {
  return runBilledImageGeneration({
    owner: { avatarId: args.avatarId },
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    modelId: args.modelId,
    aspect: args.aspect,
    prompt: args.prompt,
    referenceUrls: args.referenceUrls,
    inputsSnapshot: {
      slot: args.slot,
      ...(args.view ? { view: args.view } : {}),
      prompt: args.prompt,
      batchId: args.batchId,
      referenceUrls: args.referenceUrls,
    },
    store: (body, mimeType) =>
      uploadAvatarGenerated({
        clientId: args.clientId,
        avatarId: args.avatarId,
        slot: args.slot,
        name: args.view ? `view-${args.view}` : undefined,
        ext: extForContentType(mimeType),
        body,
        contentType: mimeType,
      }),
  });
}
