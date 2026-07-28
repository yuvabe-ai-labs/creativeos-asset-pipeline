"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type GenerationErrorBadgeProps = {
  error: string | null | undefined;
};

export function GenerationErrorBadge({ error }: GenerationErrorBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  function handleCopy() {
    navigator.clipboard.writeText(error as string);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="destructive" size="sm" className="rounded-full">
            <AlertCircle className="size-3.5" strokeWidth={1.5} />
            Last generation failed
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <div className="flex items-start justify-between gap-2">
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-foreground">
            {error}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy error"
            className="shrink-0"
          >
            {copied ? (
              <Check className="size-3.5 text-primary" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
