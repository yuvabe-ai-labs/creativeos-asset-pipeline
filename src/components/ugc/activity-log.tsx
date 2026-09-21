"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LogEntry } from "@/lib/ugc/request";
import { cn } from "@/lib/utils";

type Props = { entries: LogEntry[]; onClear: () => void };

// Every BytePlus call the bench made, newest first. Errors are red and expandable to the
// raw response; "Copy log" puts the whole trail on the clipboard to paste into a bug report.
export function ActivityLog({ entries, onClear }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const errors = entries.filter((e) => !e.ok).length;

  async function copy() {
    await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className="text-eyebrow">Activity log</span>
        {errors > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <AlertTriangle className="size-3.5" strokeWidth={1.5} />
            {errors} error{errors > 1 ? "s" : ""}
          </span>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={copy} disabled={!entries.length}>
          {copied ? <Check className="size-3.5" strokeWidth={1.5} /> : <Copy className="size-3.5" strokeWidth={1.5} />}
          {copied ? "Copied" : "Copy log"}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClear} disabled={!entries.length} aria-label="Clear log">
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>

      {!entries.length && <p className="text-xs text-neutral-500">No calls yet.</p>}

      <div className="divide-y divide-neutral-100">
        {entries.map((e) => (
          <div key={e.id} className="py-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(open === e.id ? null : e.id)}
              className={cn(
                "h-auto w-full justify-start gap-2 px-1 py-1 text-left font-normal",
                !e.ok && "text-destructive",
              )}
            >
              <ChevronRight
                className={cn("size-3.5 shrink-0 transition-transform", open === e.id && "rotate-90")}
                strokeWidth={1.5}
              />
              <span className="w-16 shrink-0 tabular-nums text-neutral-500">
                {new Date(e.at).toLocaleTimeString()}
              </span>
              <span className="truncate">{e.label}</span>
              <span className="ml-auto shrink-0 tabular-nums text-neutral-500">
                {e.httpStatus ?? "—"} · {(e.ms / 1000).toFixed(1)}s
              </span>
            </Button>
            {open === e.id && (
              <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-700">
                {JSON.stringify({ url: `${e.method} ${e.url}`, request: e.request, response: e.response }, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
