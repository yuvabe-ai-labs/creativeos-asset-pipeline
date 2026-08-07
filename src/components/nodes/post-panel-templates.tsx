"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { TEMPLATES, type PostTemplate } from "@/lib/post/templates";
import type { PostFormat } from "@/lib/post/types";
import { POST_FORMATS } from "@/lib/post/formats";
import { PostLayersPreview } from "./post-layers-preview";


type Props = {
  activeTemplateId?: string;
  /** The post's current format — previews are seeded for it, so what you see is what lands. */
  format: PostFormat;
  onApply: (template: PostTemplate) => void;
  /** Clear back to an empty canvas, keeping only the connected photo. */
  onStartBlank: () => void;
};

/**
 * The blank option is NOT a member of TEMPLATES. Every real template is asserted to seed a CTA
 * group and non-empty copy, which a blank canvas by definition has neither of — so it lives
 * here as its own tile rather than as a template module that has to be excluded from its own
 * test suite.
 */
const BLANK = { id: "__blank__", name: "Blank" } as const;

/**
 * Applying a template is the one destructive action in the editor and it is one click away,
 * so it always confirms — including on an untouched canvas (D118). Connected images survive;
 * the caller guarantees that.
 */
export function PostPanelTemplates({ activeTemplateId, format, onApply, onStartBlank }: Props) {
  const [pending, setPending] = useState<PostTemplate | typeof BLANK | null>(null);
  const spec = POST_FORMATS[format];
  const isBlank = pending?.id === BLANK.id;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => setPending(BLANK)}
          className={cn(
            "h-auto flex-col items-stretch gap-1.5 p-1.5 text-left",
            !activeTemplateId && "ring-2 ring-primary ring-offset-1",
          )}
        >
          <span
            className="flex w-full items-center justify-center rounded-sm border border-dashed border-border bg-background"
            style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
          >
            <Plus className="size-4 text-muted-foreground" strokeWidth={1.5} />
          </span>
          <span className="block w-full truncate px-0.5 text-[0.65rem] font-medium leading-tight">
            {BLANK.name}
          </span>
        </Button>
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
            <AlertDialogTitle>
              {isBlank ? "Start from blank?" : `Apply “${pending?.name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlank
                ? "This clears every layer. Your connected image is kept, full-bleed."
                : "This replaces your current layout. Your connected image is kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (isBlank) onStartBlank();
                else if (pending) onApply(pending as PostTemplate);
                setPending(null);
              }}
            >
              {isBlank ? "Clear" : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
