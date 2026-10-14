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

/** Spec 4 §4 (review board): the shared Storyboard — every shot's frozen panel in order, enlarging on
 *  a tap. Shown on a full share only. */
export function ReviewStoryboard({ doc, panels }: { doc: ScriptDoc; panels: Record<string, PanelSnapshot> }) {
  const [open, setOpen] = useState<string | null>(null);
  const timed = timeShots(doc.shots);
  const aspect = panelAspect(doc);
  const current = open ? timed.find((t) => t.shot.id === open) : undefined;
  const currentPanel = current ? panels[current.shot.id] : undefined;

  return (
    <>
      <StoryboardGrid>
        {timed.map((t) => (
          <ReviewPanelTile
            key={t.shot.id}
            shotId={t.shot.id}
            label={`S${t.index + 1}`}
            time={formatRange(t.start, t.end)}
            description={t.shot.visual}
            url={panels[t.shot.id]?.url ?? null}
            aspect={aspect}
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
