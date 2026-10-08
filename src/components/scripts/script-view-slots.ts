// src/components/scripts/script-view-slots.ts
import type { ReactNode } from "react";
import type { CastMember, Shot } from "@/lib/scripts/schema";

/** Room beside each part of spec 1's one script view for the later specs' work (parent spec
 *  §4a.1). Every slot is optional; with none, the view is spec 1's.
 *  MERGE POINT (MP3, spec 3): Visualise puts the avatar maker in the cast slot and the panel beside
 *  each shot. If both specs fill one slot, the page renders both in a fragment. */
export type ScriptViewSlots = {
  /** Under the context card. */
  context?: ReactNode;
  /** In each cast member's slot, full width under the person. */
  castMember?: (member: CastMember) => ReactNode;
  /** In each shot's row, full width under its columns. */
  shot?: (shot: Shot) => ReactNode;
};
