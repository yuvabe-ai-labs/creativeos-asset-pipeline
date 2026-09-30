import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SavedAvatar } from "@/lib/avatars/local-store";
import { AvatarSilhouette } from "./avatar-silhouette";

// One avatar in the gallery: portrait card with an Edit chip in the corner, name underneath.
// The whole portrait also opens the editor.
export function AvatarCard({ avatar, href }: { avatar: SavedAvatar; href: string }) {
  return (
    <figure className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]">
        <Link href={href} aria-label={`Edit ${avatar.name}`} className="block size-full">
          {avatar.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL
            <img src={avatar.imageDataUrl} alt="" className="size-full object-cover" />
          ) : (
            <AvatarSilhouette className="size-full p-6 pb-0" />
          )}
        </Link>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="absolute right-3 top-3 gap-1.5 rounded-full bg-card/90 backdrop-blur"
          render={<Link href={href} />}
        >
          <Pencil className="size-3.5" strokeWidth={1.5} />
          Edit
        </Button>
      </div>
      <figcaption className="truncate text-center text-sm font-medium">{avatar.name}</figcaption>
    </figure>
  );
}
