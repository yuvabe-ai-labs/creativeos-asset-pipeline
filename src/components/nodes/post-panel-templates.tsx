"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { TEMPLATES, type PostTemplate } from "@/lib/post/templates";
import type { PostFormat } from "@/lib/post/types";
import { PostLayersPreview } from "./post-layers-preview";

type Props = {
  activeTemplateId?: string;
  /** The post's current format — previews are seeded for it, so what you see is what lands. */
  format: PostFormat;
  onApply: (template: PostTemplate) => void;
};

/**
 * Applying a template is the one destructive action in the editor and it is one click away,
 * so it always confirms — including on an untouched canvas (D118). Connected images survive;
 * the caller guarantees that.
 */
export function PostPanelTemplates({ activeTemplateId, format, onApply }: Props) {
  const [pending, setPending] = useState<PostTemplate | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <Button
            key={t.id}
            variant="outline"
            onClick={() => setPending(t)}
            className={cn(
              "h-auto flex-col items-stretch gap-1.5 p-1.5 text-left",
              activeTemplateId === t.id && "ring-2 ring-primary ring-offset-1",
            )}
          >
            {/* Seeded for the CURRENT format, so the thumbnail is the composition that will
                actually land — templates tune themselves per aspect band. */}
            <PostLayersPreview layers={t.seedLayers(format)} format={format} />
            <span className="block w-full truncate px-0.5 text-[0.65rem] font-medium leading-tight">
              {t.name}
            </span>
          </Button>
        ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply “{pending?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your current layout. Your connected image is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onApply(pending);
                setPending(null);
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
