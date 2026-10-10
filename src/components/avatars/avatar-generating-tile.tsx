import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// A placeholder that says what it is waiting for. A bare grey box reads as "loading the page",
// not "making your image", so every generating slot in the Studio carries a spinner and a label
// (D297 review). The caller gives it the box of the image that will replace it.
export function AvatarGeneratingTile({ label = "Generating…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("relative overflow-hidden rounded-lg", className)}>
      <Skeleton className="absolute inset-0 rounded-[inherit]" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
        {label}
      </span>
    </div>
  );
}
