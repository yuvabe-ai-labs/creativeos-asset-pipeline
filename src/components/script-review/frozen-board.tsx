// src/components/script-review/frozen-board.tsx
"use client";

import type { ReactNode } from "react";
import { ScriptBoardFrame } from "@/components/scripts/script-board-frame";
import { ScriptView } from "@/components/scripts/script-view";
import { scopeIncludes } from "@/lib/script-review/constants";
import type { VersionContent } from "@/lib/script-review/types";
import type { ScriptStage } from "@/lib/scripts/constants";
import { PartMarker } from "./part-marker";
import { ReviewCast } from "./review-cast";
import { ReviewStoryboard } from "./review-storyboard";

/** Spec 4 §4 (review board, 4.14): a shared version, read-only, in the Visualise frame — the script
 *  in its compact form with a marker on the context card and each shot, the cast, and on a full
 *  share the Storyboard. The client's page, and the team's page after approval (4.17). */
export function FrozenBoard({ version, stage, column }: {
  version: Pick<VersionContent, "scope" | "doc" | "visuals">;
  stage: ScriptStage;
  column: ReactNode;
}) {
  return (
    <ScriptBoardFrame
      script={
        <ScriptView
          script={{ doc: version.doc, stage }}
          avatarFaces={{}}
          compact
          cast={null}
          slots={{ context: <PartMarker part={{ kind: "context" }} className="self-end" /> }}
          shotAside={(t) => <PartMarker part={{ kind: "shot", shotId: t.shot.id }} />}
        />
      }
      visuals={
        <>
          <ReviewCast doc={version.doc} visuals={version.visuals} showAvatars={scopeIncludes(version.scope, "avatars")} />
          {scopeIncludes(version.scope, "panels") && <ReviewStoryboard doc={version.doc} panels={version.visuals.panels} />}
        </>
      }
      column={column}
    />
  );
}
