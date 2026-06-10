"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type LlmPromptPanelProps = {
  localPrompt: string;
  processedOutput?: string;
  extracting: boolean;
  onPromptChange: (v: string) => void;
  onPromptBlur: () => void;
  onExtract: () => void;
};

export function LlmPromptPanel({
  localPrompt,
  processedOutput,
  extracting,
  onPromptChange,
  onPromptBlur,
  onExtract,
}: LlmPromptPanelProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!processedOutput) return;
    navigator.clipboard.writeText(processedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="shrink-0 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Extraction prompt
        </p>
        <Textarea
          value={localPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onBlur={onPromptBlur}
          placeholder="What do you want to extract? e.g. 'List all product names mentioned'"
          rows={4}
          className="resize-none"
        />
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={onExtract}
            disabled={!localPrompt.trim() || extracting}
          >
            {extracting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {processedOutput ? "Re-extract" : "Extract"}
          </Button>
          {extracting && (
            <span className="text-xs text-muted-foreground">Running extraction…</span>
          )}
        </div>
      </div>

      <div className="shrink-0 h-px bg-border" />

      <div className="flex-1 min-h-0 flex flex-col gap-2">
        <div className="shrink-0 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Result
          </p>
          {processedOutput && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              aria-label="Copy result"
            >
              {copied ? (
                <Check className="size-3.5 text-primary" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          )}
        </div>

        {processedOutput ? (
          <div className="flex-1 min-h-0 rounded-xl border bg-muted/20 overflow-hidden">
            <pre className="h-full overflow-y-auto whitespace-pre-wrap wrap-break-word p-4 text-sm leading-relaxed text-foreground/80">
              {processedOutput}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run extraction to see results here.
          </p>
        )}
      </div>
    </div>
  );
}
