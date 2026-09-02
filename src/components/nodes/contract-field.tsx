"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "./field-label";
import type { LookPreset } from "@/lib/nodes/video-controls";

/**
 * A verbatim contract — the LOOK (D201) or the VOICE (D204).
 *
 * Both are reproduced WORD FOR WORD at the top of every beat, and that is what makes separate cuts
 * read as one film: the LOOK in picture, the VOICE in sound. Paraphrase is drift.
 *
 * That is also why each is a free textarea rather than a set of selects. The useful thing to write
 * is repeatable physical fact — "low sun from camera-left, long shadows toward the lens, 35mm at
 * knee height", "male, early thirties, close-mic, no upward sell inflection" — and no fixed
 * vocabulary covers it. The presets are a paragraph to start editing, not a menu to pick from.
 *
 * Commits on blur, matching the composition-instructions field on the Draw node — a controlled
 * value that patched on every keystroke would write a version per character.
 */
export function ContractField({
  icon,
  label,
  help,
  placeholder,
  presets,
  value,
  onChange,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  help: string;
  placeholder: string;
  presets: LookPreset[];
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
    // min-w-0 so a long preset label or placeholder can never hold this column open.
    <div className="min-w-0 space-y-1.5">
      <FieldLabel icon={icon} label={label} />
      <p className="text-xs text-muted-foreground">{help}</p>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        disabled={disabled}
        rows={3}
        placeholder={placeholder}
        className="nodrag w-full resize-none border-border bg-muted/50 text-sm"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.7rem] text-muted-foreground">Start from</span>
        {presets.map((preset) => (
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
