"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedAvatars } from "@/hooks/use-saved-avatars";
import { AvatarView } from "./avatar-view";
import { AvatarRandomView } from "./avatar-random-view";

// Edit route: finds the avatar in this browser's store, then hands it to the editor.
export function AvatarEditor({
  clientId,
  clientSlug,
  avatarId,
}: {
  clientId: string;
  clientSlug: string;
  avatarId: string;
}) {
  const avatars = useSavedAvatars(clientId);
  if (avatars === null) return <Skeleton className="mt-6 h-96 w-full rounded-2xl" />;

  const avatar = avatars.find((a) => a.id === avatarId);
  if (!avatar) {
    return (
      <div className="mt-10 flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">This avatar isn&apos;t saved in this browser.</p>
        <Button variant="outline" nativeButton={false} render={<Link href={`/clients/${clientSlug}/avatar`} />}>
          Back to avatars
        </Button>
      </div>
    );
  }
  // Random characters (described, not uploaded) reopen in their own editor.
  return avatar.description !== undefined ? (
    <AvatarRandomView key={avatar.id} clientId={clientId} clientSlug={clientSlug} avatar={avatar} />
  ) : (
    <AvatarView key={avatar.id} clientId={clientId} clientSlug={clientSlug} avatar={avatar} />
  );
}
