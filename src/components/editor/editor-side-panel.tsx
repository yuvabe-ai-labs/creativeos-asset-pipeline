"use client";
// The side panel (task-menu design): one panel beside the preview, switched between Sources and
// the Inspector. Replaces the separate Sources and Inspector columns (D403); its header still hides
// it, and its grip moves it to the other side of the screen.
import { useRef } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PanelDock } from "@/lib/editor/layout";
import { EditorInspector } from "./editor-inspector";
import { EditorPanelHeader } from "./editor-panel-rail";
import { EditorSourcesList } from "./editor-sources-panel";
import { useEditorStore } from "./editor-store-provider";
import { useEditorUi, type EditorSide } from "./editor-ui-context";

export type DockDrag = {
  /** The pointer moved while dragging the grip (screen x). */
  move(x: number): void;
  /** The grip was let go: dock where it was shown. */
  end(): void;
  /** Dock straight to a side (keyboard). */
  to(dock: PanelDock): void;
};

export function EditorSidePanel({ dock, onCollapse, dockDrag }: { dock: PanelDock; onCollapse(): void; dockDrag: DockDrag }) {
  const count = useEditorStore((s) => s.sources.length);
  const { side, setSide } = useEditorUi();
  // A press on the grip: where it started, and whether it has moved far enough to be a drag. A drag
  // docks where it is let go; a plain click moves the panel to the other side.
  const press = useRef<{ x: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);

  return (
    <aside aria-label="Side panel" data-keep-selection="" className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-[14px] border border-border bg-card px-4 pb-4 pt-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move the side panel to the ${dock === "right" ? "left" : "right"}`}
          title="Drag to move the panel to the left or right (← →)"
          className="-ml-2 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press.current = { x: e.clientX, moved: false };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (!p) return;
            if (!p.moved && Math.abs(e.clientX - p.x) < 6) return;
            p.moved = true;
            dockDrag.move(e.clientX);
          }}
          onPointerUp={(e) => {
            const p = press.current;
            press.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (p?.moved) {
              skipClick.current = true;
              dockDrag.end();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") dockDrag.to("left");
            else if (e.key === "ArrowRight") dockDrag.to("right");
            else return;
            e.preventDefault();
          }}
          onClick={() => {
            if (skipClick.current) {
              skipClick.current = false;
              return;
            }
            dockDrag.to(dock === "right" ? "left" : "right");
          }}
        >
          <GripVertical className="size-4" strokeWidth={1.5} />
        </Button>
        <EditorPanelHeader label="Side panel" side={dock} shortcut="Ctrl 2" onCollapse={onCollapse} className="mx-0 w-auto min-w-0 flex-1" />
      </div>
      <Tabs value={side} onValueChange={(v) => setSide(v as EditorSide)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sources" className="gap-1.5">
            Sources <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
          </TabsTrigger>
          <TabsTrigger value="inspector">Inspector</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {side === "sources" ? <EditorSourcesList /> : <EditorInspector />}
      </div>
    </aside>
  );
}
