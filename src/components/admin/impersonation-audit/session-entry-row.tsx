import { Unlock, Sparkles, PenLine } from "lucide-react";
import type { SessionEntry } from "@/lib/auth/impersonation-audit-view";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// One line on a session's timeline. Times sit in a fixed, tabular column so they align
// down the list regardless of label length.
export function SessionEntryRow({ entry }: { entry: SessionEntry }) {
  const Icon =
    entry.kind === "elevated" ? Unlock : entry.kind === "generation" ? Sparkles : PenLine;

  return (
    <li className="flex items-baseline gap-3 py-1.5">
      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {timeOf(entry.at)}
      </span>
      <Icon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground/60" strokeWidth={1.5} />
      {entry.kind === "generation" ? (
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground">
          Generated {entry.genType}
          {entry.model && <span className="text-muted-foreground">· {entry.model}</span>}
          {entry.credits !== null && (
            <span className="text-muted-foreground">· {entry.credits} credits</span>
          )}
          {entry.status !== "succeeded" && (
            <span className="text-eyebrow text-destructive">{entry.status}</span>
          )}
        </span>
      ) : (
        <span className="text-sm text-foreground">
          {entry.kind === "elevated" ? "Enabled editing" : entry.label}
        </span>
      )}
    </li>
  );
}
