"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VoiceChoice } from "@/lib/avatars/studio";

const OPTIONS: { id: VoiceChoice; title: string; line: (name: string) => string; tag: string }[] = [
  {
    id: "auto",
    title: "Choose a voice for me",
    line: (name) => `We create a voice that suits ${name}'s look. You hear it in the next step.`,
    tag: "Quickest",
  },
  {
    id: "library",
    title: "Pick from the library",
    line: () => "Listen and choose from hundreds of ready voices, or this client's own.",
    tag: "Most choice",
  },
  {
    id: "custom",
    title: "Create a custom voice",
    line: (name) => `Upload a recording of someone speaking, and ${name} talks in their voice.`,
    tag: "Needs their permission",
  },
];

type Props = {
  /** The avatar's name, or a stand-in, for the cards' wording. */
  name: string;
  selected: VoiceChoice | null;
  /** The card whose choice is being saved — it shows a spinner where its dot is. */
  saving: VoiceChoice | null;
  disabled: boolean;
  onSelect: (choice: VoiceChoice) => void;
};

// D301 — the Voice step's three ways to give the avatar a voice, as one radio group. Plain words
// only: what each does for the operator, never which engine or provider is behind it.
export function AvatarVoiceOptions({ name, selected, saving, disabled, onSelect }: Props) {
  return (
    <div role="radiogroup" aria-label="How to give the avatar a voice" className="grid gap-2.5 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const checked = selected === option.id;
        const savingThis = saving === option.id;
        return (
          <Button
            key={option.id}
            variant="outline"
            role="radio"
            aria-checked={checked}
            aria-busy={savingThis || undefined}
            // Only the other cards dim while a choice saves; the one being saved stays bright.
            disabled={disabled && !savingThis}
            onClick={() => onSelect(option.id)}
            className={cn(
              "h-auto min-w-0 flex-col items-start justify-start gap-1.5 whitespace-normal p-3.5 text-left",
              "transition-[transform,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px",
              checked && "border-primary bg-primary/5 ring-1 ring-primary ring-inset hover:bg-primary/10",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {savingThis ? (
                <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]",
                    checked ? "border-primary" : "border-muted-foreground/60",
                  )}
                >
                  {checked && <span className="size-2 rounded-full bg-primary" />}
                </span>
              )}
              {option.title}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{option.line(name)}</span>
            <span className="mt-auto rounded-md bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
              {option.tag}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
