import { Info, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// A field header — a small muted icon beside the field name — used above chip
// groups in the image-gen output settings and the prompt node's shot controls.
// `info` puts the field's explanation behind an (i) beside the name, so the
// settings stay compact (D431).
export function FieldLabel({
  icon: Icon,
  label,
  info,
}: {
  icon: LucideIcon;
  label: string;
  info?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
      <Icon className="size-4 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
      {label}
      {info && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  aria-label={info}
                  className="inline-flex cursor-help text-muted-foreground/70 transition-colors hover:text-foreground"
                />
              }
            >
              <Info className="size-3.5 shrink-0" strokeWidth={1.5} />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              {info}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );
}
