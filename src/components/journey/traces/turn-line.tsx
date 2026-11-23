"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TRACE_MARK_LABEL, type TraceMark, type TurnLine } from "@/lib/journey/kb-copilot/trace";
import { cn } from "@/lib/utils";

const SERIOUS = new Set<TraceMark>(["failed", "refused"]);

/** A turn's marks (spec §3.2): a failure or a refusal in the destructive tone, the others quiet. */
export function TurnMarks({ marks }: { marks: TraceMark[] }) {
  if (marks.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {marks.map((m) => (
        <Badge key={m} variant={SERIOUS.has(m) ? "destructive" : "outline"} className="text-[0.7rem]">{TRACE_MARK_LABEL[m]}</Badge>
      ))}
    </span>
  );
}

export const turnTime = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One line of the Turns list: when, what was sent, the tools, how long, and the marks. */
export function TurnLineRow({ line, open, onToggle }: { line: TurnLine; open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      aria-expanded={open}
      onClick={onToggle}
      className="h-auto w-full flex-col items-stretch gap-1 rounded-xl px-3 py-2 text-left font-normal whitespace-normal"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{turnTime(line.createdAt)}</span>
        <span aria-hidden>·</span>
        <span>{(line.durationMs / 1000).toFixed(1)} s</span>
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]", open && "rotate-180")} strokeWidth={1.5} aria-hidden />
      </span>
      <span className="truncate text-sm text-foreground">{line.sentText || "(attachments only)"}</span>
      <span className="truncate text-xs text-muted-foreground">{line.tools.length > 0 ? line.tools.join(", ") : "No tool called"}</span>
      <TurnMarks marks={line.marks} />
    </Button>
  );
}
