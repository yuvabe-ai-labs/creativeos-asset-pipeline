import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A white panel of the editor page (mockup: 14px radius, 1px border). `action` sits at the end of
 *  its header (the collapse chevron, D403). */
export function EditorPanel({ label, aside, action, className, children }: { label: string; aside?: ReactNode; action?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <section aria-label={label} className={cn("flex min-h-0 flex-col gap-3 overflow-hidden rounded-[14px] border border-border bg-card p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-eyebrow text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1">
          {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
          {action}
        </span>
      </div>
      {children}
    </section>
  );
}
