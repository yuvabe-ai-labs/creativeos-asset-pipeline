// Which stored files a run of Auto captions needs (D395): each piece's playing sound, once,
// resolved from the SAVED sources on the server (rule 14), never from the request.
import type { JobStatus } from "@/lib/jobs/types";
import type { TranscribeFailureReason } from "@/lib/transcribe/types";
import { pieceSoundFile } from "./playback";
import type { EditDoc, SourceView } from "./types";

export type TranscribeFile = { url: string; seconds: number };
export type TranscribeJobInput = { canvasId: string; nodeId: string; generationId: string; orgId: string; files: TranscribeFile[] };
export type TranscribeJobResult = { failed: Array<{ url: string; reason: TranscribeFailureReason }> };
export type TranscribeStatus = { status: JobStatus; result: TranscribeJobResult | null; error: string | null };

export function planTranscription(doc: EditDoc, sources: SourceView[], pieceIds?: string[]): { files: TranscribeFile[]; noSound: string[] } {
  const byId = new Map(sources.map((s) => [s.nodeId, s]));
  const wanted = pieceIds ? new Set(pieceIds) : null;
  const files = new Map<string, TranscribeFile>();
  const noSound: string[] = [];
  for (const p of doc.pieces) {
    if (wanted && !wanted.has(p.id)) continue;
    const source = byId.get(p.sourceNodeId);
    if (!source) continue;
    const f = pieceSoundFile(p, source);
    if (!f.facts?.audio) {
      noSound.push(p.id);
      continue;
    }
    if (!files.has(f.url)) files.set(f.url, { url: f.url, seconds: f.facts.durationSeconds });
  }
  return { files: [...files.values()], noSound };
}
