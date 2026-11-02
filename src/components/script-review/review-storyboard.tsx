// src/components/script-review/review-storyboard.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StoryboardGrid } from "@/components/visualise/storyboard-grid";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { formatRange, timeShots } from "@/lib/scripts/timeline";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import { ReviewPanelTile } from "./review-panel-tile";

/** Spec 4 §4 (review board): the shared Storyboard — every shot in order with its frozen panel,
 *  enlarging on a tap. D465: always shown, since the shots live here; `panels` is null when the
 *  share has none, and the tiles are then the shots alone, without empty frames. */
export function ReviewStoryboard({ doc, panels }: { doc: ScriptDoc; panels: Record<string, PanelSnapshot> | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const timed = timeShots(doc.shots);
  const aspect = panelAspect(doc);
  const current = open ? timed.find((t) => t.shot.id === open) : undefined;
  const currentPanel = current ? panels?.[current.shot.id] : undefined;

  return (
    <>
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
            onOpen={() => setOpen(t.shot.id)}
          />
        ))}
      </StoryboardGrid>
      {current && currentPanel && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>S{current.index + 1} · panel</DialogTitle>
              <DialogDescription>{current.shot.visual}</DialogDescription>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentPanel.url} alt={`Storyboard panel for S${current.index + 1}`} className="w-full rounded-lg border border-border object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
