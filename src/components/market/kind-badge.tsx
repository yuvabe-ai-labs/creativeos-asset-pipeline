// Lucide dropped its brand icons, so platform kinds get neutral media icons:
// play for YouTube, clapper for Instagram reels, music note for TikTok.
import { CirclePlay, Clapperboard, Music2, Film, Link2, Image as ImageIcon } from "lucide-react";
import type { ReferenceKind } from "@/lib/market/constants";
import { cn } from "@/lib/utils";

const ICONS: Record<ReferenceKind, typeof CirclePlay> = {
  youtube: CirclePlay,
  instagram: Clapperboard,
  tiktok: Music2,
  video: Film,
  gif: Film,
  image: ImageIcon,
  link: Link2,
};

export function KindBadge({ kind, className }: { kind: ReferenceKind; className?: string }) {
  if (kind === "image") return null; // images are the default — no badge noise
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white",
        className,
      )}
    >
      <Icon className="size-3 sm:size-3.5" strokeWidth={1.5} />
    </span>
  );
}
