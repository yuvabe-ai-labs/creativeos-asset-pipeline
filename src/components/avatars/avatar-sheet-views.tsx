"use client";

import { useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarViewsGallery } from "./avatar-views-gallery";
import { cn } from "@/lib/utils";
import { AVATAR_VIEWS, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarSheetViews as Views, AvatarViewId } from "@/lib/avatars/schema";

type Props = {
  /** The person's name, for alt text and the zoom title. */
  name: string;
  views: Views | null;
  /** Views being made right now: each shows a same-size placeholder. */
  generating: readonly AvatarViewId[];
  /** The views show an older front image: dimmed until they are remade. */
  stale?: boolean;
  /** Spec 4 merge point: a comment marker beside each view. */
  marker?: (view: AvatarViewId) => ReactNode;
  /** 4 in a row (the Studio) or a compact 2×2 (Visualise's cast card). */
  columns?: 2 | 4;
};

// D339 — the sheet's four views as four tiles, Front, Left, Right, Back. Shared by the Avatar
// Studio's sheet step and Visualise's cast slot, so there is one way a sheet looks.
export function AvatarSheetViews({ name, views, generating, stale = false, marker, columns = 4 }: Props) {
  const [zoomed, setZoomed] = useState<AvatarViewId | null>(null);

  return (
    <>
      <ul aria-label={`${name}: four views`} className={cn("grid gap-2.5", columns === 2 ? "grid-cols-2" : "grid-cols-4")}>
        {AVATAR_VIEWS.map((view) => {
          const image = views?.[view] ?? null;
          const busy = generating.includes(view);
          const label = AVATAR_VIEW_LABELS[view];
          return (
            <li key={view} className="relative flex min-w-0 flex-col gap-1">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                {busy ? (
                  <Skeleton aria-label={`Making the ${label} view`} className="absolute inset-0 rounded-none" />
                ) : image ? (
                  <Button
                    variant="ghost"
                    aria-label={`Open ${name}, ${label} view`}
                    onClick={() => setZoomed(view)}
                    className="absolute inset-0 h-full w-full cursor-zoom-in rounded-none p-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className={cn("size-full object-cover", stale && "opacity-50")} />
                  </Button>
                ) : (
                  <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <span className="text-center text-xs text-muted-foreground">{label}</span>
              {marker?.(view)}
            </li>
          );
        })}
      </ul>
      {zoomed && views && (
        <AvatarViewsGallery name={name} views={views} focus={zoomed} onClose={() => setZoomed(null)} />
      )}
    </>
  );
}
