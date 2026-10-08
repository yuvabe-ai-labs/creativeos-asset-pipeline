import {
  AVATAR_DESCRIPTION_MAX,
  AVATAR_FRONT_ASPECT, AVATAR_NAME_MAX, AVATAR_STORY_MAX,
} from "@/lib/avatars/constants";
import { estimateAvatarImageCredits, estimateSheetCredits } from "@/lib/avatars/generation";
import { hasFourViews, missingViews, needsLikenessConsent } from "@/lib/avatars/utils";
import type { Avatar, AvatarViewId } from "@/lib/avatars/schema";
import { formatDate } from "@/lib/kb/utils";
import type { CastMember } from "@/lib/scripts/schema";
import { VISUALISE_AVATAR_MODEL_ID } from "./constants";

// D338 — the inline avatar maker's sequence, as plain functions over injected calls (the same
// shape as add-to-canvas.ts), so every path is tested without React. useCastAvatarMaker supplies
// the calls. It makes a client Avatar like the Studio does, through the Studio's own routes.

export type MakerStep = "face" | "views" | "save";

export type MakerDeps = {
  /** Creates a draft avatar and links it to the cast member. */
  createAndLink: (fields: { name: string; story: string }) => Promise<Avatar>;
  generateFront: (avatarId: string, description: string) => Promise<{ generationId: string }>;
  pickFront: (avatarId: string, generationId: string) => Promise<Avatar>;
  /** Makes these views; the sheet route makes all four anyway when the views show an older front. */
  generateViews: (avatarId: string, views: AvatarViewId[]) => Promise<Avatar>;
  markReady: (avatarId: string) => Promise<Avatar>;
  onStep: (step: MakerStep) => void;
};

/** The words a generated face is made from: the person as the script describes them, then the
 *  operator's instructions ("Greyer at the temples"), cut to what the front route accepts. */
export function avatarDescriptionFor(member: CastMember, instructions: string): string {
  return [member.description.trim() || member.name, instructions.trim()].filter(Boolean).join(" ").slice(0, AVATAR_DESCRIPTION_MAX);
}

export function avatarFieldsFor(member: CastMember): { name: string; story: string } {
  return { name: member.name.slice(0, AVATAR_NAME_MAX), story: member.description.slice(0, AVATAR_STORY_MAX) };
}

/** The linked avatar, if it can be worked on in this mode. A face keeps its kind: AI-generated
 *  never overwrites a real person's photo, and a photo never replaces a generated face; either
 *  makes a new avatar instead, and the old one stays in the library. */
export function reusableFor(mode: "ai" | "photo", avatar: Avatar | null): Avatar | null {
  if (!avatar || avatar.archivedAt) return null;
  const kind = avatar.front?.source.kind;
  if (!kind) return avatar;
  return (mode === "ai") === (kind === "generated") ? avatar : null;
}

/** What the slot does next: the face, the four views, or saving. Null when done, or when a
 *  real person's photo still waits for permission. */
export function nextMakerStep(avatar: Avatar | null): MakerStep | null {
  if (!avatar?.front) return "face";
  if (needsLikenessConsent(avatar)) return null;
  if (!hasFourViews(avatar)) return "views";
  if (avatar.status !== "ready") return "save";
  return null;
}

/** The end of both flows: the four views, then saved to Avatars. */
export async function finishAvatar(d: MakerDeps, avatar: Avatar): Promise<Avatar> {
  if (needsLikenessConsent(avatar)) throw new Error("Confirm the permission to use this person's likeness first.");
  let current = avatar;
  if (!hasFourViews(current)) {
    d.onStep("views");
    // Only the gaps: a retry after one failed view costs one view, as the button says, and keeps
    // the three good ones (review of D339).
    current = await d.generateViews(current.id, missingViews(current));
    if (!hasFourViews(current)) throw new Error("A view is still missing. Make the four views again.");
  }
  if (current.status !== "ready") {
    d.onStep("save");
    current = await d.markReady(current.id);
  }
  return current;
}

/** AI-generated: one face from the description and instructions, its four views, then saved.
 *  `fresh` (Regenerate avatar) always makes a new face; otherwise the run resumes from the
 *  first step not done. */
export async function makeGeneratedAvatar(
  d: MakerDeps,
  input: { member: CastMember; avatar: Avatar | null; instructions: string; fresh: boolean },
): Promise<Avatar> {
  const reusable = reusableFor("ai", input.avatar);
  const needsFace = input.fresh || !reusable?.front;
  // Busy from the click: creating and linking a draft takes two round trips before the face.
  if (needsFace) d.onStep("face");
  let avatar = reusable ?? (await d.createAndLink(avatarFieldsFor(input.member)));
  if (needsFace) {
    const { generationId } = await d.generateFront(avatar.id, avatarDescriptionFor(input.member, input.instructions));
    avatar = await d.pickFront(avatar.id, generationId);
  }
  return finishAvatar(d, avatar);
}

/** The slot's one-line status (spec §5.2: "Made 9 Oct · saved to Avatars"). */
export function castSlotLine(avatar: Avatar | null): string {
  if (!avatar) return "No avatar yet";
  if (avatar.archivedAt) return "This avatar was archived. Change it to go on.";
  if (avatar.status !== "ready") return "Draft · saved to Avatars once its four views are made";
  const made = `Made ${formatDate(avatar.createdAt)} · saved to Avatars`;
  return hasFourViews(avatar) ? made : `${made} · needs its four views`;
}

/** What Make avatar costs: one face, then four views. */
export function estimateMakeCredits(modelId: string = VISUALISE_AVATAR_MODEL_ID): number | null {
  const face = estimateAvatarImageCredits({ modelId, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0 });
  const views = estimateSheetCredits(modelId, 4);
  return face === null || views === null ? null : face + views;
}
