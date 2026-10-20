import type { ExportStatus } from "@/lib/editor/export-run";
import type { EditDoc, EditorState } from "@/lib/editor/types";
import { readJson } from "./read-json";

// The Rough Cut Editor's API calls (D390). No caching here: src/hooks/queries/editor.ts owns that.
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

  /** Starts a Premiere export of the saved edit (D391). */
  async startExport(canvasId: string, nodeId: string): Promise<{ jobId: string }> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/exports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId }),
    });
    return readJson(res, "Couldn't start the export.");
  }

  async exportStatus(canvasId: string, jobId: string): Promise<ExportStatus> {
    const res = await fetch(`/api/canvases/${canvasId}/editor/exports/${jobId}`);
    return readJson(res, "Couldn't read the export.");
  }
}

export const editorService = new EditorService();
