import type { ParamSpec } from "@/lib/image-gen/types";
import type { ImageInputCapabilities } from "./types";

/**
 * The duration the CURRENT combination yields — which is not always the model's full menu.
 *
 * A rule can pin the value: Veo locks duration to 8s the moment a reference image is in play.
 * Reading only the param spec made the spine advertise "4 or 6 or 8s" while the control directly
 * below it showed 4 and 6 greyed out, so the card contradicted the panel. A locked value wins.
 */
export function describeDurationLabel(
  durationSpec: ParamSpec | undefined,
  lockedDuration?: unknown,
): string {
  if (lockedDuration !== undefined && lockedDuration !== null) return `${lockedDuration}s`;
  if (durationSpec?.constraints.type === "select")
    return `${durationSpec.constraints.options.join(" or ")}s`;
  if (durationSpec?.constraints.type === "slider")
    return `${durationSpec.constraints.min}–${durationSpec.constraints.max}s`;
  return "—";
}

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
  /**
   * The model's rules make frames and references an either/or choice. Rendered as "or" between
   * the two groups: laying START → END | REFERENCE out in a row implies you can have all three,
   * and on Veo you cannot.
   */
  framesRefsExclusive: boolean;
  /**
   * Why the duration is pinned, when a rule pinned it. Present means the label is a single
   * forced value rather than the model's menu: the spine badges the value and hands this text
   * to the badge's tooltip. Absent when the operator is free to choose.
   */
  durationLockReason?: string;
};

/**
 * D95 — start + end is the default shape of a video generation, and the opinion is expressed by
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
  framesRefsExclusive?: boolean;
  durationLockReason?: string;
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

  return {
    slots,
    durationLabel: input.durationLabel,
    durationLockReason: input.durationLockReason,
    // Only meaningful when references exist at all — there is no either/or against a slot the
    // model cannot use, so Veo Lite shows a plain divider rather than a misleading "or".
    framesRefsExclusive:
      (input.framesRefsExclusive ?? false) && imageInputs.maxReferenceImages > 0,
  };
}
