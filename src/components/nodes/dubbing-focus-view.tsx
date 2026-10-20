"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useGenerationLock } from "@/hooks/use-generation-lock";
import { GENERATION_LOCK_COPY } from "@/lib/editor/generation-lock";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { useStartDub, useStartLipSync, startErrorMessage } from "@/hooks/queries/node-generation";
import { useDubbingVersions } from "@/hooks/use-dubbing-versions";
import { useDubbingSource } from "@/hooks/use-dubbing-source";
import { normalizeTitle } from "@/lib/nodes/title";
import { nodeLabel } from "@/lib/nodes/describe-node";
import { DEFAULT_DUB_LANGUAGE, DEFAULT_DUB_PACE, DEFAULT_DUB_STYLE, PRESENTER_VOICE, dubLanguageLabel, isDubLanguage, isDubPace, isDubStyle, isDubVoice, type DubLanguage, type DubPace, type DubStyle, type DubVoiceChoice } from "@/lib/dubbing/types";
import { ConnectedDetailView } from "./connected-inputs-card";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { DubbingFocusRail, type DubbingRailSelection } from "./dubbing-focus-rail";
import { DubbingControls } from "./dubbing-controls";
import { DubbingPlayer } from "./dubbing-player";
import { DubbingVersionHistory } from "./dubbing-version-history";
import { DubbingUsagePopover } from "./dubbing-usage-popover";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  language: DubLanguage | undefined;
  style: DubStyle | undefined;
  voice: DubVoiceChoice | undefined;
  pace: DubPace | undefined;
  onPatch: (patch: Record<string, unknown>) => void;
};

// D374 — Composite's shell: rail | controls | video. Everything it reads (the wired video, the
// versions) is held back until the view is open, so a closed card costs nothing.
export function DubbingFocusView({ open, onOpenChange, nodeId, title, language, style, voice, pace, onPatch }: Props) {
  const editable = useCanvasEditable();
  const generationLock = useGenerationLock(nodeId);
  const [selected, setSelected] = useState<DubbingRailSelection>("dubbing");
  const source = useDubbingSource(nodeId, open);
  const sourceName = source ? nodeLabel({ id: source.id, type: source.type, data: source.data }).name : "";

  const { versions, activeVersionId, active, activeSeconds, loading, restore, restoring } = useDubbingVersions(nodeId, open, onPatch);
  const status = useGenerationStatus(nodeId);
  const startDub = useStartDub(nodeId);
  const startLipSync = useStartLipSync(nodeId);
  const lang = isDubLanguage(language) ? language : DEFAULT_DUB_LANGUAGE;
  const dubStyle = isDubStyle(style) ? style : DEFAULT_DUB_STYLE;
  const dubVoice: DubVoiceChoice = isDubVoice(voice) ? voice : PRESENTER_VOICE;
  const dubPace = isDubPace(pace) ? pace : DEFAULT_DUB_PACE;
  // Running from the click, not from the start request's reply: while the request is in flight
  // (a second or two), the mutation's `isPending` already shows "Dubbing…" and blocks a second click.
  const running =
    status.runningKind === "dub" || status.runningKind === "lipsync"
      ? status.runningKind
      : startDub.isPending
        ? "dub"
        : startLipSync.isPending
          ? "lipsync"
          : null;
  const activeDub = active?.dubbing ?? null;

  const onDub = () =>
    startDub.mutate({ language: lang, style: dubStyle, voice: dubVoice, pace: dubPace }, { onError: (e) => toast.error(startErrorMessage(e, "Couldn't start the dub.")) });
  const onLipSync = () => {
    if (!activeVersionId) return;
    startLipSync.mutate({ versionId: activeVersionId }, { onError: (e) => toast.error(startErrorMessage(e, "Couldn't start lip sync.")) });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]">
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" strokeWidth={1.5} /> Back to canvas
            </Button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                <EditableField value={title} onCommit={(t) => onPatch({ title: normalizeTitle(t) })} placeholder="Dubbing" className="font-display text-3xl font-semibold tracking-tight" />
              </SheetTitle>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  {/* As in Video Gen: the popover needs the versions, so a skeleton holds its place
                      while they load. Once loaded it always shows, "0 credits used" before a dub. */}
                  {loading ? (
                    <Skeleton className="h-8 w-20 rounded-md" />
                  ) : (
                    <DubbingUsagePopover versions={versions} nodeId={nodeId} upstreamNodeIds={source ? [source.id] : undefined} />
                  )}
                </div>
                {status.lastError && !running && (
                  <div className="mt-1">
                    <GenerationErrorBadge error={status.lastError} />
                  </div>
                )}
              </div>
            </header>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          <DubbingFocusRail
            nodeId={nodeId}
            source={source ? { id: source.id, label: sourceName || "Video" } : null}
            selected={selected}
            onSelect={setSelected}
            versionCount={versions.length}
          />
          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 w-[44%] shrink-0 overflow-y-auto border-x border-primary/25 bg-card panel-raised">
              {source && selected === source.id ? (
                <ConnectedDetailView node={{ nodeId: source.id, type: "video-gen", label: sourceName || "Video", text: "", fileUrl: source.url ?? undefined }} />
              ) : selected === "history" ? (
                <div className="px-6 py-5">
                  {loading ? <Skeleton className="h-24 w-full rounded-xl" /> : versions.length ? (
                    <DubbingVersionHistory versions={versions} activeVersionId={activeVersionId} onRestore={(id) => void restore(id)} restoring={restoring} />
                  ) : <p className="text-sm text-muted-foreground">No dubs yet. Every dub shows up here.</p>}
                </div>
              ) : (
                <DubbingControls
                  nodeId={nodeId}
                  locked={generationLock ? GENERATION_LOCK_COPY[generationLock].short : null}
                  language={lang}
                  onLanguageChange={(l) => onPatch({ language: l })}
                  style={dubStyle}
                  onStyleChange={(s) => onPatch({ style: s })}
                  voice={dubVoice}
                  onVoiceChange={(v) => onPatch({ voice: v })}
                  pace={dubPace}
                  onPaceChange={(p) => onPatch({ pace: p })}
                  sourceSeconds={source?.seconds ?? 0}
                  sourceLoading={source?.secondsLoading ?? false}
                  activeDubSeconds={activeSeconds}
                  hasSource={Boolean(source?.url)}
                  activeDub={activeDub}
                  running={running}
                  editable={editable}
                  onDub={onDub}
                  onLipSync={onLipSync}
                />
              )}
            </div>
            <DubbingPlayer
              key={`${activeDub?.dubbed ?? ""}|${activeDub?.lipSynced ?? ""}`}
              dub={activeDub}
              sourceUrl={source?.url ?? null}
              workingLabel={running === "dub" ? `Dubbing into ${dubLanguageLabel(lang)}…` : running === "lipsync" ? "Lip-syncing…" : null}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
