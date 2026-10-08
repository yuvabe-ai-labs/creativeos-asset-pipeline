"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScriptBoardFrame } from "@/components/scripts/script-board-frame";
import { ScriptView } from "@/components/scripts/script-view";
import type { AvatarViewId } from "@/lib/avatars/schema";
import { usePickTake, useReopenScript, useVisualiseBoard, type BoardData } from "@/hooks/queries/visualise";
import { usePanelDraws } from "@/hooks/use-panel-draws";
import { useVisualiseModel } from "@/hooks/use-visualise-model";
import { errorMessage } from "@/lib/avatars/utils";
import { formatRange, timeShots } from "@/lib/scripts/timeline";
import { Label } from "@/components/ui/label";
import { AvatarAdvancedSettings } from "@/components/avatars/avatar-advanced-settings";
import { AvatarModelSelect } from "@/components/avatars/avatar-model-select";
import { PANEL_MODEL_ID, PANEL_MODEL_IDS } from "@/lib/scripts/visualise/constants";
import { CastSlots } from "./cast-slots";
import { GenerateAllDialog } from "./generate-all-dialog";
import { PanelDialog } from "./panel-dialog";
import { PanelShotStatus } from "./panel-shot-status";
import { PanelTile } from "./panel-tile";
import { StoryboardGrid } from "./storyboard-grid";
import { VisualiseReadiness } from "./visualise-readiness";

// Spec 3 §4, laid out as the Visualise board: the readiness line across the top; the script,
// read-only, in a narrow left pane; the Visuals pane on the right with a cast card per person
// (Task 13) and the Storyboard grid (Task 12). Below `lg` the panes stack, script first. Spec 4 adds
// its review through `review` (MP4).

/** Spec 4's layer on the board (merge point MP4): its actions on the readiness line, a comment
 *  marker on each part, and the Comments column. Left out, the view is exactly spec 3's. */
export type VisualiseReview = {
  actions: ReactNode;
  contextMarker: ReactNode;
  shotMarker: (shotId: string) => ReactNode;
  castMarker: (castId: string) => ReactNode;
  viewMarker: (castId: string, view: AvatarViewId) => ReactNode;
  panelMarker: (shotId: string) => ReactNode;
  /** Absent until something has been shared, so the board keeps its two panes. */
  column?: ReactNode;
};

export function VisualiseView({ clientId, initial, review }: { clientId: string; initial: BoardData; review?: VisualiseReview }) {
  const router = useRouter();
  const query = useVisualiseBoard(clientId, initial.script.id, initial);
  const { script, board } = query.data;
  const [panelModelId, setPanelModelId] = useState(PANEL_MODEL_ID);
  const draws = usePanelDraws(clientId, script.id, panelModelId);
  const model = useVisualiseModel(script, board, draws.drawing, query.dataUpdatedAt, panelModelId);
  const reopen = useReopenScript(clientId, script.id);
  const pick = usePickTake(clientId, script.id);
  const [openShot, setOpenShot] = useState<string | null>(null);
  const timed = useMemo(() => timeShots(script.doc.shots), [script.doc.shots]);
  const shotLabel = (shotId: string) => `S${script.doc.shots.findIndex((s) => s.id === shotId) + 1}`;

  const onReopen = async () => {
    try {
      await reopen.mutateAsync();
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e, "Could not reopen the script"));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <VisualiseReadiness
        stage={script.stage}
        readiness={model.readiness}
        plan={model.plan}
        kitsFound={board.kits.length > 0}
        drawingAll={draws.drawingAll}
        reopening={reopen.isPending}
        onGenerateAll={() => void draws.drawAll(model.plan.shotIds)}
        onReopen={() => void onReopen()}
        extra={review?.actions}
      />
      <ScriptBoardFrame
        script={
          <ScriptView
            script={script}
            avatarFaces={model.avatarFaces}
            compact
            cast={null}
            slots={review ? { context: review.contextMarker } : undefined}
            shotState={(t) => {
              const v = model.views.get(t.shot.id)!;
              return { drawing: v.status === "generating", onOpen: v.pick ? () => setOpenShot(t.shot.id) : undefined };
            }}
            shotAside={(t) => (
              <span className="flex flex-col items-end gap-1">
                <PanelShotStatus
                  view={model.views.get(t.shot.id)!}
                  credits={model.credits.get(t.shot.id) ?? null}
                  onDraw={() => void draws.draw(t.shot.id)}
                />
                {review?.shotMarker(t.shot.id)}
              </span>
            )}
          />
        }
        visuals={
          <>
            <CastSlots
              clientId={clientId}
              scriptId={script.id}
              doc={script.doc}
              avatars={model.avatars}
              castMarker={review?.castMarker}
              viewMarker={review?.viewMarker}
            />
            <StoryboardGrid
              settings={
                <AvatarAdvancedSettings className="max-w-sm">
                  <Label htmlFor="panel-model" className="text-xs text-muted-foreground">Image model for panels</Label>
                  <AvatarModelSelect id="panel-model" value={panelModelId} onChange={setPanelModelId} modelIds={PANEL_MODEL_IDS} />
                </AvatarAdvancedSettings>
              }
              action={
                <GenerateAllDialog
                  variant="outline"
                  plan={model.plan}
                  busy={draws.drawingAll}
                  onConfirm={() => void draws.drawAll(model.plan.shotIds)}
                />
              }
            >
              {timed.map((t) => (
                <PanelTile
                  key={t.shot.id}
                  label={`S${t.index + 1}`}
                  time={formatRange(t.start, t.end)}
                  description={t.shot.visual}
                  view={model.views.get(t.shot.id)!}
                  aspect={model.aspect}
                  credits={model.credits.get(t.shot.id) ?? null}
                  onDraw={() => void draws.draw(t.shot.id)}
                  onOpen={() => setOpenShot(t.shot.id)}
                  marker={review?.panelMarker(t.shot.id)}
                />
              ))}
            </StoryboardGrid>
          </>
        }
        column={review?.column}
      />
      {openShot && model.views.get(openShot) && (
        <PanelDialog
          open
          onOpenChange={(o) => { if (!o) setOpenShot(null); }}
          label={shotLabel(openShot)}
          view={model.views.get(openShot)!}
          inputs={model.inputs.get(openShot)!}
          aspect={model.aspect}
          credits={model.credits.get(openShot) ?? null}
          picking={pick.isPending}
          onPick={(takeId) => pick.mutate(
            { shotId: openShot, takeId },
            { onError: (e) => toast.error(errorMessage(e, "Could not set this version")) },
          )}
          onDraw={(body) => void draws.draw(openShot, body)}
        />
      )}
    </div>
  );
}
