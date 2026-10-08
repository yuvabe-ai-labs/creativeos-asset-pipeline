"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import type { PanelView } from "@/lib/scripts/visualise/state";
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
      <DialogContent className="max-w-3xl">
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
              prompt={view.pick?.prompt ?? inputs.prompt}
              builtPrompt={inputs.prompt}
              credits={credits}
              busy={busy || !view.canGenerate}
              onRegenerate={(prompt) => onDraw({ kind: "edited", prompt })}
              onReset={() => onDraw({ kind: "reset" })}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
