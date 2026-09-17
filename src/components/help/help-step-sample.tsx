"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HelpStep } from "@/lib/help/types";

// The right-hand pane for a step whose answer is something to TAKE rather than watch — an
// example script, or a prompt to paste into an LLM. Fills the space a clip would, so the chapter
// keeps one layout whichever kind of step is open.
//
// Copy flashes a checkmark for 2s, the same pattern as copy-row.tsx: a long prompt you can only
// drag-select is one that gets pasted with its last rules missing.
export function HelpStepSample({ sample }: { sample: NonNullable<HelpStep["sample"]> }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(sample.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="text-eyebrow text-muted-foreground">{sample.label}</span>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <Check className="size-3.5 text-primary" strokeWidth={1.5} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.5} />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {/* font-sans, not mono: the system allows two families, and this is prose to read. */}
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
        {sample.text}
      </pre>
    </div>
  );
}
