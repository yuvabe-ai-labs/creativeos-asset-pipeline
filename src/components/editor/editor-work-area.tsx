"use client";
// The row above the timeline: the preview and the side panel (task-menu design), 3 : 2 to start.
// The user drags the handle between them to change the split, and the panel's grip to dock it left
// or right; both are remembered (use-editor-layout). Hidden, the panel is a thin rail on its side.
import { useMemo, useRef, useState } from "react";
import type { EditorLayoutApi } from "@/hooks/use-editor-layout";
import type { PanelDock } from "@/lib/editor/layout";
import { cn } from "@/lib/utils";
import { EditorPanelRail } from "./editor-panel-rail";
import { EditorPanelResizer } from "./editor-panel-resizer";
import { EditorSidePanel, type DockDrag } from "./editor-side-panel";
import { EditorStageWithCaption } from "./editor-stage-with-caption";

const PANEL_MIN = "300px";
const RESIZER = "12px";
const RAIL = "40px";

function columns(open: boolean, dock: PanelDock, share: number): string {
  if (!open) return dock === "right" ? `minmax(0,1fr) ${RAIL}` : `${RAIL} minmax(0,1fr)`;
  const stage = `minmax(0,${(1 - share).toFixed(3)}fr)`;
  const panel = `minmax(${PANEL_MIN},${share.toFixed(3)}fr)`;
  return dock === "right" ? `${stage} ${RESIZER} ${panel}` : `${panel} ${RESIZER} ${stage}`;
}

export function EditorWorkArea({ layout }: { layout: EditorLayoutApi }) {
  const { inspector: open, panelShare, panelDock } = layout.layout;
  const { toggleInspector, setPanelDock, setPanelShare } = layout;
  const rowRef = useRef<HTMLDivElement>(null);
  // While the panel's grip is dragged: the side it would dock on if let go now.
  const [dockTarget, setDockTarget] = useState<PanelDock | null>(null);
  const targetRef = useRef<PanelDock | null>(null);
  const dockDrag = useMemo<DockDrag>(
    () => ({
      move: (x) => {
        const r = rowRef.current?.getBoundingClientRect();
        targetRef.current = r && x < r.left + r.width / 2 ? "left" : "right";
        setDockTarget(targetRef.current);
      },
      end: () => {
        if (targetRef.current) setPanelDock(targetRef.current);
        targetRef.current = null;
        setDockTarget(null);
      },
      to: setPanelDock,
    }),
    [setPanelDock],
  );

  const panel = open ? (
    <EditorSidePanel key="panel" dock={panelDock} onCollapse={toggleInspector} dockDrag={dockDrag} />
  ) : (
    <EditorPanelRail key="panel" label="Side panel" side={panelDock} shortcut="Ctrl 2" onExpand={toggleInspector} />
  );
  const stage = <EditorStageWithCaption key="stage" />;
  const resizer = open && <EditorPanelResizer key="resizer" rowRef={rowRef} dock={panelDock} share={panelShare} onShare={setPanelShare} />;

  return (
    <div ref={rowRef} className={cn("relative grid min-h-0 flex-1 px-4 pt-3", !open && "gap-3")} style={{ gridTemplateColumns: columns(open, panelDock, panelShare) }}>
      {panelDock === "right" ? [stage, resizer, panel] : [panel, resizer, stage]}
      {dockTarget && (
        // Where the panel lands if let go now: that half of the row, outlined.
        <div aria-hidden className="pointer-events-none absolute inset-x-4 bottom-0 top-3 z-30 grid grid-cols-2 gap-3">
          {(["left", "right"] as const).map((d) => (
            <div
              key={d}
              className={cn("rounded-[14px] border-2 border-dashed transition-colors duration-200", d === dockTarget ? "border-primary/50 bg-primary/5" : "border-transparent")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
