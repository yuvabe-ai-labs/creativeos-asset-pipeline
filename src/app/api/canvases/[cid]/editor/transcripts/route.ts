import { apiOk, withCanvas, withTryCatch } from "@/lib/api/route-helpers";
import { listTranscripts } from "@/lib/db/media-transcripts";
import { loadEditorState } from "@/lib/editor/load-state";
import { playableSoundUrls } from "@/lib/editor/transcribe-plan";

// Stored transcripts for every sound this reel's pieces could play, the one not chosen included
// (D411, D410). The URLs are derived on the
// server from the saved edit, never taken from the request (rule 14).
export async function GET(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return withCanvas(req, Promise.resolve({ id: cid }), async (canvasId) =>
    withTryCatch("Couldn't read the captions.", async () => {
      const state = await loadEditorState(canvasId);
      if (!state) return apiOk({ transcripts: [] });
      const found = await listTranscripts(playableSoundUrls(state.doc, state.sources));
      return apiOk({ transcripts: [...found.values()] });
    }),
  );
}
