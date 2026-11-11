"use client";

import { useMemo, useState } from "react";
import { Loader2, SquarePen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { ActiveOnlyNotice } from "@/components/nodes/active-only-notice";
import { VersionViewingBar } from "@/components/nodes/version-viewing-bar";
import { RedrawPopover } from "@/components/shared/redraw-popover";
import { useVersionViewing } from "@/hooks/use-version-viewing";
import type { PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import type { Shot } from "@/lib/scripts/schema";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import { PANEL_REDRAW_SUGGESTIONS } from "@/lib/scripts/visualise/constants";
import { panelViewMode, promptBoxStart, waitingMessage, type PanelView } from "@/lib/scripts/visualise/state";
import { PanelDialogFrame } from "./panel-dialog-frame";
import { PanelPromptBox } from "./panel-prompt-box";
import { PanelShotDetails } from "./panel-shot-details";
import { PanelVersionHistory } from "./panel-version-history";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "S1" */
  label: string;
  /** "0.0–3.0s", the shot's place in the reel. */
  time: string;
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

// D489 — the panel view as a focus view: the frame at full height on the left; on the right the
// shot, the takes in the shared version list (a click views one, the viewing bar sets it, D383),
// and Redraw with the prompt beside it. A shot with no panel yet shows its shot and Generate (D465).
export function PanelDialog({ open, onOpenChange, label, time, view, inputs, aspect, credits, picking, onPick, onDraw, shot, castNames, onGenerate }: Props) {
  const busy = view.status === "generating";
  const shotOnly = panelViewMode(view) === "shot-only";
  const pickId = view.pick?.id ?? null;
  // Newest first, as every version list; a take still drawing shows on the frame, not as a row.
  const versions = useMemo(() => view.takes.filter((t) => t.status !== "running").reverse(), [view.takes]);
  const viewing = useVersionViewing(versions, pickId, open);
  const [promptOpen, setPromptOpen] = useState(false);
  const versionLabel = (id: string | null) => {
    const i = id ? versions.findIndex((t) => t.id === id) : -1;
    return i < 0 ? null : `v${versions.length - i}`;
  };
  const viewed = viewing.isViewingOther ? viewing.viewed : null;
  const viewedLabel = viewed ? versionLabel(viewed.id) ?? "this take" : "";
  const canAct = !busy && view.canGenerate && credits !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-4 p-5 sm:max-w-6xl md:h-[min(92vh,56rem)]">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <DialogTitle className="font-display text-lg">{label}</DialogTitle>
            {shot.beat && <span className="text-eyebrow">{shot.beat}</span>}
            <span className="text-sm tabular-nums text-muted-foreground">{time}</span>
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
                : "The version in use is the one the client sees."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto md:grid-cols-[auto_minmax(20rem,1fr)] md:overflow-hidden">
          <PanelDialogFrame
            url={(viewed ? viewed.url : view.pick?.url) ?? null}
            alt={`${label} panel${viewed ? `, ${viewedLabel}` : ""}`}
            aspect={aspect}
            busy={busy}
            hasPick={Boolean(view.pick)}
          />
          <div className="flex min-h-0 flex-col gap-5 md:overflow-y-auto md:pr-1">
            <PanelShotDetails shot={shot} castNames={castNames} />
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              {shotOnly ? (
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" className="self-start" disabled={!view.canGenerate || credits === null} onClick={onGenerate}>
                    {view.failure ? "Generate again" : "Generate"}
                    <AvatarCreditCost credits={credits} />
                  </Button>
                  {!view.canGenerate && <span className="text-xs text-muted-foreground">{waitingMessage(view.waitingFor)}</span>}
                </div>
              ) : (
                <>
                  {viewed && (
                    <VersionViewingBar
                      viewedLabel={viewedLabel}
                      viewedCreatedAt={viewed.createdAt}
                      activeLabel={versionLabel(pickId)}
                      subject="panel"
                      canRestore={!viewed.error && Boolean(viewed.url) && !busy}
                      restoring={picking}
                      onBack={viewing.backToActive}
                      onRestore={() => onPick(viewed.id)}
                    />
                  )}
                  <PanelVersionHistory versions={versions} pickId={pickId} viewedId={viewed?.id ?? null} onView={viewing.view} />
                  {viewed ? (
                    <ActiveOnlyNotice label={viewedLabel} />
                  ) : (
                    view.pick && (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <RedrawPopover
                            suggestions={PANEL_REDRAW_SUGGESTIONS}
                            credits={credits}
                            canChange={Boolean(view.pick.url)}
                            disabled={!canAct}
                            onChange={(note) => onDraw({ kind: "change", note })}
                            onFresh={(note) => onDraw({ kind: "fresh", note })}
                          />
                          <Button variant="ghost" size="sm" aria-expanded={promptOpen} onClick={() => setPromptOpen((o) => !o)}>
                            <SquarePen strokeWidth={1.5} />
                            {promptOpen ? "Hide the prompt" : "Edit the prompt"}
                          </Button>
                        </div>
                        {promptOpen && (
                          <PanelPromptBox
                            prompt={promptBoxStart(view.pick, inputs)}
                            builtPrompt={inputs.prompt}
                            credits={credits}
                            busy={busy || !view.canGenerate}
                            onRegenerate={(prompt) => onDraw({ kind: "edited", prompt })}
                            onReset={() => onDraw({ kind: "reset" })}
                          />
                        )}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {picking && (
          // Setting the version in use is a request: block the dialog until it lands. The message
          // sits beside the title, above this layer (the Studio's "Setting as the front…" overlay).
          <div aria-hidden className="absolute inset-0 z-10 rounded-[inherit] bg-background/60" />
        )}
      </DialogContent>
    </Dialog>
  );
}
