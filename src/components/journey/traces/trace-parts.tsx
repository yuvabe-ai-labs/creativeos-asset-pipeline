import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A labelled part of a trace (spec §3.1 order). */
export function TraceSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-eyebrow text-muted-foreground">{label}</h4>
      {children}
    </section>
  );
}

/** Text shown exactly as the model saw it or said it. The house body face, pre-wrapped: the design
 *  system allows no third font family. */
export function TraceText({ children, tone }: { children: ReactNode; tone?: "refused" }) {
  return (
    <pre
      className={cn(
        "max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-2 font-sans text-xs leading-relaxed break-words whitespace-pre-wrap",
        tone === "refused" && "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      {children}
    </pre>
  );
}

export const asJson = (value: unknown) => JSON.stringify(value, null, 2);
