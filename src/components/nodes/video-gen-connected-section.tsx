// src/components/nodes/video-gen-connected-section.tsx
"use client";

import { cn } from "@/lib/utils";
import type { UpstreamImage, UpstreamPromptNode } from "@/lib/video-gen/api";

type ImageRole = "start_frame" | "end_frame" | "reference";

type ImageInputs = {
  startFrame: boolean;
  endFrame: boolean;
  maxReferenceImages: number;
};

type Props = {
  promptNode: UpstreamPromptNode | null;
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: ImageInputs;
  onRoleChange: (imageId: string, role: ImageRole) => void;
};

export function VideoGenConnectedSection({
  promptNode,
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
}: Props) {
  const hasContent = promptNode !== null || images.length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs italic text-muted-foreground/60">
        Connect a video-prompt node or image nodes.
      </p>
    );
  }

  const referenceCount = Object.values(imageRoles).filter((r) => r === "reference").length;

  function isRoleDisabled(imageId: string, role: ImageRole): boolean {
    if (role === "start_frame") return !imageInputs.startFrame;
    if (role === "end_frame") return !imageInputs.endFrame;
    if (role === "reference") {
      if (imageInputs.maxReferenceImages === 0) return true;
      if (
        referenceCount >= imageInputs.maxReferenceImages &&
        imageRoles[imageId] !== "reference"
      )
        return true;
    }
    return false;
  }

  return (
    <div className="flex flex-col gap-3">
      {promptNode && (
        <div className="rounded-lg border border-border p-3">
          {promptNode.text ? (
            <p className="line-clamp-4 text-xs leading-relaxed text-foreground">
              {promptNode.text}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground/60">
              No motion prompt generated yet — generate from the video-prompt node first.
            </p>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((image) => {
            const activeRole = imageRoles[image.id] ?? "reference";
            return (
              <div
                key={image.id}
                className="relative overflow-hidden rounded-lg border border-border"
              >
                <div className="aspect-video">
                  <img
                    src={image.imageUrl}
                    alt={`Image input (${image.type})`}
                    className="size-full object-cover"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 bg-black/60 p-1.5 backdrop-blur-sm">
                  {(["start_frame", "end_frame", "reference"] as const).map((role) => {
                    const label =
                      role === "start_frame" ? "S" : role === "end_frame" ? "E" : "R";
                    const disabled = isRoleDisabled(image.id, role);
                    const active = activeRole === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={disabled}
                        onClick={() => onRoleChange(image.id, role)}
                        className={cn(
                          "rounded px-2 py-0.5 text-[0.65rem] font-semibold transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/20 text-white/80 hover:bg-white/30",
                          disabled && "cursor-not-allowed opacity-30",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
