"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvatarSheetViews } from "@/components/avatars/avatar-sheet-views";
import { useCastAvatarMaker } from "@/hooks/use-cast-avatar-maker";
import { AVATAR_VIEWS } from "@/lib/avatars/constants";
import { missingViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { CastMember } from "@/lib/scripts/schema";
import { castSlotLine, reusableFor } from "@/lib/scripts/visualise/maker";
import { CastLibraryPicker } from "./cast-library-picker";
import { CastSlotAiMaker } from "./cast-slot-ai-maker";
import { CastSlotPhotoMaker } from "./cast-slot-photo-maker";
import { CastSlotVoice } from "./cast-slot-voice";

type Mode = "ai" | "photo";

const STEP_COPY = {
  face: "Making the face…", views: "Making the four views…", save: "Saving to Avatars…",
  upload: "Uploading…", consent: "Confirming…", link: "Saving…",
} as const;

// Spec §5.2 — one person in the cast: a full avatar maker, inline, as on the Visualise board.
export function CastSlot({ clientId, scriptId, member, avatar, takenIds, marker }: {
  clientId: string;
  scriptId: string;
  member: CastMember;
  /** The avatar this person links to, if any (archived ones included, to explain themselves). */
  avatar: Avatar | null;
  /** Avatars other people in this script already have. */
  takenIds: string[];
  /** Spec 4 merge point: comment markers per view, given the view id. */
  marker?: (view: (typeof AVATAR_VIEWS)[number]) => ReactNode;
}) {
  const maker = useCastAvatarMaker({ clientId, scriptId, member, avatar });
  const [mode, setMode] = useState<Mode>(avatar?.front?.source.kind === "upload" ? "photo" : "ai");
  const generating = maker.step === "views" ? (avatar ? missingViews(avatar) : [...AVATAR_VIEWS])
    : maker.step === "face" ? [...AVATAR_VIEWS] : [];

  return (
    <Card className="flex flex-col gap-3 p-4 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium">{member.name}</h3>
            {member.isLead && <Badge variant="outline">Lead</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{member.description}</p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="ai" disabled={maker.busy}>AI-generated</TabsTrigger>
            <TabsTrigger value="photo" disabled={maker.busy}>Specific person</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <AvatarSheetViews columns={2} name={member.name} views={avatar?.sheetViews ?? null} generating={generating} stale={avatar?.sheetStale ?? false} marker={marker} />
        <div className="flex min-w-0 flex-col gap-3">
          {mode === "ai" ? (
            <CastSlotAiMaker avatar={reusableFor("ai", avatar)} busy={maker.busy} onMake={(i, fresh) => void maker.make(i, fresh)} />
          ) : (
            <CastSlotPhotoMaker
              name={member.name}
              castId={member.id}
              avatar={reusableFor("photo", avatar)}
              uploading={maker.step === "upload"}
              confirming={maker.step === "consent"}
              busy={maker.busy}
              onUpload={(file) => void maker.uploadPhoto(file)}
              onConfirm={() => void maker.confirmConsent()}
              onFinish={() => void maker.finish()}
            />
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <CastSlotVoice clientId={clientId} castId={member.id} avatar={avatar && !avatar.archivedAt ? avatar : null} onChanged={() => void maker.refresh()} />
            <div className="flex flex-wrap items-center gap-2">
              <CastLibraryPicker clientId={clientId} excludeIds={[...takenIds, ...(avatar ? [avatar.id] : [])]} disabled={maker.busy} onPick={(id) => void maker.pick(id)} />
              {avatar && <Button variant="ghost" size="sm" disabled={maker.busy} onClick={() => void maker.change()}>Change</Button>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {maker.step ? STEP_COPY[maker.step] : castSlotLine(avatar)}
          </p>
        </div>
      </div>
    </Card>
  );
}
