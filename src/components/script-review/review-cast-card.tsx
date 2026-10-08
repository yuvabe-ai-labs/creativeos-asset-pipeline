// src/components/script-review/review-cast-card.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AvatarSheetViews } from "@/components/avatars/avatar-sheet-views";
import { castAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { snapshotViewImages } from "@/lib/script-review/utils";
import { PartMarker } from "./part-marker";
import { VoiceSampleButton } from "./voice-sample-button";

/** Spec 4 §4 (review board): a cast member as the client sees them — spec 3's cast card with every
 *  making control taken out. The four-view sheet and the voice show on a share with avatars. */
export function ReviewCastCard({ member, avatar, showAvatar }: { member: CastMember; avatar?: AvatarSnapshot; showAvatar: boolean }) {
  return (
    <Card id={castAnchor(member.id)} className="flex flex-col gap-3 p-4 shadow-card has-[[data-part-commented]]:border-client/40">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium">{member.name}</h3>
            {member.isLead && <Badge variant="outline">Lead</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{member.description}</p>
        </div>
        <PartMarker part={{ kind: "cast", castId: member.id }} className="shrink-0" />
      </header>
      {showAvatar &&
        (avatar ? (
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
            <AvatarSheetViews
              columns={2}
              name={member.name}
              views={snapshotViewImages(avatar.views)}
              generating={[]}
              marker={(view) =>
                avatar.views[view] ? <PartMarker part={{ kind: "view", castId: member.id, view }} className="self-center" /> : null
              }
            />
            {avatar.voice && (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs text-muted-foreground">Voice</span>
                {avatar.voice.name && <span>{avatar.voice.name}</span>}
                {avatar.voice.sampleUrl && <VoiceSampleButton url={avatar.voice.sampleUrl} />}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No avatar in this version.</p>
        ))}
    </Card>
  );
}
