import { Check, Loader2, X } from "lucide-react";
import type { StatusLine } from "@/lib/journey/thread/schema";
import { cn } from "@/lib/utils";

const TONE: Record<StatusLine["state"], string> = {
  running: "text-foreground",
  done: "text-success-text",
  failed: "text-destructive-text",
};

/** What the copilot has done or is doing (journey spec §4.3): a tick when done, a cross when it
 *  failed, a spinner while it runs. */
export function ThreadStatusLines({ lines, live = false }: { lines: StatusLine[]; live?: boolean }) {
  if (lines.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-live={live ? "polite" : undefined}>
      {lines.map((line) => (
        <li key={line.text} className={cn("flex items-center gap-2 text-sm font-medium", TONE[line.state])}>
          {line.state === "done" && <Check className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
          {line.state === "failed" && <X className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
          {line.state === "running" && (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" strokeWidth={1.5} aria-hidden />
          )}
          {line.text}
        </li>
      ))}
    </ul>
  );
}
