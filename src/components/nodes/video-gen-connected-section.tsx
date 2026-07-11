"use client";

import { useState } from "react";
import { ChevronRight, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  onConflictingRoleRequest: (imageId: string, role: ImageRole) => void;
  onOpenDetail?: (id: string, type: "prompt" | "image") => void;
  disableFrameInputs?: boolean;
  disableFrameInputsReason?: string;
  disableRefs?: boolean;
  disableRefsReason?: string;
  onReset?: () => void;
};

export function VideoGenConnectedSection({
  promptNode,
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
  onConflictingRoleRequest,
  onOpenDetail,
  disableFrameInputs = false,
  disableFrameInputsReason,
  disableRefs = false,
  disableRefsReason,
  onReset,
}: Props) {
  const [promptOpen, setPromptOpen] = useState(false);

  const hasContent = promptNode !== null || images.length > 0;
  const hasAnyAssignment = Object.keys(imageRoles).length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs italic text-muted-foreground/60">
        Connect a File node with an image to use as start frame, end frame, or reference.
      </p>
    );
  }

  const referenceCount = Object.values(imageRoles).filter((r) => r === "reference").length;

  function getRoleTooltip(imageId: string, role: ImageRole): string | null {
    // Structural capability check (model doesn't support this role type) — keep disabled
    if (role === "start_frame" && !imageInputs.startFrame)
      return "Not supported by this model";
    if (role === "end_frame" && !imageInputs.endFrame)
      return "Not supported by this model";
    if (role === "reference") {
      if (imageInputs.maxReferenceImages === 0) return "Not supported by this model";
      if (
        referenceCount >= imageInputs.maxReferenceImages &&
        imageRoles[imageId] !== "reference"
      )
        return `Max ${imageInputs.maxReferenceImages} reference image${imageInputs.maxReferenceImages === 1 ? "" : "s"}`;
    }
    // Constraint-based disabling is now handled via onConflictingRoleRequest — no tooltip here
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Clear roles button — only shown when at least one role is assigned */}
      {hasAnyAssignment && onReset && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3" strokeWidth={1.5} />
            Clear roles
          </button>
        </div>
      )}

      {promptNode && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setPromptOpen((p) => !p)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
                  promptOpen && "rotate-90",
                )}
              />
              <span className="truncate text-xs font-semibold text-foreground">
                Video prompt
              </span>
            </button>
            {onOpenDetail && (
              <button
                type="button"
                onClick={() => onOpenDetail(promptNode.id, "prompt")}
                title="View full prompt"
                className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>
          {promptOpen && (
            <div className="px-3 pb-2.5">
              {promptNode.text ? (
                <p className="text-xs leading-relaxed text-foreground/70">
                  {promptNode.text}
                </p>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">
                  No motion prompt generated yet — generate from the video-prompt node first.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {images.length > 0 && (
        <TooltipProvider>
          <div className="grid grid-cols-2 gap-2">
            {images.map((image) => {
              const activeRole = imageRoles[image.id];
              return (
                <div
                  key={image.id}
                  className="group relative overflow-hidden rounded-lg border border-border"
                >
                  <div className="aspect-video">
                    <img
                      src={image.imageUrl}
                      alt={`Image input (${image.type})`}
                      className="size-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  {onOpenDetail && (
                    <button
                      type="button"
                      onClick={() => onOpenDetail(image.id, "image")}
                      title="View full image"
                      className="absolute right-1.5 top-1.5 flex items-center justify-center rounded bg-black/60 p-1 text-white/80 opacity-0 backdrop-blur-sm transition-opacity hover:text-white group-hover:opacity-100"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 bg-black/60 p-1.5 backdrop-blur-sm">
                    {(["start_frame", "end_frame", "reference"] as const).map((role) => {
                      const label =
                        role === "start_frame" ? "Start" : role === "end_frame" ? "End" : "Ref";
                      const tooltip = getRoleTooltip(image.id, role);
                      const structurallyDisabled = tooltip !== null;
                      const active = activeRole === role;

                      // Constraint-blocked: clickable but visually dimmed
                      const isConstraintBlocked =
                        ((role === "start_frame" || role === "end_frame") && disableFrameInputs) ||
                        (role === "reference" && disableRefs);

                      function handleClick() {
                        if (structurallyDisabled) return;
                        if (isConstraintBlocked) {
                          onConflictingRoleRequest(image.id, role);
                          return;
                        }
                        onRoleChange(image.id, role);
                      }

                      const btn = (
                        <button
                          key={role}
                          type="button"
                          aria-disabled={structurallyDisabled}
                          aria-label={`Set as ${role.replace(/_/g, " ")}`}
                          onClick={handleClick}
                          className={cn(
                            "rounded px-2 py-0.5 text-[0.65rem] font-semibold transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-white/20 text-white/80 hover:bg-white/30",
                            structurallyDisabled && "cursor-not-allowed opacity-40",
                            isConstraintBlocked && !active && "opacity-60 cursor-pointer",
                          )}
                        >
                          {label}
                        </button>
                      );
                      if (!tooltip) return btn;
                      return (
                        <Tooltip key={role}>
                          <TooltipTrigger render={<span className="inline-flex" />}>
                            {btn}
                          </TooltipTrigger>
                          <TooltipContent side="top">{tooltip}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
