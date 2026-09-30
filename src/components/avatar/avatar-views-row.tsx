"use client";

import { Skeleton } from "@/components/ui/skeleton";

export type AvatarViewKey = "right" | "left" | "back";

const VIEWS: { key: AvatarViewKey; label: string }[] = [
  { key: "right", label: "Right view" },
  { key: "left", label: "Left view" },
  { key: "back", label: "Back view" },
];

type Props = {
  views: Partial<Record<AvatarViewKey, string>>;
  generating: boolean;
};

// The character's perspective profiles, stacked in a column beside the preview video.
export function AvatarViewsRow({ views, generating }: Props) {
  return (
    <div className="flex h-full flex-col justify-between gap-4">
      {VIEWS.map(({ key, label }) => {
        const url = views[key];
        return (
          <figure key={key} className="flex flex-col gap-2">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted/40 shadow-card">
              {generating ? (
                <Skeleton className="absolute inset-0 rounded-none" />
              ) : url ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated asset URL
                <img src={url} alt={label} className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  Not generated
                </span>
              )}
            </div>
            <figcaption className="text-center text-sm text-muted-foreground">{label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
