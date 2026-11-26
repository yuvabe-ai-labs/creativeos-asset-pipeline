"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// One credential row: label, monospaced value, and a Copy button that reads "Copied" for 2s.
// Shared by every place that shows something to hand over: the reset-password dialog's
// shown-once password and the invite links (Add an agency, Invite an owner, Resend, the Team
// page's Copy link). A value you can only select by hand is the one that gets mistyped.
//
// `min-w-0 w-full` matters: inside a dialog's grid a long link (no spaces) otherwise sets the
// row's minimum width and pushes the button and the dialog's footer out past its edge.
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  // "Copied" only when the copy really happened. If the browser refuses, the value stays on
  // screen and one click selects all of it (select-all) to copy by hand.
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 py-2 pr-2 pl-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-eyebrow text-muted-foreground/80">{label}</span>
        <span className="truncate font-mono text-sm select-all" title={value}>
          {value}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleCopy()}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="shrink-0"
      >
        {copied ? <Check className="size-3.5 text-primary" strokeWidth={1.5} /> : <Copy className="size-3.5" strokeWidth={1.5} />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
