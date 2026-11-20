"use client";

import { TeamReviewBoard } from "@/components/script-review/team/team-review-board";
import type { BoardData } from "@/hooks/queries/visualise";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { VisualiseBoardProvider } from "./visualise-board-context";
import { VisualiseCopilot } from "./visualise-copilot";
import { ScriptFollowProvider } from "./script-follow-context";

/** Piece 5.1 (D512) — Visualise and In review: the script's copilot beside the storyboard, both
 *  under one VisualiseBoardProvider, so what the chat offers is what the board does. */
export function VisualiseCopilotWorkspace({ client, initialState, initialBoard, initialReview }: {
  client: { id: string; name: string; slug: string };
  initialState: GenerateState;
  initialBoard: BoardData;
  initialReview: TeamScriptReview;
}) {
  return (
    <VisualiseBoardProvider clientId={client.id} initial={initialBoard}>
      <ScriptFollowProvider>
      <div className="grid items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <VisualiseCopilot client={client} initialState={initialState} initialReview={initialReview} />
        <div className="min-w-0">
          <TeamReviewBoard clientId={client.id} initial={initialBoard} initialReview={initialReview} />
        </div>
      </div>
      </ScriptFollowProvider>
    </VisualiseBoardProvider>
  );
}
