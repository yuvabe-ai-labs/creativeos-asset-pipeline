"use client";

import { useState } from "react";
import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "./field-label";
import { LOOK_PRESETS } from "@/lib/nodes/video-controls";

/**
 * D201 — the LOOK contract, the one control multishot needs that a single shot does not.
 *
 * It is reproduced VERBATIM at the top of every beat, which is what makes separate cuts read as
 * one film. That is also why it is a free textarea rather than a set of selects: the useful thing
 * to write is repeatable physical fact ("low sun from camera-left, long shadows toward the lens,
 * warm grey concrete, 35mm at knee height"), and no fixed vocabulary covers that. The presets are
 * a paragraph to start editing, not a menu to pick from.
 *
 * Commits on blur, matching the composition-instructions field on the Draw node — a controlled
 * value that patched on every keystroke would write a version per character.
 */
export function LookContractField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [lastExternal, setLastExternal] = useState(value);

  // Adopt an external change (a version restore, a preset applied elsewhere) without clobbering
  // what is being typed right now.
  if (value !== lastExternal) {
    setLastExternal(value);
    setDraft(value);
  }

  return (
    <div className="space-y-2">
      <FieldLabel icon={Sun} label="Look contract" />
      <p className="text-xs text-muted-foreground">
        Repeated word for word at the top of every beat — it is what makes the cuts read as one
        film. Name light, palette and ground, not a mood.
      </p>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        disabled={disabled}
        rows={4}
        placeholder="Low sun from camera-left, long shadows toward the lens. 35mm at knee height, shallow focus. Palette of warm grey concrete, off-white and denim. No colour gels, no slow motion."
        className="nodrag resize-none border-border bg-muted/50 text-sm"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.7rem] text-muted-foreground">Start from</span>
        {LOOK_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setDraft(preset.prose);
              onChange(preset.prose);
            }}
            title={preset.prose}
            className={cn(
              "nodrag h-auto rounded-md border border-dashed border-primary/40 px-2 py-1",
              "text-[0.7rem] font-medium text-primary transition-colors duration-200",
              "hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5",
            )}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
