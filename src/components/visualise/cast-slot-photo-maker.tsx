"use client";

import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { AvatarImageDropzone } from "@/components/avatars/avatar-image-dropzone";
import { AvatarLikenessConsent } from "@/components/avatars/avatar-likeness-consent";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { missingViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import { nextMakerStep } from "@/lib/scripts/visualise/maker";

// Spec §5.2 — Specific person: an uploaded photo of a real person, the Avatars feature's likeness
// consent (required, unchanged), then the four views made from the photo.
export function CastSlotPhotoMaker({ name, castId, modelId, avatar, uploading, confirming, busy, onUpload, onConfirm, onFinish }: {
  name: string;
  castId: string;
  /** The image model chosen under Advanced, for the cost of the views. */
  modelId: string;
  /** The linked avatar when its face is an upload (or it has none yet); otherwise null. */
  avatar: Avatar | null;
  uploading: boolean;
  confirming: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onConfirm: () => void;
  onFinish: () => void;
}) {
  const photo = avatar?.front?.source.kind === "upload" ? avatar.front : null;
  const next = avatar && photo ? nextMakerStep(avatar) : null;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="w-full max-w-[9rem]">
        <AvatarImageDropzone
          label="Upload a photo of the real person"
          hint="Click, or drop a photo here"
          aspect="3 / 4"
          image={photo}
          uploading={uploading}
          disabled={busy}
          zoomTitle={`${name}, photo`}
          onFile={onUpload}
        />
      </div>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-3">
        <p className="text-sm text-muted-foreground">For a founder or a real customer. The four views are made from this photo.</p>
        {avatar && photo && (
          <AvatarLikenessConsent id={`likeness-consent-${castId}`} avatar={avatar} confirming={confirming} onConfirm={onConfirm} />
        )}
        {next && (
          <Button className="self-start" disabled={busy} onClick={onFinish}>
            {next === "save" ? "Save to Avatars" : "Make the four views"}
            {next === "views" && <AvatarCreditCost credits={estimateSheetCredits(modelId, missingViews(avatar!).length)} />}
          </Button>
        )}
      </div>
    </div>
  );
}
