"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { LockBanner } from "@/components/canvas/lock-banner";
import { useCanvasLock } from "@/hooks/use-canvas-lock";
import { useEditorAutosave } from "@/hooks/use-editor-autosave";
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
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { EditorStoreProvider, useEditorStore } from "./editor-store-provider";

type Props = {
  canvasId: string;
  canvasPath: string;
  breadcrumb: string;
  title: string;
  initialState: EditorState;
};

// D388 — the Rough Cut Editor page, laid out from the mockups
// (https://claude.ai/artifact/SseUKVaihCKMsHZscoQDCR): header; Sources | Stage | Properties; the
// timeline full width below. It holds the canvas lock (D391): read-only without it.
export function EditorShell(props: Props) {
  return (
    <EditorStoreProvider doc={props.initialState.doc} sources={props.initialState.sources}>
      <EditorPlaybackProvider>
        <AutoCaptionsProvider canvasId={props.canvasId} nodeId={props.initialState.editorNodeId}>
          <EditorShellBody {...props} />
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

  const { status, flush } = useEditorAutosave({
    canvasId,
    nodeId: initialState.editorNodeId,
    sessionId: lock.sessionId,
    initiallyDirty: initialState.changed,
    onLockLost: lock.reportLockLost,
  });
  const navigate = useLockHandoffNavigation(canvasId);
  useEditorShortcuts();

  // What changed since the edit was last open (a version switch, a disconnect…), said once.
  const told = useRef(false);
  useEffect(() => {
    if (told.current) return;
    told.current = true;
    for (const n of initialState.notices) toast(n.message, { id: `editor-notice-${n.sourceNodeId}-${n.kind}` });
  }, [initialState.notices]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <EditorHeader
        breadcrumb={breadcrumb}
        title={title}
        status={status}
        readOnly={!lock.canEdit}
        onBack={() =>
          navigate(canvasPath, flush).catch((err: Error) =>
            toast.error(`${err.message} Your latest changes aren't saved yet, so you're still here.`),
          )
        }
        actions={<EditorExportButton canvasId={canvasId} nodeId={initialState.editorNodeId} title={title} flush={flush} />}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!lock.canEdit && <LockBanner heldByName={lock.heldByName} canTakeOver={lock.canTakeOver} onTakeOver={lock.takeOver} />}
        <div className="grid h-[min(520px,58dvh)] flex-none grid-cols-[248px_minmax(0,1fr)_340px] gap-4 px-6 pt-4">
          <EditorSourcesPanel />
          <EditorStageWithCaption />
          <EditorPropsPanel />
        </div>
        <EditorTimeline captionsLane={(scale) => <EditorCaptionLane scale={scale} />} tools={<EditorTimelineCaptionTools />} />
      </div>
    </div>
  );
}
