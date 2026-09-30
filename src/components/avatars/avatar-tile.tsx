import Link from "next/link";
import { AudioLines, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PERSON_TYPE_LABELS } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";
import { avatarVoiceLabel } from "@/lib/avatars/voice";

// D287 — one square library tile: the face, with the name and voice on a soft gradient over it.
// A plain Link, like the rows of canvases-table.tsx; the whole tile is the target.
export function AvatarTile({ avatar, clientSlug }: { avatar: Avatar; clientSlug: string }) {
  return (
    <Link
      href={`/clients/${clientSlug}/avatars/${avatar.id}`}
      aria-label={`Open ${avatar.name || "untitled avatar"}`}
      className="group relative block aspect-square overflow-hidden rounded-xl border bg-muted shadow-card outline-none transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {avatar.front ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar.front.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <UserRound className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
        </span>
      )}

      <span className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
        {avatar.status === "draft" && <Badge className="bg-card">Draft</Badge>}
        {avatar.personType === "specific" && (
          <Badge className="bg-card">{PERSON_TYPE_LABELS.specific}</Badge>
        )}
      </span>

      <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-foreground/75 to-transparent px-2 pb-1.5 pt-6 text-background">
        <span className="truncate text-xs font-semibold">{avatar.name || "Untitled"}</span>
        <span className="flex items-center gap-1 truncate text-[0.65rem] opacity-85">
          {avatar.voice ? (
            <>
              <AudioLines className="size-3 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{avatarVoiceLabel(avatar.voice)}</span>
            </>
          ) : (
            "No voice"
          )}
        </span>
      </span>
    </Link>
  );
}
