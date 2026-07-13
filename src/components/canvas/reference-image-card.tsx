"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReferenceImageCardProps = {
  imageUrl: string;
  filename: string;
  subtitle: string;
  selected: boolean;
  onToggle: () => void;
};

export function ReferenceImageCard({
  imageUrl,
  filename,
  subtitle,
  selected,
  onToggle,
}: ReferenceImageCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border bg-card shadow-card",
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:-translate-y-0.5 hover:scale-[1.006]",
        selected
          ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
          : "border-border",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={filename}
        className="h-36 w-full object-cover"
      />

      <div
        className={cn(
          "absolute inset-0 bg-black/30 transition-opacity duration-200",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />

      <div
        className={cn(
          "absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all duration-200",
          selected
            ? "border-primary bg-primary"
            : "border-white/80 bg-white/20 opacity-0 group-hover:opacity-100",
        )}
      >
        {selected && <Check className="size-3 text-white" strokeWidth={2.5} />}
      </div>

      <div className="bg-card px-2.5 py-2">
        <p className="truncate text-xs font-medium text-foreground">{filename}</p>
        <p className="truncate text-[0.65rem] text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
