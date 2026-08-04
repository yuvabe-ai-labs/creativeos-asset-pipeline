"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATES, type PostTemplate } from "@/lib/post/templates";
import { copyZoneHint } from "@/lib/post/copy-zone-hint";

type Props = {
  open: boolean;
  onPick: (template: PostTemplate) => void;
  onStartBlank: () => void;
};

export function PostTemplatePicker({ open, onPick, onStartBlank }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-sm">
      <p className="text-eyebrow">Start from a composition</p>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-5">
        {TEMPLATES.map((t) => (
          <div
            key={t.id}
            className="flex flex-col items-center gap-2"
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered((cur) => (cur === t.id ? null : cur))}
          >
            <Button
              variant="outline"
              onClick={() => onPick(t)}
              className="aspect-[4/5] w-32 rounded-lg border border-border bg-muted/30 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]"
            >
              <span className="sr-only">{t.name}</span>
            </Button>
            <span className="text-xs text-muted-foreground">{t.name}</span>
            {hovered === t.id && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(copyZoneHint(t.copyZone));
                  toast.success("Image brief copied");
                }}
              >
                <Copy className="size-3" /> Copy image brief
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="ghost"
            onClick={onStartBlank}
            className={cn(
              "flex aspect-[4/5] w-32 items-center justify-center rounded-lg border border-dashed border-border text-2xl text-muted-foreground/60",
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
