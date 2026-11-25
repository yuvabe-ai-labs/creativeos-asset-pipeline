"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useReopenScript } from "@/hooks/queries/visualise";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { OfferCard } from "@/lib/scripts/copilot/schema";
import { sendMissing } from "@/lib/scripts/copilot/visualise-walk";
import { generateAllLabel } from "@/lib/scripts/visualise/state";
import { CopilotSendCard } from "./copilot-send-card";
import { GenerateAllDialog } from "./generate-all-dialog";
import { ReopenDialog } from "./reopen-dialog";
import { useVisualiseBoardActions } from "./visualise-board-context";

/** Piece 5.1 §3.3 — a button the copilot offered in a reply. What it shows is worked out from the
 *  board now, never stored, so an old offer never names a stale count. Each is the page's own
 *  action: Generate all, Move to In review, Reopen. */
export function CopilotOfferCard({ clientId, card, latest, pendingCard }: {
  clientId: string;
  card: OfferCard;
  latest: TeamScriptReview["latest"];
  pendingCard: boolean;
}) {
  const router = useRouter();
  const { data, draws, model } = useVisualiseBoardActions();
  const reopen = useReopenScript(clientId, data.script.id);

  if (card.action === "send") {
    const missing = sendMissing({ doc: data.script.doc, avatars: model.avatars, views: model.views, plan: model.plan, pendingCard });
    return <CopilotSendCard clientId={clientId} script={data.script} latest={latest} missing={missing} />;
  }
  if (card.action === "reopen") {
    const onConfirm = async () => {
      try {
        await reopen.mutateAsync();
        router.refresh();
      } catch (e) {
        toast.error(errorMessage(e, "Could not reopen the script"));
      }
    };
    return <ReopenDialog busy={reopen.isPending} onConfirm={() => void onConfirm()} />;
  }
  return model.plan.shotIds.length === 0 ? (
    <span className="text-sm text-muted-foreground">Every panel is drawn.</span>
  ) : (
    <GenerateAllDialog size="sm" label={generateAllLabel(model.plan)} plan={model.plan} busy={draws.drawingAll} onConfirm={() => void draws.drawAll(model.plan.shotIds)} />
  );
}
