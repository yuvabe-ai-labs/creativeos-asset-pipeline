"use client";

import { useId, useState, type ReactNode } from "react";
import { RefreshCw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";

/**
 * D449 — one Redraw for every drawn picture a script holds (storyboard panels, location plates).
 *
 * Redrawing used to be one button that threw the picture away and rolled again, which is the
 * wrong default for "nearly right": the operator lost the parts that worked. So Redraw asks first,
 * with two ways out:
 *  - Change this picture — keeps it and applies the note (the picture is the reference). Needs a
 *    note: a change with nothing to change is just a slower redraw.
 *  - Draw a new one — starts fresh from the script; the note, if any, rides along.
 * Chips fill the note rather than submitting: every action here is billed.
 */
export function RedrawPopover({ label = "Redraw", suggestions, credits, canChange, disabled, onChange, onFresh, trigger, className }: {
  label?: string;
  suggestions: string[];
  credits: number | null;
  /** False when there is no picture yet to change. */
  canChange: boolean;
  disabled?: boolean;
  onChange: (note: string) => void;
  onFresh: (note: string) => void;
  /** Replaces the default trigger button's content. */
  trigger?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const id = useId();
  const trimmed = note.trim();

  const finish = (act: (n: string) => void) => {
    setOpen(false);
    setNote("");
    act(trimmed);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setNote(""); }}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} className={cn("data-[popup-open]:border-primary/40", className)}>
            {trigger ?? (<><RefreshCw className="size-3.5" strokeWidth={1.5} />{label}</>)}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-80 gap-2">
        <Label htmlFor={id} className="text-xs font-medium text-foreground">What should change?</Label>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Button
              key={s}
              variant="ghost"
              onClick={() => setNote(s)}
              className="h-auto rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.7rem] font-medium text-primary hover:bg-primary/5"
            >
              {s}
            </Button>
          ))}
        </div>
        <Textarea
          id={id}
          value={note}
          maxLength={500}
          rows={3}
          placeholder={canChange ? "For example: move the cup to the left" : "Optional: anything to do differently"}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && trimmed && canChange) {
              e.preventDefault();
              finish(onChange);
            }
          }}
          className="text-sm"
        />
        <div className="flex flex-col gap-1.5">
          {canChange && (
            <Button size="sm" disabled={!trimmed} onClick={() => finish(onChange)}>
              <Wand2 className="size-3.5" strokeWidth={1.5} />
              Change this picture
              <AvatarCreditCost credits={credits} />
            </Button>
          )}
          <Button size="sm" variant={canChange ? "outline" : "default"} onClick={() => finish(onFresh)}>
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
            Draw a new one
            <AvatarCreditCost credits={credits} />
          </Button>
        </div>
        <p className="text-[0.65rem] text-muted-foreground">
          {canChange ? "Change keeps this picture and fixes what you describe. A new one starts again from the script." : "Starts again from the script."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
