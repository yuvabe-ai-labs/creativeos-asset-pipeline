import "server-only";
import { structuredCaller, type StructuredCall } from "@/lib/scripts/copilot/model";
import { SCRIPT_QUICK_MODEL } from "@/lib/scripts/copilot/constants";
import type { RecordFor } from "@/lib/generations/record-for";
import {
  AVATAR_BRIEF_SYSTEM, avatarBriefSchema, briefToFront, buildAvatarBriefUser, fallbackFront,
  type AvatarBrief, type AvatarBriefInput,
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
  // D537 — the call's cost is recorded for `recordFor`, as an avatar brief.
  { recordFor, call }: { recordFor?: RecordFor; call?: StructuredCall } = {},
): Promise<{ description: string; attributes: AvatarAttributes; family: AvatarBrief["family"] }> {
  try {
    const ask = call ?? structuredCaller(SCRIPT_QUICK_MODEL, recordFor ? { recordFor, recordType: "avatar_brief" } : {});
    const brief = await ask({
      name: "avatar_brief", system: AVATAR_BRIEF_SYSTEM, user: buildAvatarBriefUser(input), schema: avatarBriefSchema,
    });
    // D471 — the blood relatives it found, so the face can be drawn with theirs beside it.
    return { ...briefToFront(brief), family: brief.family };
  } catch (e) {
    console.warn("[avatars] the character brief failed; drawing from the words as given:", e);
    return { ...fallbackFront(input), family: [] };
  }
}
