"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditorStore, useEditorStoreApi } from "@/components/editor/editor-store-provider";
import { useStartTranscribe, useTranscribeStatus, useTranscripts } from "@/hooks/queries/editor";
import { autoCaptionCost, fillFromTranscripts, pieceSound, staleAutoPieces } from "@/lib/editor/auto-captions";
import type { Caption } from "@/lib/editor/types";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import type { TranscribeFailureReason, Transcript } from "@/lib/transcribe/types";
import { ApiError } from "@/services/read-json";

const FAILURE_COPY: Record<TranscribeFailureReason, string> = {
  "no-speech": "No speech found",
  "no-sound": "This clip has no sound",
  failed: "Couldn't caption this clip",
};
export const failureCopy = (r: TranscribeFailureReason) => FAILURE_COPY[r];

type Run = { pieces: string[]; added: string[]; replaced: Caption[]; failed: number; error?: string };
const EMPTY: ReadonlySet<string> = new Set();

/** Auto captions for the editor page (D399, D401): the cost on the button, one run for the reel,
 *  and each clip filled as its transcript lands. One run, one poll and one transcripts read for the
 *  whole page (rule 1); mounted once through AutoCaptionsProvider. */
export function useAutoCaptions({ canvasId, nodeId }: { canvasId: string; nodeId: string }) {
  const store = useEditorStoreApi();
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const transcripts = useTranscripts(canvasId);
  const startMutation = useStartTranscribe(canvasId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [listening, setListeningState] = useState<ReadonlySet<string>>(EMPTY);
  const [failed, setFailed] = useState<ReadonlyMap<string, TranscribeFailureReason>>(new Map());
  const listeningRef = useRef<ReadonlySet<string>>(EMPTY);
  const run = useRef<Run | null>(null);
  const status = useTranscribeStatus(canvasId, jobId);

  const setListening = useCallback((next: ReadonlySet<string>) => {
    listeningRef.current = next;
    setListeningState(next);
  }, []);

  const transcribed = useMemo(() => new Set(transcripts.data?.keys() ?? []), [transcripts.data]);
  const cost = useCallback((pieceIds?: string[]) => autoCaptionCost(doc, sources, transcribed, pieceIds), [doc, sources, transcribed]);
  const stale = useMemo(() => staleAutoPieces(doc, sources), [doc, sources]);

  /** Writes captions for every clip we're listening to whose transcript is stored. */
  const fill = useCallback(
    (data: ReadonlyMap<string, Transcript>) => {
      const ids = [...listeningRef.current];
      if (ids.length === 0) return;
      const st = store.getState();
      const r = fillFromTranscripts(st.doc, st.sources, ids, data, () => crypto.randomUUID());
      if (r.filled.length === 0) return;
      st.apply(() => r.doc);
      run.current?.added.push(...r.added);
      const left = new Set(listeningRef.current);
      r.filled.forEach((id) => left.delete(id));
      setListening(left);
    },
    [store, setListening],
  );

  useEffect(() => {
    if (transcripts.data) fill(transcripts.data);
  }, [transcripts.data, fill]);

  // The run ended: fill what landed last, and mark the clips that couldn't be captioned.
  const finishedJob = status.data && !JOB_LIVE_STATUSES.has(status.data.status) ? status.data : null;
  const handledJob = useRef<string | null>(null);
  useEffect(() => {
    if (!jobId || !finishedJob || handledJob.current === jobId) return;
    handledJob.current = jobId;
    void (async () => {
      const data = (await transcripts.refetch()).data;
      setJobId(null);
      if (data) fill(data);
      const st = store.getState();
      const byUrl = new Map((finishedJob.result?.failed ?? []).map((f) => [f.url, f.reason] as const));
      const marks = new Map<string, TranscribeFailureReason>();
      for (const id of listeningRef.current) {
        const url = pieceSound(st.doc, st.sources, id)?.url;
        marks.set(id, (url && byUrl.get(url)) || "failed");
      }
      if (marks.size) {
        setFailed((f) => new Map([...f, ...marks]));
        if (run.current) run.current.failed += marks.size;
      }
      if (finishedJob.status === "failed" && finishedJob.error && run.current) run.current.error = finishedJob.error;
      setListening(EMPTY);
    })();
  }, [jobId, finishedJob, transcripts, fill, store, setListening]);

  // Everything landed (or failed): say so once, with Undo.
  useEffect(() => {
    const r = run.current;
    if (!r || jobId || startMutation.isPending || listening.size > 0) return;
    run.current = null;
    if (r.error && r.added.length === 0) {
      toast.error(r.error);
      return;
    }
    const ok = r.pieces.length - r.failed;
    const message = r.failed
      ? `${ok} clip${ok === 1 ? "" : "s"} captioned. ${r.failed} couldn't be.`
      : `${r.added.length} caption${r.added.length === 1 ? "" : "s"} from ${r.pieces.length} clip${r.pieces.length === 1 ? "" : "s"}`;
    const undo = () =>
      store.getState().apply((d) => {
        const added = new Set(r.added);
        const kept = d.captions.filter((c) => !added.has(c.id));
        const back = r.replaced.filter((c) => !kept.some((k) => k.id === c.id));
        return { ...d, captions: [...kept, ...back] };
      });
    toast(message, r.added.length ? { action: { label: "Undo", onClick: undo } } : undefined);
  }, [listening, jobId, startMutation.isPending, store]);

  const start = useCallback(
    (pieceIds?: string[]) => {
      const st = store.getState();
      const ids = (pieceIds ?? st.doc.pieces.map((p) => p.id)).filter((id) => !listeningRef.current.has(id));
      if (ids.length === 0 || run.current) return;
      const wanted = new Set(ids);
      run.current = { pieces: ids, added: [], replaced: st.doc.captions.filter((c) => wanted.has(c.pieceId) && c.auto && !c.edited), failed: 0 };
      setFailed((f) => new Map([...f].filter(([id]) => !wanted.has(id))));
      setListening(new Set([...listeningRef.current, ...ids]));
      startMutation.mutate(
        { nodeId, pieceIds: pieceIds && ids },
        {
          onSuccess: ({ jobId: id, noSound }) => {
            if (noSound.length) {
              setFailed((f) => new Map([...f, ...noSound.map((n) => [n, "no-sound"] as const)]));
              if (run.current) run.current.failed += noSound.length;
              setListening(new Set([...listeningRef.current].filter((x) => !noSound.includes(x))));
            }
            if (id) setJobId(id);
            else void transcripts.refetch();
          },
          onError: (err) => {
            run.current = null;
            setListening(new Set([...listeningRef.current].filter((x) => !wanted.has(x))));
            toast.error(err instanceof ApiError && err.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : "Couldn't start captions. Try again.");
          },
        },
      );
    },
    [store, startMutation, nodeId, transcripts, setListening],
  );

  return { cost, start, listening, failed, stale, transcripts: transcripts.data, busy: listening.size > 0 };
}

export type AutoCaptions = ReturnType<typeof useAutoCaptions>;
