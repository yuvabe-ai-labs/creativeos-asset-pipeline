"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { cn } from "@/lib/utils";
import type { AvatarImage } from "@/lib/avatars/schema";

type Props = {
  /** The person's name, for alt text and the zoom title. */
  name: string;
  /** Only the URL is drawn, so a live avatar's sheet and a shared version's frozen one both fit. */
  sheet: Pick<AvatarImage, "url"> | null;
  /** The sheet is being made right now. */
  generating: boolean;
  /** The sheet shows an older front image: dimmed until it is remade. */
  stale?: boolean;
};

// D395 — the profile sheet as the one turnaround image it is made as: Front, Left, Right and Back
// side by side. The four views cut from it still feed panels and client review; this is how the
// operator and the client see the sheet. Shared by the Avatar Studio's sheet step, Visualise's
// cast slot and the client review's cast card.
export function AvatarSheetImage({ name, sheet, generating, stale = false }: Props) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
        {generating ? (
          <Skeleton aria-label="Making the profile sheet" className="absolute inset-0 rounded-none" />
        ) : sheet ? (
          <Button
            variant="ghost"
            aria-label={`Open ${name}, profile sheet`}
            onClick={() => setZoomed(true)}
            className="absolute inset-0 h-full w-full cursor-zoom-in rounded-none p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheet.url} alt="" className={cn("size-full object-contain", stale && "opacity-50")} />
          </Button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ImageOff className="size-5 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
            Front, left, right and back
          </div>
        )}
      </div>
      {zoomed && sheet && (
        <FullScreenImageZoom imageUrl={sheet.url} title={`${name}, profile sheet`} onClose={() => setZoomed(false)} />
      )}
    </>
  );
}
