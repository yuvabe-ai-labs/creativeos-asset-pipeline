"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useSavedAvatars } from "@/hooks/use-saved-avatars";
import { AvatarCard } from "./avatar-card";
import { AvatarCreateDialog } from "./avatar-create-dialog";

const GRID = "grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-4";

// The client's avatars: a dashed "Create new avatar" card first, then one card per avatar.
export function AvatarGallery({ clientId, clientSlug }: { clientId: string; clientSlug: string }) {
  const avatars = useSavedAvatars(clientId);
  const base = `/clients/${clientSlug}/avatar`;

  return (
    <>
      <header className="animate-rise mb-8 mt-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Avatars</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">For UGC videos</p>
      </header>

      <div className={GRID}>
        <AvatarCreateDialog newHref={`${base}/new`} randomHref={`${base}/random`} />

        {avatars === null
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)
          : avatars.map((a) => <AvatarCard key={a.id} avatar={a} href={`${base}/${a.id}`} />)}
      </div>
    </>
  );
}
