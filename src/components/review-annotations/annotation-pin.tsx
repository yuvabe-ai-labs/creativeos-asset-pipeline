"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A numbered pin at a fractional position over media. Non-interactive by default;
// pass onClick (read mode) to open its note. The wrapper <span> is not a control —
// when clickable it renders a Base-UI Button instead, never a raw <button>.
export function AnnotationPin({
  seq,
  x,
  y,
  active = false,
  onClick,
}: {
  seq: number;
  x: number; // fraction of container width
  y: number; // fraction of container height
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "absolute z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center",
    "rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md",
    "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
    active && "scale-125 ring-2 ring-primary/40",
  );
  const style = { left: `${x * 100}%`, top: `${y * 100}%` };
  if (!onClick) {
    return (
      <span className={className} style={style} aria-hidden>
        {seq}
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(className, "h-5 min-w-0 p-0 hover:bg-primary")}
      style={style}
      aria-label={`Annotation ${seq}`}
    >
      {seq}
    </Button>
  );
}
