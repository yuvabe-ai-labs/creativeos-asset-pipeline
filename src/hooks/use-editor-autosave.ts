"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { useSaveEdit } from "@/hooks/queries/editor";
import { createAutosaver, type SaveStatus } from "@/lib/editor/autosave";
import { markLockHandoff } from "@/lib/canvas/lock-session";

export type { SaveStatus };

type Autosaver = ReturnType<typeof createAutosaver>;

/**
 * The editor page's autosave (D390), the React side of lib/editor/autosave.ts. `flush` saves now
 * and rejects when it couldn't, so Back and Export stop rather than go ahead on an edit the server
 * doesn't have. Closing the tab with changes unsaved asks first. The browser's Back keeps the lock
 * (it marks the handoff) so the last pending save still lands.
 */
export function useEditorAutosave(a: { canvasId: string; nodeId: string; sessionId: string; initiallyDirty: boolean; onLockLost(): void }) {
  const store = useEditorStoreApi();
  const save = useSaveEdit(a.canvasId);
  const [status, setStatus] = useState<SaveStatus>(a.initiallyDirty ? "unsaved" : "saved");
  const live = useRef(a);
  const saveRef = useRef(save.mutateAsync);
  const saverRef = useRef<Autosaver | null>(null);
  useEffect(() => {
    live.current = a;
    saveRef.current = save.mutateAsync;
  });

  useEffect(() => {
    const saver = createAutosaver({
      read: () => ({ doc: store.getState().doc, editable: store.getState().editable }),
      save: (doc) => saveRef.current({ nodeId: live.current.nodeId, sessionId: live.current.sessionId, doc }),
      onStatus: setStatus,
      onLockLost: () => live.current.onLockLost(),
      initiallyDirty: live.current.initiallyDirty,
    });
    saverRef.current = saver;
    if (store.getState().editable && saver.isDirty()) saver.schedule();
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.doc !== prev.doc || (s.editable && !prev.editable && saver.isDirty())) saver.schedule();
    });
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.isDirty()) e.preventDefault();
    };
    const onPopState = () => markLockHandoff(live.current.canvasId);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      saver.dispose();
      saverRef.current = null;
    };
  }, [store]);

  const flush = useCallback(() => saverRef.current?.flush() ?? Promise.resolve(), []);
  return { status, flush };
}
