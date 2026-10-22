import "server-only";
import { structuredCaller, type StructuredCall } from "@/lib/scripts/copilot/model";
import { SCRIPT_QUICK_MODEL } from "@/lib/scripts/copilot/constants";
import {
  AVATAR_BRIEF_SYSTEM, avatarBriefSchema, briefToFront, buildAvatarBriefUser, fallbackFront,
  type AvatarBriefInput,
} from "@/prompts/avatar-character";
import type { AvatarAttributes } from "./constants";

/**
 * D395 — what a generated face is drawn from: the script's person and the operator's
 * instructions restated as one clean character brief. A short step with no house writing, so it
 * runs on the copilot's quick model. If the call fails the face is still made, from the
 * operator's words first, so a brief is never what stops an avatar.
 */
export async function briefFront(
  input: AvatarBriefInput,
  call: StructuredCall = structuredCaller(SCRIPT_QUICK_MODEL),
): Promise<{ description: string; attributes: AvatarAttributes }> {
  try {
    const brief = await call({
      name: "avatar_brief", system: AVATAR_BRIEF_SYSTEM, user: buildAvatarBriefUser(input), schema: avatarBriefSchema,
    });
    return briefToFront(brief);
  } catch (e) {
    console.warn("[avatars] the character brief failed; drawing from the words as given:", e);
    return fallbackFront(input);
  }
}
