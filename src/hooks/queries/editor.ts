"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExportStatus } from "@/lib/editor/export-run";
import type { EditDoc, EditorState } from "@/lib/editor/types";
import { JOB_LIVE_STATUSES } from "@/lib/jobs/types";
import { rmsWindows } from "@/lib/editor/silence";
import { editorService } from "@/services/editor.service";

// The Rough Cut Editor through TanStack Query (D300, D390). The keys are built here and nowhere
// else. One Editor per canvas, so the canvas card and the editor page share one state query.
export const editorKeys = {
  all: (canvasId: string) => ["editor", canvasId] as const,
  state: (canvasId: string) => [...editorKeys.all(canvasId), "state"] as const,
  export: (canvasId: string, jobId: string) => [...editorKeys.all(canvasId), "export", jobId] as const,
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
