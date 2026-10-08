"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AVATAR_VIEWS, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarSheetViews, AvatarViewId } from "@/lib/avatars/schema";

// D339 — the four views side by side, large, so the person can be checked from every side at
// once. Opened from any view tile; the one clicked is ringed.
export function AvatarViewsGallery({ name, views, focus, onClose }: {
  name: string;
  views: AvatarSheetViews;
  focus: AvatarViewId;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{name} · four views</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {AVATAR_VIEWS.map((view) => {
            const image = views[view];
            return (
              <figure key={view} className="m-0 flex flex-col gap-1.5">
                <div
                  className={cn(
                    "aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted",
                    view === focus && "ring-2 ring-primary ring-offset-2",
                  )}
                >
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt={`${name}, ${AVATAR_VIEW_LABELS[view]} view`} className="size-full object-contain" />
                  )}
                </div>
                <figcaption className="text-center text-xs text-muted-foreground">{AVATAR_VIEW_LABELS[view]}</figcaption>
              </figure>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
