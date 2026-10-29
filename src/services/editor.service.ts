import type { ExportStatus } from "@/lib/editor/export-run";
import type { DubLanguage, DubStyle } from "@/lib/dubbing/types";
import type { EditorDubJob } from "@/lib/editor/dub-jobs";
import type { RenderQuality } from "@/lib/editor/render-plan";
import type { RenderStatus } from "@/lib/editor/render-run";
import type { TranscribeStatus } from "@/lib/editor/transcribe-plan";
import type { EditDoc, EditorState } from "@/lib/editor/types";
import type { Transcript } from "@/lib/transcribe/types";
import { proxyImageSrc } from "@/lib/post/proxy-image-src";
import { ApiError, readJson } from "./read-json";

// The Rough Cut Editor's API calls (D391). No caching here: src/hooks/queries/editor.ts owns that.

/** A tiny semaphore: at most `n` media reads in flight. */
function slots(n: number) {
  let free = n;
  const waiting: Array<() => void> = [];
  return {
    acquire: () => (free > 0 ? (free--, Promise.resolve()) : new Promise<void>((res) => waiting.push(res))),
    release: () => {
      const next = waiting.shift();
      if (next) next();
      else free++;
    },
  };
}
const mediaSlots = slots(2);

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

  /** A stored file's bytes through the same-origin proxy (storage sends no CORS headers, D245).
   *  Two at a time for the page, so opening a reel never fires one big read per clip at once. */
  async fetchMedia(url: string): Promise<ArrayBuffer> {
    await mediaSlots.acquire();
    try {
      const res = await fetch(proxyImageSrc(url));
      if (!res.ok) throw new ApiError("Couldn't read this clip's sound.", res.status);
      return await res.arrayBuffer();
    } finally {
      mediaSlots.release();
    }
  }

  async exportStatus(canvasId: string, jobId: string): Promise<ExportStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/exports/${jobId}`);
    return readJson(res, "Couldn't read the export.");
  }

  /** Starts an MP4 render of the saved edit (D417). */
  async startRender(canvasId: string, body: { nodeId: string; quality: RenderQuality; captions: boolean }): Promise<{ jobId: string }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/renders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson(res, "Couldn't start the video.");
  }

  async renderStatus(canvasId: string, jobId: string): Promise<RenderStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/renders/${jobId}`);
    return readJson(res, "Couldn't read the video.");
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

  /** D406 — put a Dubbing node between a Video Gen clip and the Editor; returns the rewritten state. */
  async dubSource(canvasId: string, body: { nodeId: string; sessionId: string; sourceNodeId: string }): Promise<{ dubbingNodeId: string; state: EditorState }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/dub-source`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return readJson(res, "Couldn't set up the dub.");
  }

  /** The latest dub or lip sync of each clip feeding the Editor (D406). */
  async dubStatus(canvasId: string, nodeId: string): Promise<EditorDubJob[]> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/dub-status?nodeId=${encodeURIComponent(nodeId)}`);
    return (await readJson<{ jobs: EditorDubJob[] }>(res, "Couldn't read the dubs.")).jobs;
  }

  /** Dub a Dubbing node from the editor (D408). Voice: the presenter's own. */
  async startDub(nodeId: string, body: { language: DubLanguage; style: DubStyle; editorSessionId: string }): Promise<{ generationId: string }> {
    const res = await fetch(`/api/nodes/${nodeId}/dub`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return readJson(res, "Couldn't start the dub.");
  }

  /** Lip sync a Dubbing node's current dub from the editor (D408). */
  async startLipSync(nodeId: string, body: { versionId: string; editorSessionId: string }): Promise<{ generationId: string }> {
    const res = await fetch(`/api/nodes/${nodeId}/lip-sync`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return readJson(res, "Couldn't start lip sync.");
  }

  /** The stored transcripts for this reel's sound files (D411). */
  async transcripts(canvasId: string): Promise<Transcript[]> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/transcripts`);
    return (await readJson<{ transcripts: Transcript[] }>(res, "Couldn't read the captions.")).transcripts;
  }
}

export const editorService = new EditorService();
