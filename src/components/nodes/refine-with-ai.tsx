"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REFINE_SUGGESTIONS, type RefineScope } from "@/lib/nodes/refine-suggestions";

const HELP: Record<RefineScope, string> = {
  all: "Describe the change — the writer rewrites every shot with it in mind.",
  look: "Describe the change — the writer rewrites the look. Your beats are left as they are.",
  cut: "Describe the change — the writer rewrites this shot only.",
};

const PLACEHOLDER: Record<RefineScope, string> = {
  all: 'e.g. "fewer product close-ups, more street"',
  look: 'e.g. "colder light, overcast rather than low sun"',
  cut: 'e.g. "tighter, and let the sole read"',
};

/**
 * Refine with AI — the KB's pattern (`kb-field-row.tsx`), at three scopes.
 *
 * The note is EPHEMERAL: it steers this one rewrite and is cleared when the popover closes. The
 * standing brief stays the standing brief, so a throwaway "try it darker" never silently becomes
 * part of a shot's definition.
 *
 * Uses shadcn `Textarea`, not a raw `<textarea>` — the KB's own popover predates that rule.
 */
export function RefineWithAI({
  scope,
  busy = false,
  disabled = false,
  onSubmit,
  label,
}: {
  scope: RefineScope;
  busy?: boolean;
  disabled?: boolean;
  onSubmit: (note: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  function submit() {
    const trimmed = note.trim();
    if (!trimmed) return;
    setOpen(false);
    setNote("");
    onSubmit(trimmed);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNote("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            disabled={disabled || busy}
            aria-label={label}
            title={label}
            className="h-auto rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary data-[popup-open]:bg-primary/10 data-[popup-open]:text-primary"
          >
            <Sparkles className={cn("size-3.5", busy && "animate-pulse")} strokeWidth={1.5} />
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-80 gap-0">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          Refine with AI
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{HELP[scope]}</p>

        {/* Chips FILL the box rather than submitting. A suggestion is a starting point to edit,
            and one-click-to-spend on a control that bills a generation is the wrong affordance. */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {REFINE_SUGGESTIONS[scope].map((suggestion) => (
            <Button
              key={suggestion}
              variant="ghost"
              onClick={() => setNote(suggestion)}
              className={cn(
                "h-auto rounded-md border border-dashed border-primary/40 px-2 py-1",
                "text-[0.7rem] font-medium text-primary transition-colors duration-200",
                "hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5",
              )}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        <Textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={PLACEHOLDER[scope]}
          className="w-full resize-none border-border bg-background text-sm"
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[0.6rem] text-muted-foreground">⌘↵ to submit</span>
          {/* Gate on busy and disabled too, not just empty note. The trigger's gate only stops a
              popover from being opened; this one stops a submit from an already-open popover once
              a rewrite is in flight. This matters because the parent shares one in-flight flag
              across every card on the node. */}
          <Button
            onClick={submit}
            disabled={!note.trim() || busy || disabled}
            className="h-auto gap-1 rounded-md px-2.5 py-1 text-xs disabled:opacity-40"
          >
            <Sparkles className="size-3" strokeWidth={1.5} />
            Rewrite
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
