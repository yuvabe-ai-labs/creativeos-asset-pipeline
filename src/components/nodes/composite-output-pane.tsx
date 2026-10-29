"use client";

import { MEDIA_FADE_CLASS, useMediaReady } from "@/hooks/use-media-ready";
import { cn } from "@/lib/utils";
import { Combine, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { ReactNode, Ref } from "react";
import { VersionOutputEmpty } from "./version-output-empty";
import { ImageGenAnnotationCanvas, type AnnotationHandle } from "./image-gen-annotation-canvas";

type Props = {
  nodeId: string;
  imageUrl: string | null;
  generating: boolean;
  /** Edit acts on this picture, so the switch sits over it — where Image Gen keeps it. */
  canEdit: boolean;
  editMode: boolean;
  onEditModeChange: (next: boolean) => void;
  /** True while editing with a model that takes a mask (GPT Image): paint the region to change. */
  painting: boolean;
  paintRef: Ref<AnnotationHandle>;
  /** Remounts the canvas (clearing strokes) when the picture or model changes. */
  paintKey: string;
  onMarksChange: (has: boolean) => void;
  /** D433 — while an older version (picked in History) shows: a quiet tag in the Edit switch's
   *  place, so the picture below never moves. */
  viewingTag?: ReactNode;
  /** D383 — the version on screen failed. */
  viewingFailed?: boolean;
  /** D384 — the chosen aspect ratio, for the placeholder while generating. */
  placeholderRatio?: number;
};

/** D312 — the composite's current image, or what is about to fill it, under Image Gen's header. */
export function CompositeOutputPane({ nodeId, imageUrl, generating, canEdit, editMode, onEditModeChange, painting, paintRef, paintKey, onMarksChange, viewingTag, viewingFailed, placeholderRatio = 9 / 16 }: Props) {
  // D432 — the picture fades in over the generating placeholder once loaded.
  const { ready: mediaReady, onReady: onMediaReady, measure: measureMedia } = useMediaReady(imageUrl);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/20 px-6 py-5">
      <div className="flex h-8 shrink-0 items-center gap-6">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">{editMode && canEdit && !generating ? "Base image" : "Generated image"}</span>
        </div>
        {viewingTag ?? (canEdit && (
          <Label
            htmlFor={`composite-edit-mode-${nodeId}`}
            className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
          >
            Edit
            <Switch id={`composite-edit-mode-${nodeId}`} checked={editMode} onCheckedChange={onEditModeChange} />
          </Label>
        ))}
      </div>
      {/* Left-aligned under the header, like Image Gen's output column. */}
      <div className="flex min-h-0 flex-1 items-start justify-start overflow-y-auto">
        {viewingFailed ? (
          <VersionOutputEmpty noun="image" />
        ) : generating ? (
          <Skeleton className="w-full max-w-sm rounded-xl" style={{ aspectRatio: placeholderRatio }} />
        ) : painting && imageUrl ? (
          // Image Gen's paint mode: a clean base, the painted region sent as a separate mask.
          <ImageGenAnnotationCanvas
            key={paintKey}
            ref={paintRef}
            baseUrl={imageUrl}
            alt="Base image"
            onMarksChange={onMarksChange}
          />
        ) : imageUrl ? (
          // Loading, the frame is the generating placeholder's size (below), so the swap is still.
          <div className={cn("relative max-h-full max-w-full", mediaReady ? "w-fit" : "w-full max-w-sm")}>
            {!mediaReady && <Skeleton className="absolute inset-0 rounded-xl" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imageUrl}
              ref={measureMedia}
              src={imageUrl}
              alt="Composite"
              onLoad={onMediaReady}
              onError={onMediaReady}
              style={{ aspectRatio: `auto ${placeholderRatio}` }}
              className={cn("max-h-full rounded-xl border border-border shadow-card", MEDIA_FADE_CLASS, mediaReady ? "w-auto" : "w-full opacity-0")}
            />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
            <Combine className="size-6 text-primary" strokeWidth={1.5} />
            <p>Wire in an avatar, a background or a product — or none — and say what to make.</p>
          </div>
        )}
      </div>
    </div>
  );
}
