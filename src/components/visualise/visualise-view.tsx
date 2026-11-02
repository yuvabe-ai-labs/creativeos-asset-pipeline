"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScriptContextCard } from "@/components/scripts/script-context-card";
import { ScriptSheetFrame } from "@/components/scripts/script-sheet-frame";
import { usePickTake, useReopenScript, useVisualiseBoard, type BoardData } from "@/hooks/queries/visualise";
import { usePanelDraws } from "@/hooks/use-panel-draws";
import { useVisualiseModel } from "@/hooks/use-visualise-model";
import { errorMessage } from "@/lib/avatars/utils";
import { formatRange, timeShots } from "@/lib/scripts/timeline";
import { Label } from "@/components/ui/label";
import { AvatarAdvancedSettings } from "@/components/avatars/avatar-advanced-settings";
import { AvatarModelSelect } from "@/components/avatars/avatar-model-select";
import { PANEL_MODEL_ID, PANEL_MODEL_IDS } from "@/lib/scripts/visualise/constants";
import { BoardChips } from "./board-chips";
import { GenerateAllDialog } from "./generate-all-dialog";
import { PanelDialog } from "./panel-dialog";
import { PanelTile } from "./panel-tile";
import { StoryboardGrid } from "./storyboard-grid";
import { VisualiseReadiness } from "./visualise-readiness";
import { ScriptAssetsProvider } from "@/components/scripts/script-assets-context";

// Spec 3 §4, laid out as a storyboard sheet (D465): the readiness line across the top; the summary
// card with the cast, locations and products as chips; then every shot's panel at full width, each
// with its shot written underneath. Spec 4 adds its review through `review` (MP4).

/** Spec 4's layer on the board (merge point MP4): its actions on the readiness line, a comment
 *  marker on each part, and the Comments column. Left out, the view is exactly spec 3's. */
export type VisualiseReview = {
  actions: ReactNode;
  contextMarker: ReactNode;
  shotMarker: (shotId: string) => ReactNode;
  castMarker: (castId: string) => ReactNode;
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
  const openTimed = openShot ? timed.find((t) => t.shot.id === openShot) : undefined;
  const castNames = (ids: string[]) => ids.map((id) => script.doc.cast.find((c) => c.id === id)?.name).filter((n): n is string => Boolean(n));

  const onReopen = async () => {
    try {
      await reopen.mutateAsync();
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e, "Could not reopen the script"));
    }
  };

  return (
    // D446 — products and locations are edited here too: their pictures are visual work.
    <ScriptAssetsProvider clientId={clientId} scriptId={script.id}>
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
      <ScriptSheetFrame column={review?.column}>
        <ScriptContextCard
          doc={script.doc}
          stage={script.stage}
          after={review?.contextMarker}
          side={
            <BoardChips
              clientId={clientId}
              scriptId={script.id}
              doc={script.doc}
              avatars={model.avatars}
              faces={model.avatarFaces}
              castMarker={review?.castMarker}
            />
          }
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
              shot={t.shot}
              doc={script.doc}
              label={`S${t.index + 1}`}
              time={formatRange(t.start, t.end)}
              view={model.views.get(t.shot.id)!}
              aspect={model.aspect}
              credits={model.credits.get(t.shot.id) ?? null}
              onDraw={() => void draws.draw(t.shot.id)}
              onRedraw={(body) => void draws.draw(t.shot.id, body)}
              onOpen={() => setOpenShot(t.shot.id)}
              shotMarker={review?.shotMarker(t.shot.id)}
              panelMarker={review?.panelMarker(t.shot.id)}
            />
          ))}
        </StoryboardGrid>
      </ScriptSheetFrame>
      {openShot && openTimed && model.views.get(openShot) && (
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
          shot={openTimed.shot}
          castNames={castNames(openTimed.shot.onScreen)}
          onGenerate={() => void draws.draw(openShot)}
        />
      )}
    </div>
    </ScriptAssetsProvider>
  );
}
