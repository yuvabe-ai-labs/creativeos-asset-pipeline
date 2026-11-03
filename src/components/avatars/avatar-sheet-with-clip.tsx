import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** D466 — an avatar's four views with its video preview beside them, playing in place. The clip
 *  column is sized so a 9:16 clip stands exactly as tall as the 16:9 sheet beside it. With no clip,
 *  the sheet alone. Shared by the client's cast card and the Visualise avatar popup. */
export function AvatarSheetWithClip({ sheet, clipUrl, stale = false }: {
  /** The four-view sheet (AvatarSheetImage, or the older view tiles). */
  sheet: ReactNode;
  clipUrl: string | null;
  /** The face or voice changed since the clip was made. */
  stale?: boolean;
}) {
  if (!clipUrl) return <>{sheet}</>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.316fr)] items-start gap-3">
      {sheet}
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-muted">
        {/* A preview is the avatar speaking: the person reviewing presses play. */}
        <video src={clipUrl} controls playsInline preload="metadata" className={cn("size-full object-cover", stale && "opacity-50")} />
        {stale && (
          <Badge variant="outline" className="absolute left-1.5 top-1.5 border-warning/40 bg-background text-warning-text">
            Out of date
          </Badge>
        )}
      </div>
    </div>
  );
}
