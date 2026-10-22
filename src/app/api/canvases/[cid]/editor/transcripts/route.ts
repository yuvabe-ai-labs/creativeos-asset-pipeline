import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { listTranscripts } from "@/lib/db/media-transcripts";
import { loadEditorState } from "@/lib/editor/load-state";
import { planTranscription } from "@/lib/editor/transcribe-plan";

// Stored transcripts for the files this reel's pieces play (D395). The URLs are derived on the
// server from the saved edit, never taken from the request (rule 14).
export async function GET(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the captions.", async () => {
      const state = await loadEditorState(canvasId);
      if (!state) return apiOk({ transcripts: [] });
      const { files } = planTranscription(state.doc, state.sources);
      const found = await listTranscripts(files.map((f) => f.url));
      return apiOk({ transcripts: [...found.values()] });
    }),
  );
}
