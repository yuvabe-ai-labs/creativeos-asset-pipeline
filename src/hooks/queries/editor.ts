"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EditDoc, EditorState } from "@/lib/editor/types";
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
