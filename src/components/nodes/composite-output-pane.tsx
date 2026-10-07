"use client";

import { Combine, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Props = {
  nodeId: string;
  imageUrl: string | null;
  generating: boolean;
  /** Edit acts on this picture, so the switch sits over it — where Image Gen keeps it. */
  canEdit: boolean;
  editMode: boolean;
  onEditModeChange: (next: boolean) => void;
};

/** D312 — the composite's current image, or what is about to fill it, under Image Gen's header. */
export function CompositeOutputPane({ nodeId, imageUrl, generating, canEdit, editMode, onEditModeChange }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-muted/20 px-6 py-5">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">{editMode && canEdit && !generating ? "Base image" : "Generated image"}</span>
        </div>
        {canEdit && (
          <Label
            htmlFor={`composite-edit-mode-${nodeId}`}
            className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
          >
            Edit
            <Switch id={`composite-edit-mode-${nodeId}`} checked={editMode} onCheckedChange={onEditModeChange} />
          </Label>
        )}
      </div>
      {/* Left-aligned under the header, like Image Gen's output column. */}
      <div className="flex min-h-0 flex-1 items-start justify-start overflow-y-auto">
        {generating ? (
          <Skeleton className="aspect-[9/16] w-full max-w-sm rounded-xl" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Composite" className="max-h-full w-auto rounded-xl border border-border shadow-card" />
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
