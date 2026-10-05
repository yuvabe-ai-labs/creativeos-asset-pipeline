import type { ImageRole } from "./assign-image-roles";

// D308 — which images a video request sends as references, decided once and shared: the Video Gen
// focus view shows the result and the video-generate route sends it. A model takes a fixed number
// of references (Omni 6, Kling 5, Veo 3); this used to be a silent `splice` that kept the first N,
// which dropped the avatar (added last) and left prompt citations pointing at images never sent.
//
// Pure: no I/O. Frames are not references and pass through untouched.

export type SelectReferencesInput = {
  /** The images, in the order the prompt numbers them. */
  images: { id: string }[];
  roles: Record<string, ImageRole>;
  /** The model's maxReferenceImages. */
  cap: number;
  /** The model's name, for the reasons the operator reads. */
  modelLabel: string;
  /** Images the prompt cites — second in priority, after the avatar's front. */
  citedIds?: ReadonlySet<string>;
  avatarFrontId?: string | null;
  avatarSheetId?: string | null;
  /** Images this model cannot take at all, each with the reason (e.g. the sheet on Seedance). */
  unusable?: ReadonlyMap<string, string>;
};

export type LeftOut = { id: string; reason: string };

export type SelectedReferences = {
  /** What is sent, in prompt order. */
  sent: string[];
  /** Every non-frame image not sent, with why — in prompt order. */
  leftOut: LeftOut[];
  /** How many images were explicitly marked as references beyond the cap. */
  overCap: number;
};

/** The virtual id of an avatar's profile sheet, next to its front (the Avatar node's own id). */
export const avatarSheetId = (avatarNodeId: string): string => `${avatarNodeId}:sheet`;

export function selectReferences(input: SelectReferencesInput): SelectedReferences {
  const { images, roles, cap, modelLabel } = input;
  const reasons = new Map<string, string>();
  const chosen = new Set<string>();
  let overCap = 0;
  const noRoom = `No room: ${modelLabel} takes ${cap}`;

  // Candidates: everything that is not a frame.
  const candidates = images.filter(({ id }) => roles[id] !== "start_frame" && roles[id] !== "end_frame");

  if (cap <= 0) {
    for (const { id } of candidates) reasons.set(id, `${modelLabel} takes no reference images`);
    return finish();
  }

  // Never sent: turned off, or not usable on this model.
  const open = candidates.filter(({ id }) => {
    if (roles[id] === "off") return reasons.set(id, "Turned off"), false;
    const unusable = input.unusable?.get(id);
    if (unusable) return reasons.set(id, unusable), false;
    return true;
  });

  // The operator's explicit references first, in order, up to the cap.
  for (const { id } of open) {
    if (roles[id] !== "reference") continue;
    if (chosen.size < cap) chosen.add(id);
    else {
      overCap += 1;
      reasons.set(id, noRoom);
    }
  }

  // Then the free slots, by priority: the avatar's front, cited images, the avatar's sheet, the rest.
  const rank = (id: string): number => {
    if (id === input.avatarFrontId) return 0;
    if (input.citedIds?.has(id)) return 1;
    if (id === input.avatarSheetId) return 2;
    return 3;
  };
  const unassigned = open
    .map(({ id }, order) => ({ id, order }))
    .filter(({ id }) => roles[id] !== "reference")
    .sort((a, b) => rank(a.id) - rank(b.id) || a.order - b.order);
  for (const { id } of unassigned) {
    if (chosen.size < cap) chosen.add(id);
    else reasons.set(id, noRoom);
  }

  return finish();

  function finish(): SelectedReferences {
    return {
      sent: images.map(({ id }) => id).filter((id) => chosen.has(id)),
      leftOut: images.filter(({ id }) => reasons.has(id)).map(({ id }) => ({ id, reason: reasons.get(id)! })),
      overCap,
    };
  }
}
