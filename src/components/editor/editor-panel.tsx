import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A white panel of the editor page (mockup: 14px radius, 1px border, generous padding). */
export function EditorPanel({ label, aside, className, children }: { label: string; aside?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <section aria-label={label} className={cn("flex min-h-0 flex-col gap-3 rounded-[14px] border border-border bg-card p-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-eyebrow text-muted-foreground">{label}</span>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
