"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { LockBanner } from "@/components/canvas/lock-banner";
import { useCanvasLock } from "@/hooks/use-canvas-lock";
import { useEditorAutosave } from "@/hooks/use-editor-autosave";
import { useEditorLayout } from "@/hooks/use-editor-layout";
import { useLockHandoffNavigation } from "@/hooks/use-lock-handoff-navigation";
import { useEditorState } from "@/hooks/queries/editor";
import type { EditorState } from "@/lib/editor/types";
import { AutoCaptionsProvider } from "./auto-captions-context";
import { EditorExportButton } from "./editor-export-button";
import { EditorHeader } from "./editor-header";
import { EditorPropsPanel } from "./editor-props-panel";
import { EditorSourcesPanel } from "./editor-sources-panel";
import { EditorPlaybackProvider } from "./editor-playback-context";
import { EditorTimeline } from "./editor-timeline";
import { EditorCaptionLane } from "./editor-caption-lane";
import { EditorTimelineCaptionTools } from "./editor-auto-captions-button";
import { EditorStageWithCaption } from "./editor-stage-with-caption";
import { EditorDivider } from "./editor-divider";
import { EditorDubProvider } from "./editor-dub-context";
import { EditorPanelRail } from "./editor-panel-rail";
import { EditorSessionProvider } from "./editor-session-context";
import { EditorUiProvider } from "./editor-ui-context";
import { EditorViewMenu } from "./editor-view-menu";
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

const SIDE_OPEN = { sources: "232px", inspector: "340px" };
const SIDE_RAIL = "40px";

// D388 — the Rough Cut Editor page. D403: it fills the screen; Sources and Inspector collapse to
// rails, a divider resizes the timeline, and the timeline scrolls on its own. It holds the canvas
// lock (D391): read-only without it.
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
  useEffect(() => setEditable(lock.canEdit), [lock.canEdit, setEditable]);
  // Seeds the shared query with the server render, so the canvas card shows this edit on return.
  useEditorState(canvasId, { initialData: initialState });
  const layout = useEditorLayout();
  const { sources: sourcesOpen, inspector: inspectorOpen, timelineHeight } = layout.layout;

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
  const panels = useMemo(() => ({ toggleSources: layout.toggleSources, toggleInspector: layout.toggleInspector }), [layout.toggleSources, layout.toggleInspector]);
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
      <EditorUiProvider inspectorShown={inspectorOpen} showInspector={layout.toggleInspector} goToCanvas={goToCanvas}>
        <div className="flex h-dvh flex-col overflow-hidden bg-background">
          <EditorHeader
            breadcrumb={breadcrumb}
            title={title}
            status={status}
            readOnly={!lock.canEdit}
            onBack={goToCanvas}
            actions={
              <>
                <EditorViewMenu layout={layout} />
                <EditorExportButton canvasId={canvasId} nodeId={initialState.editorNodeId} title={title} flush={flush} />
              </>
            }
          />
          <div className="relative flex min-h-0 flex-1 flex-col">
            {!lock.canEdit && <LockBanner heldByName={lock.heldByName} canTakeOver={lock.canTakeOver} onTakeOver={lock.takeOver} />}
            <div
              className="grid min-h-0 flex-1 gap-3 px-4 pt-3 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ gridTemplateColumns: `${sourcesOpen ? SIDE_OPEN.sources : SIDE_RAIL} minmax(0,1fr) ${inspectorOpen ? SIDE_OPEN.inspector : SIDE_RAIL}` }}
            >
              {sourcesOpen ? <EditorSourcesPanel onCollapse={layout.toggleSources} /> : <EditorPanelRail label="Sources" side="left" shortcut="Ctrl 1" onExpand={layout.toggleSources} />}
              <EditorStageWithCaption />
              {inspectorOpen ? <EditorPropsPanel onCollapse={layout.toggleInspector} /> : <EditorPanelRail label="Inspector" side="right" shortcut="Ctrl 2" onExpand={layout.toggleInspector} />}
            </div>
            <EditorDivider height={timelineHeight} onResize={layout.setTimelineHeight} />
            <EditorTimeline height={timelineHeight} captionsLane={(scale) => <EditorCaptionLane scale={scale} />} tools={<EditorTimelineCaptionTools />} />
          </div>
        </div>
      </EditorUiProvider>
      </EditorDubProvider>
    </EditorSessionProvider>
  );
}
