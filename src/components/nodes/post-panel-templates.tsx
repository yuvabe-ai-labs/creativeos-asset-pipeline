"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { TEMPLATES, type PostTemplate } from "@/lib/post/templates";

type Props = {
  activeTemplateId?: string;
  onApply: (template: PostTemplate) => void;
};

/**
 * Applying a template is the one destructive action in the editor and it is one click away,
 * so it always confirms — including on an untouched canvas (D118). Connected images survive;
 * the caller guarantees that.
 */
export function PostPanelTemplates({ activeTemplateId, onApply }: Props) {
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
              "h-auto flex-col items-start gap-1 p-2 text-left",
              activeTemplateId === t.id && "ring-2 ring-primary ring-offset-1",
            )}
          >
            <span className="block w-full truncate text-xs font-medium">{t.name}</span>
            <span className="block w-full truncate text-[0.6rem] text-muted-foreground">
              {t.purposeTags.join(" · ")}
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
