// src/components/script-review/review-storyboard.tsx
"use client";

import { StoryboardGrid } from "@/components/visualise/storyboard-grid";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { formatRange, timeShots } from "@/lib/scripts/timeline";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import { ReviewPanelTile } from "./review-panel-tile";

/** Spec 4 §4 (review board): the shared Storyboard — every shot in order with its frozen panel.
 *  D465: always shown, since the shots live here; `panels` is null when the share has none, and
 *  the tiles are then the shots alone, without empty frames. The sheet does not zoom. */
export function ReviewStoryboard({ doc, panels }: { doc: ScriptDoc; panels: Record<string, PanelSnapshot> | null }) {
  const timed = timeShots(doc.shots);
  const aspect = panelAspect(doc);

  return (
    <StoryboardGrid>
      {timed.map((t) => (
        <ReviewPanelTile
          key={t.shot.id}
          shot={t.shot}
          label={`S${t.index + 1}`}
          time={formatRange(t.start, t.end)}
          url={panels?.[t.shot.id]?.url ?? null}
          aspect={aspect}
          showFrame={panels !== null}
        />
      ))}
    </StoryboardGrid>
  );
}
