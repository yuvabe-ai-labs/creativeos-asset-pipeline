"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { UpstreamImage } from "@/lib/video-gen/api";
import type { ImageInputCapabilities } from "@/lib/video-gen/types";

type ImageRole = "start_frame" | "end_frame" | "reference";

const ROLES: { value: ImageRole; label: string }[] = [
  { value: "start_frame", label: "Start" },
  { value: "end_frame", label: "End" },
  { value: "reference", label: "Ref" },
];

type Props = {
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: ImageInputCapabilities;
  onRoleChange: (imageId: string, role: ImageRole) => void;
};

export function VideoGenImageRoles({
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
}: Props) {
  if (images.length === 0) return null;

  const refCount = Object.values(imageRoles).filter((r) => r === "reference").length;

  return (
    <div className="flex flex-col gap-1.5">
      {images.map((img) => {
        const role: ImageRole =
          imageRoles[img.id] ?? (img.type === "image-gen" ? "start_frame" : "reference");

        // Dim thumbnail when this image's assigned role won't be used in generation
        const thumbnailDimmed =
          (role === "end_frame" && !imageInputs.endFrame) ||
          (role === "reference" && imageInputs.maxReferenceImages === 0);

        return (
          <div
            key={img.id}
            className="flex items-center gap-3 rounded-lg border border-border p-2"
          >
            {/* Thumbnail — dimmed when role is inactive/unsupported */}
            <div
              className={cn(
                "relative size-12 shrink-0 overflow-hidden rounded bg-muted transition-opacity duration-200",
                thumbnailDimmed && "opacity-25",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.imageUrl} alt="" className="size-full object-cover" />
              <span className="absolute right-0.5 top-0.5 rounded bg-black/50 px-0.5 py-px text-[0.45rem] font-medium leading-tight text-white backdrop-blur-sm">
                {img.type}
              </span>
            </div>

            {/* Role buttons — always interactive so user can reassign */}
            <div className="ml-auto flex items-center gap-1">
              {ROLES.map((r) => {
                const isActive = role === r.value;
                const notSupported =
                  (r.value === "end_frame" && !imageInputs.endFrame) ||
                  (r.value === "reference" && imageInputs.maxReferenceImages === 0);
                const atRefLimit =
                  r.value === "reference" &&
                  !isActive &&
                  refCount >= imageInputs.maxReferenceImages;
                const disabled = notSupported || atRefLimit;

                return (
                  <Button
                    key={r.value}
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => !disabled && onRoleChange(img.id, r.value)}
                    className={cn(
                      "h-auto rounded border-0 px-2 py-1 text-[0.6rem] font-medium transition-colors disabled:pointer-events-auto disabled:opacity-100",
                      isActive && !notSupported
                        ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                        : disabled
                          ? "cursor-not-allowed text-muted-foreground/20 hover:bg-transparent hover:text-muted-foreground/20 dark:hover:bg-transparent"
                          : "text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted",
                    )}
                  >
                    {r.label}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
