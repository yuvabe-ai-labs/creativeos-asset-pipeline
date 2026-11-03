"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { cn } from "@/lib/utils";
import type { PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import type { Shot } from "@/lib/scripts/schema";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import { panelViewMode, promptBoxStart, waitingMessage, type PanelView } from "@/lib/scripts/visualise/state";
import { PanelImage } from "./panel-image";
import { PanelPromptBox } from "./panel-prompt-box";
import { PanelShotDetails } from "./panel-shot-details";
import { PanelTakes } from "./panel-takes";
import { RedrawPopover } from "@/components/shared/redraw-popover";
import { PANEL_REDRAW_SUGGESTIONS } from "@/lib/scripts/visualise/constants";

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
  /** D465 — the shot, whole: the sheet shows only its action and spoken line. */
  shot: Shot;
  /** The names of the people on screen in this shot. */
  castNames: string[];
  /** The first draw, from a shot with no panel yet. */
  onGenerate: () => void;
};

// Spec §6.4 "opens larger on click", §6.6 takes, §6.7 the prompt box. D465: the whole shot too, and
// a shot with no panel yet opens to its shot and Generate only (no takes, no prompt box).
export function PanelDialog({ open, onOpenChange, label, view, inputs, aspect, credits, picking, onPick, onDraw, shot, castNames, onGenerate }: Props) {
  const busy = view.status === "generating";
  const shotOnly = panelViewMode(view) === "shot-only";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* D465 — vertical, and as wide as the panel: the frame sets the width, the words wrap to it. */}
      <DialogContent className="max-h-[90vh] w-fit max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader className="w-0 min-w-full pr-8">
          <div className="flex items-center gap-3">
            <DialogTitle>{label}</DialogTitle>
            {picking && (
              // Beside the title, above the blocking layer, clear of the dialog's text.
              <span role="status" aria-live="polite" className="relative z-20 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
                Setting this version…
              </span>
            )}
          </div>
          <DialogDescription>
            {shotOnly
              ? "No panel yet."
              : view.status === "out_of_date"
              ? "Out of date: drawn before the shot or an avatar changed. It stays until you redraw it."
              : "The picked take is the one the client sees."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div
            className={cn(
              "relative h-[60vh] max-h-[40rem] max-w-[calc(100vw-4rem)] overflow-hidden rounded-lg border border-border",
              !view.pick?.url && !busy && "border-dashed",
            )}
            style={{ aspectRatio: aspect.replace(":", " / ") }}
          >
            {view.pick?.url ? (
              <PanelImage src={view.pick.url} alt={`${label} panel`} />
            ) : (
              busy && <Skeleton className="absolute inset-0 rounded-none" />
            )}
            {/* YUV-422 — a redraw keeps the current take in view, veiled, until the new one fades in. */}
            {busy && (
              <div role="status" className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/60 text-xs font-medium text-foreground backdrop-blur-sm">
                <Loader2 className="size-3.5 animate-spin text-primary" strokeWidth={1.5} />
                {view.pick ? "Drawing a new take…" : "Drawing…"}
              </div>
            )}
          </div>
          <div className="flex w-0 min-w-full flex-col gap-4">
            <PanelShotDetails shot={shot} castNames={castNames} />
            {shotOnly ? (
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <Button size="sm" className="self-start" disabled={!view.canGenerate || credits === null} onClick={onGenerate}>
                  {view.failure ? "Generate again" : "Generate"}
                  <AvatarCreditCost credits={credits} />
                </Button>
                {!view.canGenerate && <span className="text-xs text-muted-foreground">{waitingMessage(view.waitingFor)}</span>}
              </div>
            ) : (
              <>
                <PanelTakes takes={view.takes} pickId={view.pick?.id ?? null} disabled={picking || busy} onPick={onPick} />
                {view.pick && (
                  <RedrawPopover
                    suggestions={PANEL_REDRAW_SUGGESTIONS}
                    credits={credits}
                    canChange={Boolean(view.pick.url)}
                    disabled={busy || !view.canGenerate || credits === null}
                    className="self-start"
                    onChange={(note) => onDraw({ kind: "change", note })}
                    onFresh={(note) => onDraw({ kind: "fresh", note })}
                  />
                )}
                <PanelPromptBox
                  prompt={promptBoxStart(view.pick, inputs)}
                  builtPrompt={inputs.prompt}
                  credits={credits}
                  busy={busy || !view.canGenerate}
                  onRegenerate={(prompt) => onDraw({ kind: "edited", prompt })}
                  onReset={() => onDraw({ kind: "reset" })}
                />
              </>
            )}
          </div>
        </div>
        {picking && (
          // Setting the picked take is a request: block the dialog until it lands. The message
          // sits beside the title, above this layer (the Studio's "Setting as the front…" overlay).
          <div aria-hidden className="absolute inset-0 z-10 rounded-[inherit] bg-background/60" />
        )}
      </DialogContent>
    </Dialog>
  );
}
