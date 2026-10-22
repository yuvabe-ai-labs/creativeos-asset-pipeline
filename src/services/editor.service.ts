import type { ExportStatus } from "@/lib/editor/export-run";
import type { TranscribeStatus } from "@/lib/editor/transcribe-plan";
import type { EditDoc, EditorState } from "@/lib/editor/types";
import type { Transcript } from "@/lib/transcribe/types";
import { proxyImageSrc } from "@/lib/post/proxy-image-src";
import { ApiError, readJson } from "./read-json";

// The Rough Cut Editor's API calls (D391). No caching here: src/hooks/queries/editor.ts owns that.
class EditorService {
  /** The canvas's edit, reconciled with its current sources. */
  async state(canvasId: string): Promise<EditorState> {
    const res = await fetch(`/api/canvases/${canvasId}/editor`);
    return readJson(res, "Couldn't load the editor.");
  }

  /** An autosave. Rejected with 409 when this tab no longer holds the canvas lock. */
  async save(canvasId: string, body: { nodeId: string; sessionId: string; doc: EditDoc }): Promise<void> {
    const res = await fetch(`/api/canvases/${canvasId}/editor`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await readJson(res, "Couldn't save the edit.");
  }

  /** Starts a Premiere export of the saved edit (D392). */
  async startExport(canvasId: string, nodeId: string): Promise<{ jobId: string }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/exports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
    return readJson(res, "Couldn't start the export.");
  }

  /** A stored file's bytes through the same-origin proxy (storage sends no CORS headers, D245). */
  async fetchMedia(url: string): Promise<ArrayBuffer> {
    const res = await fetch(proxyImageSrc(url));
    if (!res.ok) throw new ApiError("Couldn't read this clip's sound.", res.status);
    return res.arrayBuffer();
  }

  async exportStatus(canvasId: string, jobId: string): Promise<ExportStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/exports/${jobId}`);
    return readJson(res, "Couldn't read the export.");
  }

  /** Starts Auto captions (D399). jobId null: every file was already transcribed. */
  async startTranscribe(canvasId: string, body: { nodeId: string; pieceIds?: string[] }): Promise<{ jobId: string | null; noSound: string[] }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson(res, "Couldn't start captions.");
  }

  async transcribeStatus(canvasId: string, jobId: string): Promise<TranscribeStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcribe/${jobId}`);
    return readJson(res, "Couldn't read the captions run.");
  }

  /** The stored transcripts for this reel's sound files (D395). */
  async transcripts(canvasId: string): Promise<Transcript[]> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcripts`);
    return (await readJson<{ transcripts: Transcript[] }>(res, "Couldn't read the captions.")).transcripts;
  }
}

export const editorService = new EditorService();
