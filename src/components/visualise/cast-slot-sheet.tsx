"use client";

import { AvatarSheetImage } from "@/components/avatars/avatar-sheet-image";
import { AvatarSheetWithClip } from "@/components/avatars/avatar-sheet-with-clip";
import { useVoicePreviewQuery } from "@/hooks/queries/avatars";
import type { Avatar } from "@/lib/avatars/schema";
import { isVoicePreviewStale, voiceDeclarationKey } from "@/lib/avatars/voice-preview";

// D466 — the avatar popup's picture: the four views, with the video preview playing beside them
// once one is made. The preview query is the one the preview controls below already read, so
// TanStack Query shares it: opening the popup makes one request, not two.
export function CastSlotSheet({ clientId, name, avatar, generating }: {
  clientId: string;
  name: string;
  avatar: Avatar | null;
  generating: boolean;
}) {
  const live = avatar && !avatar.archivedAt && avatar.voice ? avatar : null;
  const query = useVoicePreviewQuery(clientId, live?.id ?? null, voiceDeclarationKey(live?.voice ?? null));
  const preview = query.data?.preview ?? null;
  const clip = live && preview?.status === "succeeded" && preview.url ? preview : null;
  // Only once its views exist: a sheet that could not be cut must not look finished (D395).
  const sheet = avatar?.sheetViews ? avatar.sheet : null;

  return (
    <AvatarSheetWithClip
      clipUrl={clip?.url ?? null}
      stale={Boolean(clip && live && isVoicePreviewStale(clip, live))}
      sheet={<AvatarSheetImage name={name} sheet={sheet} generating={generating} stale={avatar?.sheetStale ?? false} />}
    />
  );
}
