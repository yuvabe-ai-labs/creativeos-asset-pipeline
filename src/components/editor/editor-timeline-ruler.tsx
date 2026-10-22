"use client";
// The time ruler above the lanes: click or drag to scrub; right-click to fit or zoom (spec A3, A7).
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { rulerStep } from "@/lib/editor/timeline-view";
import { useEditorView } from "./editor-view-context";

export const RULER_PX = 24;

const label = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${Number.isInteger(sec) ? String(sec).padStart(2, "0") : sec.toFixed(1).padStart(4, "0")}`;
};

export function EditorTimelineRuler({ time, total, width, onScrubStart, onScrub }: {
  time: number;
  total: number;
  width: number;
  onScrubStart(): void;
  onScrub(t: number): void;
}) {
  const { zoom, fit, zoomBy } = useEditorView();
  const { minor, major } = rulerStep(zoom);
  const count = Math.floor(width / zoom / minor) + 1;
  const ticks = Array.from({ length: count }, (_, i) => Math.round(i * minor * 100) / 100);
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(total, Math.max(0, (e.clientX - rect.left) / zoom));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            role="slider"
            aria-label="Scrub the timeline"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={time}
            tabIndex={-1}
            style={{ width, height: RULER_PX }}
            className="sticky top-0 z-20 shrink-0 cursor-col-resize select-none border-b border-border bg-card"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              onScrubStart();
              onScrub(at(e));
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) onScrub(at(e));
            }}
            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          >
            {ticks.map((t) => {
              const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
              return (
                <span key={t} className="absolute bottom-0 border-l border-border" style={{ left: t * zoom, height: isMajor ? 10 : 5 }}>
                  {isMajor && <span className="absolute -top-[13px] left-[3px] whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">{label(t)}</span>}
                </span>
              );
            })}
          </div>
        }
      />
      <ContextMenuContent>
        <ContextMenuItem onClick={fit}>
          Fit the reel <span className="ml-auto pl-6 text-xs text-muted-foreground">Shift Z</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => zoomBy(1.3)}>
          Zoom in <span className="ml-auto pl-6 text-xs text-muted-foreground">Ctrl +</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => zoomBy(1 / 1.3)}>
          Zoom out <span className="ml-auto pl-6 text-xs text-muted-foreground">Ctrl −</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
