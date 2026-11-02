"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCastAvatarMaker } from "@/hooks/use-cast-avatar-maker";
import type { Avatar } from "@/lib/avatars/schema";
import { castAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";
import { VISUALISE_AVATAR_MODEL_ID } from "@/lib/scripts/visualise/constants";
import { castChipStatus, type CastChipStatus } from "@/lib/scripts/visualise/maker";
import { cn } from "@/lib/utils";
import { CastSlot } from "./cast-slot";

const TONE: Record<CastChipStatus["tone"], string> = {
  ready: "text-muted-foreground",
  working: "text-primary",
  attention: "text-destructive-text",
  muted: "text-muted-foreground",
};

// D465 — one person in the cast as a chip on the summary card: the face, the name, and whether
// the avatar is usable for panels. The chip owns the avatar maker (no network call until used),
// so work started in the popup keeps showing here after the popup closes.
export function CastChip({ clientId, scriptId, member, avatar, faceUrl, takenIds, marker }: {
  clientId: string;
  scriptId: string;
  member: CastMember;
  /** The avatar this person links to, if any (archived ones included, to explain themselves). */
  avatar: Avatar | null;
  faceUrl: string | null;
  /** Avatars other people in this script already have. */
  takenIds: string[];
  /** Spec 4 merge point: the comment marker on the person. */
  marker?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState(VISUALISE_AVATAR_MODEL_ID);
  const maker = useCastAvatarMaker({ clientId, scriptId, member, avatar, modelId });
  const status = castChipStatus(avatar, maker.step);

  return (
    <span className="flex items-center gap-1.5">
      <Button
        id={castAnchor(member.id)}
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-auto scroll-mt-6 gap-3 rounded-2xl py-1.5 pl-1.5 pr-4"
      >
        <span className={cn("block size-14 shrink-0 overflow-hidden rounded-full bg-muted", !faceUrl && "border border-dashed border-border bg-transparent")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {faceUrl && <img src={faceUrl} alt="" className="size-full object-cover object-top" />}
        </span>
        <span className="flex flex-col items-start gap-0.5 leading-tight">
          <span className="flex items-center gap-1.5 text-base font-medium">
            {member.name}
            {member.isLead && <Badge variant="outline" className="h-4 px-1.5 text-[0.65rem]">Lead</Badge>}
          </span>
          <span className={cn("flex items-center gap-1 text-xs font-normal", TONE[status.tone])}>
            {status.tone === "working" && <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />}
            {status.label}
          </span>
        </span>
      </Button>
      {marker}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle className="sr-only">{member.name}</DialogTitle>
          <CastSlot
            clientId={clientId}
            member={member}
            avatar={avatar}
            takenIds={takenIds}
            maker={maker}
            modelId={modelId}
            onModelId={setModelId}
            bare
          />
        </DialogContent>
      </Dialog>
    </span>
  );
}
