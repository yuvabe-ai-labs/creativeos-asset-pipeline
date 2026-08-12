"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PostFormat } from "@/lib/post/types";
import { POST_FORMATS, FORMATS_BY_PLATFORM } from "@/lib/post/formats";

type Props = {
  format: PostFormat;
  onSelect: (format: PostFormat) => void;
};

/** A proportional swatch so the ratio is legible at a glance, not just as text. */
function RatioSwatch({ width, height }: { width: number; height: number }) {
  const scale = 22 / Math.max(width, height);
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[3px] border border-border bg-muted"
      style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
    />
  );
}

export function PostPanelSizes({ format, onSelect }: Props) {
  return (
    <div className="space-y-4">
      {FORMATS_BY_PLATFORM.map((group) => (
        <div key={group.platform}>
          <p className="mb-1 text-[0.6rem] font-semibold text-muted-foreground">{group.platform}</p>
          <div className="space-y-0.5">
            {group.formats.map((key) => {
              const spec = POST_FORMATS[key];
              const active = key === format;
              return (
                <Button
                  key={key}
                  variant="ghost"
                  onClick={() => onSelect(key)}
                  className={cn(
                    "h-auto w-full justify-start gap-2 px-2 py-1.5 text-left",
                    active && "bg-primary/10",
                  )}
                >
                  <span className="flex w-6 items-center justify-center">
                    <RatioSwatch width={spec.width} height={spec.height} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{spec.label}</span>
                    <span className="block text-[0.6rem] text-muted-foreground">
                      {spec.width} × {spec.height}
                    </span>
                  </span>
                  {active && <Check className="size-3.5 shrink-0 text-primary" strokeWidth={2} />}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
