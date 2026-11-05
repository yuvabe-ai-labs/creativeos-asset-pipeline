// src/components/script-review/review-cast-card.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AvatarSheetImage } from "@/components/avatars/avatar-sheet-image";
import { AvatarSheetViews } from "@/components/avatars/avatar-sheet-views";
import { AvatarSheetWithClip } from "@/components/avatars/avatar-sheet-with-clip";
import { castAnchor } from "@/lib/scripts/anchors";
import { cn } from "@/lib/utils";
import type { CastMember } from "@/lib/scripts/schema";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { snapshotViewImages } from "@/lib/script-review/utils";
import { AvatarCommentBox } from "./avatar-comment-box";
import { PartMarker } from "./part-marker";
import { VoiceSampleButton } from "./voice-sample-button";

/** Spec 4 §4 (review board): a cast member as the client sees them — spec 3's cast card with every
 *  making control taken out. The four-view sheet and the voice show on a share with avatars, with one
 *  comment box beside them for the whole avatar, never one per view, in place of the header's comment
 *  button (D359). A script-only share has no box, so its header keeps the button. */
export function ReviewCastCard({ member, avatar, showAvatar }: { member: CastMember; avatar?: AvatarSnapshot; showAvatar: boolean }) {
  // Where the avatar shows, its box is the card's one way to comment; the header keeps the count.
  const boxed = showAvatar && Boolean(avatar);
  // D466 — with the avatar shown, the card runs the page's width: the views and the clip large on
  // the left, so the clip is big enough to watch; the person, voice and comment box on the right.
  const wide = "lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8";
  return (
    <Card
      id={castAnchor(member.id)}
      className={cn("flex flex-col gap-4 p-5 shadow-card has-[[data-part-commented]]:ring-client/40", boxed && wide)}
    >
      <header className="flex items-start justify-between gap-3 lg:col-start-2 lg:row-start-1">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium">{member.name}</h3>
            {member.isLead && <Badge variant="outline">Lead</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{member.description}</p>
        </div>
        <PartMarker part={{ kind: "cast", castId: member.id }} action={!boxed} className="shrink-0" />
      </header>
      {showAvatar &&
        (avatar ? (
          <>
            {/* D395: the one sheet image; a version shared before it was frozen shows its views.
                D466: the shared video preview plays beside it. */}
            <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <AvatarSheetWithClip
                clipUrl={avatar.preview ?? null}
                sheet={avatar.sheet ? (
                  <AvatarSheetImage name={member.name} sheet={{ url: avatar.sheet }} generating={false} />
                ) : (
                  <div className="max-w-44">
                    <AvatarSheetViews columns={2} name={member.name} views={snapshotViewImages(avatar.views)} generating={[]} />
                  </div>
                )}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2">
              {avatar.voice && (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs text-muted-foreground">Voice</span>
                  {avatar.voice.name && <span>{avatar.voice.name}</span>}
                  {avatar.voice.sampleUrl && <VoiceSampleButton url={avatar.voice.sampleUrl} />}
                </div>
              )}
              <AvatarCommentBox castId={member.id} name={member.name} />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No avatar in this version.</p>
        ))}
    </Card>
  );
}
