"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import { promptBoxStart, type PanelView } from "@/lib/scripts/visualise/state";
import { PanelPromptBox } from "./panel-prompt-box";
import { PanelTakes } from "./panel-takes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  view: PanelView;
  inputs: PanelInputs;
  aspect: string;
  credits: number | null;
  picking: boolean;
  onPick: (takeId: string) => void;
  onDraw: (body: DrawBody) => void;
};

// Spec §6.4 "opens larger on click", §6.6 takes, §6.7 the prompt box.
export function PanelDialog({ open, onOpenChange, label, view, inputs, aspect, credits, picking, onPick, onDraw }: Props) {
  const busy = view.status === "generating";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {view.status === "out_of_date"
              ? "Out of date: drawn before the shot or an avatar changed. It stays until you redraw it."
              : "The picked take is the one the client sees."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {view.pick?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.pick.url} alt={`${label} panel`} className="w-full rounded-lg border border-border object-cover" style={{ aspectRatio: aspect.replace(":", " / ") }} />
          ) : (
            <div className="w-full rounded-lg border border-dashed border-border" style={{ aspectRatio: aspect.replace(":", " / ") }} />
          )}
          <div className="flex min-w-0 flex-col gap-4">
            <PanelTakes takes={view.takes} pickId={view.pick?.id ?? null} disabled={picking || busy} onPick={onPick} />
            <PanelPromptBox
              prompt={promptBoxStart(view.pick, inputs)}
              builtPrompt={inputs.prompt}
              credits={credits}
              busy={busy || !view.canGenerate}
              onRegenerate={(prompt) => onDraw({ kind: "edited", prompt })}
              onReset={() => onDraw({ kind: "reset" })}
            />
          </div>
        </div>
        {picking && (
          // Setting the picked take is a request: block the dialog and say so until it lands. The
          // same overlay the Studio shows while a face is set ("Setting as the front…").
          // The message sits at the bottom on its own surface, clear of the dialog's text beneath.
          <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-end justify-center rounded-[inherit] bg-background/60 pb-5">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-card">
              <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
              Setting this version…
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
