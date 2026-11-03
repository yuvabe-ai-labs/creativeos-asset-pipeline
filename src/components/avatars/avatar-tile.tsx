import Link from "next/link";
import { AudioLines, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Avatar } from "@/lib/avatars/schema";
import { tileImageUrl } from "@/lib/avatars/utils";
import { avatarVoiceLabel } from "@/lib/avatars/voice";

// D287 — one library tile: the character, with the name and voice on a soft gradient over it.
// 9:16 and full length (the front view), so the whole character shows, not just the face.
// A plain Link, like the rows of canvases-table.tsx; the whole tile is the target.
export function AvatarTile({ avatar, clientSlug }: { avatar: Avatar; clientSlug: string }) {
  const src = tileImageUrl(avatar);
  return (
    <Link
      href={`/clients/${clientSlug}/avatars/${avatar.id}`}
      aria-label={`Open ${avatar.name || "untitled avatar"}`}
      className="group relative block aspect-[9/16] overflow-hidden rounded-xl border bg-muted shadow-card outline-none transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover object-top"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <UserRound className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
        </span>
      )}

      <span className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
        {avatar.status === "draft" && <Badge className="bg-card">Draft</Badge>}
      </span>

      <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-foreground/75 to-transparent px-3 pb-2.5 pt-10 text-background">
        <span className="truncate text-sm font-semibold">{avatar.name || "Untitled"}</span>
        <span className="flex items-center gap-1 truncate text-xs opacity-85">
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
