"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { useSaveEdit } from "@/hooks/queries/editor";
import { ApiError } from "@/services/read-json";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

/**
 * Saves the edit while the editor holds the canvas lock (D390): 800 ms after the last change,
 * never when nothing changed since the last save (rule 4), retrying a failure after 5 s. A 409
 * means another session took the lock. `initiallyDirty`: opening reconciled the saved edit, so it
 * is saved once, as soon as the lock is ours. `flush` saves now — before leaving the page or
 * exporting, since nothing saves on unmount.
 */
export function useEditorAutosave(a: { canvasId: string; nodeId: string; sessionId: string; initiallyDirty: boolean; onLockLost(): void }) {
  const store = useEditorStoreApi();
  const save = useSaveEdit(a.canvasId);
  const [status, setStatus] = useState<SaveStatus>(a.initiallyDirty ? "unsaved" : "saved");
  const lastSaved = useRef(a.initiallyDirty ? "" : JSON.stringify(store.getState().doc));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void>>(Promise.resolve());
  const live = useRef(a);
  const saveRef = useRef(save.mutateAsync);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    live.current = a;
    saveRef.current = save.mutateAsync;
  });

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const run = inFlight.current.then(async () => {
      const { doc, editable } = store.getState();
      if (!editable) return;
      const json = JSON.stringify(doc);
      if (json === lastSaved.current) {
        setStatus("saved");
        return;
      }
      setStatus("saving");
      try {
        await saveRef.current({ nodeId: live.current.nodeId, sessionId: live.current.sessionId, doc });
        lastSaved.current = json;
        setStatus(JSON.stringify(store.getState().doc) === json ? "saved" : "unsaved");
      } catch (err) {
        setStatus("error");
        if (err instanceof ApiError && err.status === 409) {
          live.current.onLockLost();
          return;
        }
        timer.current = setTimeout(() => void flushRef.current(), RETRY_MS);
      }
    });
    inFlight.current = run.catch(() => {});
    return run;
  }, [store]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    };
    if (store.getState().editable && JSON.stringify(store.getState().doc) !== lastSaved.current) schedule();
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.doc !== prev.doc) {
        setStatus("unsaved");
        schedule();
      } else if (s.editable && !prev.editable && JSON.stringify(s.doc) !== lastSaved.current) {
        schedule();
      }
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [store, flush]);

  return { status, flush };
}
