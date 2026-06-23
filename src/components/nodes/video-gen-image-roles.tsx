"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpstreamImage } from "@/lib/video-gen/api";

type ImageRole = "start_frame" | "end_frame" | "reference";

const ROLES: { value: ImageRole; label: string }[] = [
  { value: "start_frame", label: "Start" },
  { value: "end_frame", label: "End" },
  { value: "reference", label: "Ref" },
];

// Veo 3.1 supports up to 3 subject reference images
const MAX_REFS = 3;

type Props = {
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  onRoleChange: (imageId: string, role: ImageRole) => void;
};

export function VideoGenImageRoles({ images, imageRoles, onRoleChange }: Props) {
  if (images.length === 0) return null;

  const refCount = Object.values(imageRoles).filter((r) => r === "reference").length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Image Inputs</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {images.length} image{images.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {images.map((img) => {
          const role: ImageRole =
            imageRoles[img.id] ?? (img.type === "image-gen" ? "start_frame" : "reference");

          return (
            <div
              key={img.id}
              className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border"
            >
              {/* Square thumbnail with type badge */}
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.imageUrl} alt="" className="size-full object-cover" />
                <span className="absolute right-0.5 top-0.5 rounded bg-black/50 px-0.5 py-px text-[0.45rem] font-medium leading-tight text-white backdrop-blur-sm">
                  {img.type}
                </span>
              </div>

              {/* Role toggle */}
              <div className="flex justify-center gap-px border-t border-border px-0.5 py-0.5">
                {ROLES.map((r) => {
                  const isActive = role === r.value;
                  const atRefLimit = r.value === "reference" && !isActive && refCount >= MAX_REFS;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      disabled={atRefLimit}
                      onClick={() => !atRefLimit && onRoleChange(img.id, r.value)}
                      className={cn(
                        "rounded px-1 py-px text-[0.5rem] font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : atRefLimit
                            ? "cursor-not-allowed text-muted-foreground/30"
                            : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
