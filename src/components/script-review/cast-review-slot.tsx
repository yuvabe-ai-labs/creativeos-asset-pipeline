// src/components/script-review/cast-review-slot.tsx
"use client";

import { AVATAR_VIEWS, AVATAR_VIEW_LABEL } from "@/lib/script-review/constants";
import type { CastMember } from "@/lib/scripts/schema";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { AvatarViews } from "./avatar-views";
import { PartComments } from "./part-comments";

/** What review puts in a cast member's slot: the shared avatar (client, on a share with avatars) and
 *  the comments on the person and on each view. */
export function CastReviewSlot({ member, avatar }: { member: CastMember; avatar?: AvatarSnapshot }) {
  const { mode } = useReviewSurface();
  return (
    <div className="flex flex-col gap-3 pt-1">
      {avatar && <AvatarViews castId={member.id} avatar={avatar} />}
      <PartComments part={{ kind: "cast", castId: member.id }} label={avatar ? "Avatar" : undefined} />
      {/* MERGE POINT (MP4, spec 3): until Visualise draws the four views in the team's view, a
          view's threads sit here, labelled. At merge, move them beside spec 3's views. */}
      {mode === "team" &&
        AVATAR_VIEWS.map((view) => (
          <PartComments key={view} part={{ kind: "view", castId: member.id, view }} label={`${AVATAR_VIEW_LABEL[view]} view`} />
        ))}
    </div>
  );
}
