// src/components/script-review/avatar-views.tsx
"use client";

import { AVATAR_VIEWS, AVATAR_VIEW_LABEL } from "@/lib/script-review/constants";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { PartComments } from "./part-comments";
import { VoiceSampleButton } from "./voice-sample-button";

/** Spec 4 §4–§5: the avatar's views as shared, each with its own comments, and its voice. Each view
 *  carries a compact comment action under its image (design canvas, 8 Oct). */
export function AvatarViews({ castId, avatar }: { castId: string; avatar: AvatarSnapshot }) {
  const views = AVATAR_VIEWS.filter((v) => avatar.views[v]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {views.map((view) => (
          <figure key={view} className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar.views[view] ?? ""}
              alt={`${avatar.name}, ${AVATAR_VIEW_LABEL[view].toLowerCase()} view`}
              className="aspect-[3/4] w-full rounded-lg border border-border bg-muted object-cover"
            />
            <PartComments
              part={{ kind: "view", castId, view }}
              compact={{ caption: AVATAR_VIEW_LABEL[view], actionLabel: `Comment on the ${AVATAR_VIEW_LABEL[view]} view` }}
            />
          </figure>
        ))}
      </div>
      {avatar.voice && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-eyebrow">Voice</span>
          {avatar.voice.name && <span>{avatar.voice.name}</span>}
          {avatar.voice.sampleUrl && <VoiceSampleButton url={avatar.voice.sampleUrl} />}
        </div>
      )}
    </div>
  );
}
