import type { ImageInputCapabilities } from "./types";

export type ShotSpineSlotRole = "start_frame" | "end_frame" | "reference";
export type ShotSpineSlotState = "filled" | "empty" | "unsupported";

export type ShotSpineSlot = {
  role: ShotSpineSlotRole;
  label: string;
  state: ShotSpineSlotState;
  /** Secondary line, e.g. "2 of 5" for references. */
  detail?: string;
};

export type ShotSpineModel = {
  slots: ShotSpineSlot[];
  durationLabel: string;
};

/**
 * D83 — start + end is the default shape of a video generation, and the opinion is expressed by
 * LAYOUT rather than by friction.
 *
 * This model deliberately has no blocking state: a missing end frame is an inviting empty slot,
 * never an error and never a gate. Slots the current model cannot use are reported as
 * `unsupported` rather than omitted, so absence stays legible.
 *
 * Slots come back in narrative order — start, end, reference — because that is the order in
 * which an operator thinks about a shot.
 */
export function describeShotSpine(input: {
  imageInputs: ImageInputCapabilities;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  referenceCount: number;
  durationLabel: string;
}): ShotSpineModel {
  const { imageInputs, hasStartFrame, hasEndFrame, referenceCount } = input;

  const slots: ShotSpineSlot[] = [
    {
      role: "start_frame",
      label: "Start",
      state: !imageInputs.startFrame ? "unsupported" : hasStartFrame ? "filled" : "empty",
    },
    {
      role: "end_frame",
      label: "End",
      state: !imageInputs.endFrame ? "unsupported" : hasEndFrame ? "filled" : "empty",
    },
    {
      role: "reference",
      label: "Reference",
      state:
        imageInputs.maxReferenceImages === 0
          ? "unsupported"
          : referenceCount > 0
            ? "filled"
            : "empty",
      detail:
        imageInputs.maxReferenceImages > 0 && referenceCount > 0
          ? `${referenceCount} of ${imageInputs.maxReferenceImages}`
          : undefined,
    },
  ];

  return { slots, durationLabel: input.durationLabel };
}
