"use client";

import { TeamReviewBoard } from "@/components/script-review/team/team-review-board";
import type { BoardData } from "@/hooks/queries/visualise";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { GenerateState } from "@/lib/scripts/copilot/schema";
import { VisualiseBoardProvider } from "./visualise-board-context";
import { VisualiseCopilot } from "./visualise-copilot";
import { ScriptFollowProvider } from "./script-follow-context";
import { ScriptBuiltFrom } from "@/components/scripts/script-built-from";

/** Piece 5.1 (D524) — Visualise and In review: the script's copilot beside the storyboard, both
 *  under one VisualiseBoardProvider, so what the chat offers is what the board does. */
export function VisualiseCopilotWorkspace({ client, initialState, initialBoard, initialReview, signals }: {
  client: { id: string; name: string; slug: string };
  initialState: GenerateState;
  initialBoard: BoardData;
  initialReview: TeamScriptReview;
  /** The client's signals by name, for the script's "Built from" line (D531). */
  signals: { id: string; name: string }[];
}) {
  return (
    <VisualiseBoardProvider clientId={client.id} initial={initialBoard}>
      <ScriptFollowProvider>
      <div className="grid items-start gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <VisualiseCopilot client={client} initialState={initialState} initialReview={initialReview} />
        <div className="flex min-w-0 flex-col gap-4">
          {/* Editable at Visualise, read-only In review (D531). */}
          <ScriptBuiltFrom clientId={client.id} initialState={initialState} signals={signals} />
          <TeamReviewBoard clientId={client.id} initial={initialBoard} initialReview={initialReview} />
        </div>
      </div>
      </ScriptFollowProvider>
    </VisualiseBoardProvider>
  );
}
