"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditorSession } from "@/components/editor/editor-session-context";
import { useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { useDubStatus } from "@/hooks/queries/editor";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { dubLanguageLabel, type DubLanguage, type DubStyle } from "@/lib/dubbing/types";
import { busyNodes, finishedJobs } from "@/lib/editor/dub-jobs";
import { setPicture, setSound } from "@/lib/editor/pieces";
import type { EditDoc, Piece } from "@/lib/editor/types";
import { editorService } from "@/services/editor.service";
import { ApiError } from "@/services/read-json";

type Kind = "dub" | "lipsync";

const message = (err: unknown, fallback: string) =>
  err instanceof ApiError ? (err.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : err.message) : fallback;

/** Dub and lip sync from the editor (D406–D408). One per page (EditorDubProvider). */
export function useEditorDub() {
  const store = useEditorStoreApi();
  const session = useEditorSession();
  const [pending, setPending] = useState<ReadonlyMap<string, Kind>>(new Map());
  const [settingUp, setSettingUp] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [notes, setNotes] = useState<ReadonlyMap<string, string>>(new Map());
  const watching = useRef<Map<string, Kind>>(new Map());
  // Poll while anything we started or saw running hasn't finished.
  const [live, setLive] = useState(false);
  const status = useDubStatus(session.canvasId, session.editorNodeId, live);
  const busy = useMemo(() => busyNodes(status.data, pending), [status.data, pending]);

  // Runs the server now reports: stop holding them as "pending"; settle the ones that finished.
  useEffect(() => {
    const jobs = status.data;
    if (!jobs) return;
    for (const j of jobs) if (j.status === "running") watching.current.set(j.nodeId, j.kind);
    const done = finishedJobs(watching.current, jobs);
    void (async () => {
      setLive(watching.current.size > 0);
      setPending((p) => {
        const reported = jobs.filter((j) => p.get(j.nodeId) === j.kind);
        if (reported.length === 0) return p;
        const next = new Map(p);
        reported.forEach((j) => next.delete(j.nodeId));
        return next;
      });
      if (done.length === 0) return;
      done.forEach((j) => watching.current.delete(j.nodeId));
      setLive(watching.current.size > 0);
      const failed = done.filter((j) => j.status === "failed");
      if (failed.length) {
        setErrors((e) => new Map([...e, ...failed.map((j) => [j.nodeId, j.error ?? (j.kind === "dub" ? "The dub didn't finish." : "Lip sync didn't finish.")] as const)]));
        failed.forEach((j) => toast.error(j.error ?? "That didn't finish. Your credits were returned."));
      }
      const ok = done.filter((j) => j.status === "succeeded");
      if (ok.length === 0) return;
      // Fresh files for those clips; then each clip plays what just landed.
      const fresh = await editorService.state(session.canvasId);
      const st = store.getState();
      st.setSources(fresh.sources);
      st.apply((doc) => {
        let next: EditDoc = { ...doc, sources: doc.sources.map((s) => fresh.doc.sources.find((f) => f.nodeId === s.nodeId) ?? s) };
        for (const j of ok) {
          for (const p of next.pieces.filter((x: Piece) => x.sourceNodeId === j.nodeId)) {
            next = j.kind === "dub" ? setSound(next, p.id, "dubbed", fresh.sources) : setPicture(next, p.id, "lipSynced", fresh.sources);
          }
        }
        return next;
      });
      for (const j of ok) {
        const src = fresh.sources.find((s) => s.nodeId === j.nodeId);
        const name = src?.handle ?? "The clip";
        if (j.kind === "dub") {
          toast(`${name} dubbed${src?.language ? ` into ${dubLanguageLabel(src.language)}` : ""}. It now plays the dub.`, {
            action: { label: "Use original", onClick: () => store.getState().apply((d) => d.pieces.filter((p) => p.sourceNodeId === j.nodeId).reduce((acc, p) => setSound(acc, p.id, "original", fresh.sources), d)) },
          });
        } else {
          toast(`${name} lip-synced. It now shows the lip-synced picture.`);
        }
      }
    })();
  }, [status.data, session.canvasId, store]);

  const track = (nodeId: string, kind: Kind) => {
    watching.current.set(nodeId, kind);
    setLive(true);
    setPending((p) => new Map(p).set(nodeId, kind));
    setErrors((e) => {
      if (!e.has(nodeId)) return e;
      const next = new Map(e);
      next.delete(nodeId);
      return next;
    });
  };

  const startDub = useCallback(
    async (piece: Piece, opts: { language: DubLanguage; style: DubStyle }) => {
      const st = store.getState();
      const source = st.sources.find((s) => s.nodeId === piece.sourceNodeId);
      if (!source || !st.editable) return;
      setSettingUp((s) => new Set(s).add(piece.id));
      try {
        let nodeId = source.nodeId;
        if (source.kind === "video-gen") {
          // D406 — save, then put a Dubbing node between the clip and the Editor.
          await session.flush();
          const r = await editorService.dubSource(session.canvasId, { nodeId: session.editorNodeId, sessionId: session.sessionId, sourceNodeId: source.nodeId });
          store.getState().replaceAll(r.state.doc, r.state.sources);
          nodeId = r.dubbingNodeId;
          setNotes((n) => new Map(n).set(nodeId, `Added a Dubbing node on the canvas, between ${source.handle} and the Editor. It keeps this clip's dubs and their versions.`));
        }
        await editorService.startDub(nodeId, { ...opts, editorSessionId: session.sessionId });
        track(nodeId, "dub");
      } catch (err) {
        toast.error(message(err, "Couldn't start the dub. Try again."));
      } finally {
        setSettingUp((s) => {
          const next = new Set(s);
          next.delete(piece.id);
          return next;
        });
      }
    },
    [session, store],
  );

  const startLipSync = useCallback(
    async (nodeId: string) => {
      const source = store.getState().sources.find((s) => s.nodeId === nodeId);
      if (!source || !store.getState().editable) return;
      try {
        await editorService.startLipSync(nodeId, { versionId: source.versionId, editorSessionId: session.sessionId });
        track(nodeId, "lipsync");
      } catch (err) {
        toast.error(message(err, "Couldn't start lip sync. Try again."));
      }
    },
    [session.sessionId, store],
  );

  return { busy, settingUp, errors, notes, startDub, startLipSync };
}

export type EditorDub = ReturnType<typeof useEditorDub>;
