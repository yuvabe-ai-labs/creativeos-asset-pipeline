"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExportStatus } from "@/lib/editor/export-run";
import type { TranscribeStatus } from "@/lib/editor/transcribe-plan";
import type { EditDoc, EditorState } from "@/lib/editor/types";
import type { Transcript } from "@/lib/transcribe/types";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import { rmsWindows } from "@/lib/editor/silence";
import { editorService } from "@/services/editor.service";

// The Rough Cut Editor through TanStack Query (D300, D391). The keys are built here and nowhere
// else. One Editor per canvas, so the canvas card and the editor page share one state query.
export const editorKeys = {
  all: (canvasId: string) => ["editor", canvasId] as const,
  state: (canvasId: string) => [...editorKeys.all(canvasId), "state"] as const,
  export: (canvasId: string, jobId: string) => [...editorKeys.all(canvasId), "export", jobId] as const,
  transcripts: (canvasId: string) => [...editorKeys.all(canvasId), "transcripts"] as const,
  transcribe: (canvasId: string, jobId: string) => [...editorKeys.all(canvasId), "transcribe", jobId] as const,
  dubs: (canvasId: string) => [...editorKeys.all(canvasId), "dubs"] as const,
  quiet: (url: string) => ["editor-quiet", url] as const,
};

const STATE_STALE_MS = 30_000;
const EXPORT_POLL_MS = 1500;

/** The edit and its sources. The editor page seeds it from its server render. */
export function useEditorState(canvasId: string, opts: { initialData?: EditorState; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: editorKeys.state(canvasId),
    queryFn: () => editorService.state(canvasId),
    enabled: Boolean(canvasId) && opts.enabled !== false,
    initialData: opts.initialData,
    staleTime: STATE_STALE_MS,
  });
}

/** Saves the edit; the cached state then shows what was saved. */
export function useSaveEdit(canvasId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { nodeId: string; sessionId: string; doc: EditDoc }) => editorService.save(canvasId, body),
    onSuccess: (_void, body) => {
      queryClient.setQueryData<EditorState>(editorKeys.state(canvasId), (prev: EditorState | undefined) =>
        prev ? { ...prev, doc: body.doc, changed: false, notices: [] } : prev,
      );
    },
  });
}

export function useStartExport(canvasId: string) {
  return useMutation({ mutationFn: (nodeId: string) => editorService.startExport(canvasId, nodeId) });
}

/** An export's progress, polled until it finishes. */
export function useExportStatus(canvasId: string, jobId: string | null) {
  return useQuery<ExportStatus>({
    queryKey: editorKeys.export(canvasId, jobId ?? ""),
    queryFn: () => editorService.exportStatus(canvasId, jobId!),
    enabled: Boolean(canvasId && jobId),
    refetchInterval: (q) => (!q.state.data || JOB_LIVE_STATUSES.has(q.state.data.status) ? EXPORT_POLL_MS : false),
  });
}

const TRANSCRIBE_POLL_MS = 1500;

/** Stored transcripts for this reel's sound files, keyed by URL (D411). One read for the page. */
export function useTranscripts(canvasId: string) {
  return useQuery({
    queryKey: editorKeys.transcripts(canvasId),
    queryFn: async (): Promise<ReadonlyMap<string, Transcript>> => new Map((await editorService.transcripts(canvasId)).map((t) => [t.url, t])),
    enabled: Boolean(canvasId),
    staleTime: Infinity,
  });
}

export function useStartTranscribe(canvasId: string) {
  return useMutation({ mutationFn: (body: { nodeId: string; pieceIds?: string[] }) => editorService.startTranscribe(canvasId, body) });
}

/** A captions run's progress, polled until it ends. Each poll also refreshes the transcripts, so
 *  clips fill as their transcripts land. */
export function useTranscribeStatus(canvasId: string, jobId: string | null) {
  const queryClient = useQueryClient();
  return useQuery<TranscribeStatus>({
    queryKey: editorKeys.transcribe(canvasId, jobId ?? ""),
    queryFn: async () => {
      const status = await editorService.transcribeStatus(canvasId, jobId!);
      await queryClient.invalidateQueries({ queryKey: editorKeys.transcripts(canvasId) });
      return status;
    },
    enabled: Boolean(canvasId && jobId),
    refetchInterval: (q) => (!q.state.data || JOB_LIVE_STATUSES.has(q.state.data.status) ? TRANSCRIBE_POLL_MS : false),
  });
}

const DUB_POLL_MS = 3000;

/** The latest dub or lip sync of each clip feeding the Editor (D406), polled while one runs. */
export function useDubStatus(canvasId: string, editorNodeId: string, live: boolean) {
  return useQuery({
    queryKey: editorKeys.dubs(canvasId),
    queryFn: () => editorService.dubStatus(canvasId, editorNodeId),
    enabled: Boolean(canvasId && editorNodeId),
    refetchInterval: live ? DUB_POLL_MS : false,
  });
}

/** A file's loudness per 50 ms, for quiet-section review. Read once per file, kept for the session. */
export function useQuietWindows(url: string | null) {
  return useQuery({
    queryKey: editorKeys.quiet(url ?? ""),
    queryFn: async () => rmsWindows(await editorService.fetchMedia(url!)),
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false,
  });
}
