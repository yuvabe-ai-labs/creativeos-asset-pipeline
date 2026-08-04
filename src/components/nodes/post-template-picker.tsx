"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type PostTemplate } from "@/lib/post/templates";

type Props = {
  open: boolean;
  onPick: (template: PostTemplate) => void;
  onStartBlank: () => void;
};

export function PostTemplatePicker({ open, onPick, onStartBlank }: Props) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm">
      <p className="text-eyebrow">Start from a composition</p>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
        {TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="flex flex-col items-center gap-2"
          >
            <Button
              variant="outline"
              onClick={() => onPick(t)}
              className="aspect-[4/5] w-32 rounded-lg border border-border bg-muted/30 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] h-auto p-0"
            >
              <span className="sr-only">{t.name}</span>
            </Button>
            <span className="text-xs text-muted-foreground">{t.name}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="ghost"
            onClick={onStartBlank}
            className={cn(
              "flex aspect-[4/5] w-32 items-center justify-center rounded-lg border border-dashed border-border text-2xl text-muted-foreground/60 h-auto p-0",
              "transition-colors hover:border-primary/40 hover:text-primary",
            )}
          >
            +
          </Button>
          <span className="text-xs text-muted-foreground">Start blank</span>
        </div>
      </div>
    </div>
  );
}
