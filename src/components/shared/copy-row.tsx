"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// One credential row: label, monospaced value, and a copy icon that flashes a checkmark for
// 2s on click — same pattern as file-llm-prompt-panel.tsx's copy button, so credentials can
// be shared without the fiddly drag-select-copy over a border-boxed field.
//
// Shared by every place that shows something to hand over: the reset-password dialog's
// shown-once password and the invite links (Add an agency, Resend, the Team page's Copy link).
// A value you can only select by hand is the one that gets mistyped, and TC-002 caught two
// dialogs shipping without any copy affordance at all.
export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="text-eyebrow text-muted-foreground/80">{label}</span>
        <span className="truncate font-mono text-sm">{value}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="shrink-0"
      >
        {copied ? (
          <Check className="size-3.5 text-primary" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
