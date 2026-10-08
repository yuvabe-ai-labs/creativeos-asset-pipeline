"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScriptView } from "@/components/scripts/script-view";
import { useReopenScript, useVisualiseBoard, type BoardData } from "@/hooks/queries/visualise";
import { usePanelDraws } from "@/hooks/use-panel-draws";
import { useVisualiseModel } from "@/hooks/use-visualise-model";
import { errorMessage } from "@/lib/avatars/utils";
import { VisualiseReadiness } from "./visualise-readiness";

// Spec 3 §4, laid out as the Visualise board: the readiness line across the top; the script,
// read-only, in a narrow left pane; the Visuals pane on the right with a cast card per person
// (Task 13) and the Storyboard grid (Task 12). Below `lg` the panes stack, script first.
export function VisualiseView({ clientId, initial }: { clientId: string; initial: BoardData }) {
  const router = useRouter();
  const query = useVisualiseBoard(clientId, initial.script.id, initial);
  const { script, board } = query.data;
  const draws = usePanelDraws(clientId, script.id);
  const model = useVisualiseModel(script, board, draws.drawing, query.dataUpdatedAt);
  const reopen = useReopenScript(clientId, script.id);

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
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ScriptView script={script} avatarFaces={model.avatarFaces} compact cast={null} />
        <section aria-label="Visuals" className="flex min-w-0 flex-col gap-8 rounded-2xl bg-muted/40 p-5">
          {/* Task 13: the cast cards. Task 12: the Storyboard grid. */}
        </section>
      </div>
    </div>
  );
}
