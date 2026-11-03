// src/components/script-review/frozen-board.tsx
"use client";

import type { ReactNode } from "react";
import { ScriptContextCard } from "@/components/scripts/script-context-card";
import { ScriptSheetFrame } from "@/components/scripts/script-sheet-frame";
import { scopeIncludes } from "@/lib/script-review/constants";
import type { VersionContent } from "@/lib/script-review/types";
import type { ScriptStage } from "@/lib/scripts/constants";
import { PartMarker } from "./part-marker";
import { ReviewCast } from "./review-cast";
import { ReviewStoryboard } from "./review-storyboard";

/** Spec 4 §4 (review board, 4.14), laid out as a storyboard sheet (D465): a shared version,
 *  read-only, in one column — the summary card cut to what the client signs off on, the cast, and
 *  the storyboard, whose tiles carry the shots (with their panels on a full share). No locations
 *  or products: they are the team's references. The client's page, and the team's page after
 *  approval (4.17). */
export function FrozenBoard({ version, stage, column }: {
  version: Pick<VersionContent, "scope" | "doc" | "visuals">;
  stage: ScriptStage;
  column: ReactNode;
}) {
  return (
    <ScriptSheetFrame column={column}>
      <ScriptContextCard
        doc={version.doc}
        stage={stage}
        audience="client"
        after={<PartMarker part={{ kind: "context" }} className="self-end" />}
      />
      <ReviewCast doc={version.doc} visuals={version.visuals} showAvatars={scopeIncludes(version.scope, "avatars")} />
      <ReviewStoryboard doc={version.doc} panels={scopeIncludes(version.scope, "panels") ? version.visuals.panels : null} />
    </ScriptSheetFrame>
  );
}
