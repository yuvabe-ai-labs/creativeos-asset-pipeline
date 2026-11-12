"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LockBanner } from "@/components/canvas/lock-banner";
import { useCanvasLock } from "@/hooks/use-canvas-lock";
import { useEditorAutosave } from "@/hooks/use-editor-autosave";
import { useEditorLayout } from "@/hooks/use-editor-layout";
import { useLockHandoffNavigation } from "@/hooks/use-lock-handoff-navigation";
import { useEditorState } from "@/hooks/queries/editor";
import { clearsSelection } from "@/lib/editor/deselect";
import type { EditorState } from "@/lib/editor/types";
import { AutoCaptionsProvider } from "./auto-captions-context";
import { EditorExportButton } from "./editor-export-button";
import { EditorHeader } from "./editor-header";
import { EditorPlaybackProvider } from "./editor-playback-context";
import { EditorTimeline } from "./editor-timeline";
import { EditorCaptionLane } from "./editor-caption-lane";
import { EditorTimelineCaptionTools } from "./editor-auto-captions-button";
import { EditorDivider } from "./editor-divider";
import { EditorDubProvider } from "./editor-dub-context";
import { EditorSessionProvider } from "./editor-session-context";
import { EditorUiProvider, type EditorSide } from "./editor-ui-context";
import { EditorViewMenu } from "./editor-view-menu";
import { EditorWorkArea } from "./editor-work-area";
import { EditorViewProvider } from "./editor-view-context";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { EditorStoreProvider, useEditorStore } from "./editor-store-provider";

type Props = {
  canvasId: string;
  canvasPath: string;
  breadcrumb: string;
  title: string;
  initialState: EditorState;
};

// D388 — the Rough Cut Editor page. D403: it fills the screen; the side panel (Sources | Inspector)
// collapses to a rail, a divider resizes the timeline, and the timeline scrolls on its own. It holds
// the canvas lock (D391): read-only without it.
export function EditorShell(props: Props) {
  return (
    <EditorStoreProvider doc={props.initialState.doc} sources={props.initialState.sources}>
      <EditorPlaybackProvider>
        <AutoCaptionsProvider canvasId={props.canvasId} nodeId={props.initialState.editorNodeId}>
          <EditorViewProvider>
            <EditorShellBody {...props} />
          </EditorViewProvider>
        </AutoCaptionsProvider>
      </EditorPlaybackProvider>
    </EditorStoreProvider>
  );
}

function EditorShellBody({ canvasId, canvasPath, breadcrumb, title, initialState }: Props) {
  const lock = useCanvasLock(canvasId);
  const setEditable = useEditorStore((s) => s.setEditable);
  const select = useEditorStore((s) => s.select);
  useEffect(() => setEditable(lock.canEdit), [lock.canEdit, setEditable]);
  // Seeds the shared query with the server render, so the canvas card shows this edit on return.
  useEditorState(canvasId, { initialData: initialState });
  const layout = useEditorLayout();
  // The side panel's open state is the layout's `inspector` flag (remembered per browser).
  const { inspector: panelOpen, timelineHeight } = layout.layout;
  const [side, setSide] = useState<EditorSide>("inspector");

  const { status, flush } = useEditorAutosave({
    canvasId,
    nodeId: initialState.editorNodeId,
    sessionId: lock.sessionId,
    initiallyDirty: initialState.changed,
    onLockLost: lock.reportLockLost,
  });
  const navigate = useLockHandoffNavigation(canvasId);
  const goToCanvas = useCallback(
    () => navigate(canvasPath, flush).catch((err: Error) => toast.error(`${err.message} Your latest changes aren't saved yet, so you're still here.`)),
    [navigate, canvasPath, flush],
  );
  // Ctrl 1 / Ctrl 2 show Sources / the Inspector; pressed again on the side already showing, they hide the panel.
  const { toggleInspector } = layout;
  const showSide = useCallback(
    (s: EditorSide) => {
      if (panelOpen && side === s) return toggleInspector();
      setSide(s);
      if (!panelOpen) toggleInspector();
    },
    [panelOpen, side, toggleInspector],
  );
  const panels = useMemo(() => ({ toggleSources: () => showSide("sources"), toggleInspector: () => showSide("inspector") }), [showSide]);
  useEditorShortcuts(panels);
  const session = useMemo(() => ({ canvasId, editorNodeId: initialState.editorNodeId, sessionId: lock.sessionId, flush }), [canvasId, initialState.editorNodeId, lock.sessionId, flush]);

  // What changed since the edit was last open (a version switch, a disconnect…), said once.
  const told = useRef(false);
  useEffect(() => {
    if (told.current) return;
    told.current = true;
    for (const n of initialState.notices) toast(n.message, { id: `editor-notice-${n.sourceNodeId}-${n.kind}` });
  }, [initialState.notices]);

  return (
    <EditorSessionProvider value={session}>
      <EditorDubProvider>
      <EditorUiProvider panelShown={panelOpen} showPanel={toggleInspector} side={side} setSide={setSide} goToCanvas={goToCanvas}>
        <div className="flex h-dvh flex-col overflow-hidden bg-background">
          <EditorHeader
            breadcrumb={breadcrumb}
            title={title}
            status={status}
            readOnly={!lock.canEdit}
            onBack={goToCanvas}
            actions={
              <>
                <EditorViewMenu layout={layout} panelOpen={panelOpen} side={side} onShowSide={showSide} />
                <EditorExportButton canvasId={canvasId} nodeId={initialState.editorNodeId} title={title} flush={flush} />
              </>
            }
          />
          <div
            className="relative flex min-h-0 flex-1 flex-col"
            onPointerDown={(e) => {
              if (clearsSelection(e.currentTarget, e.target, e.button)) select(null);
            }}
          >
            {!lock.canEdit && <LockBanner heldByName={lock.heldByName} canTakeOver={lock.canTakeOver} onTakeOver={lock.takeOver} />}
            <EditorWorkArea layout={layout} />
            <EditorDivider height={timelineHeight} onResize={layout.setTimelineHeight} />
            <EditorTimeline height={timelineHeight} captionsLane={(scale) => <EditorCaptionLane scale={scale} />} tools={<EditorTimelineCaptionTools />} />
          </div>
        </div>
      </EditorUiProvider>
      </EditorDubProvider>
    </EditorSessionProvider>
  );
}
