// Stored transcripts, once per file (D411, migration 0060).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Transcript, TranscriptWord } from "@/lib/transcribe/types";

type Row = { url: string; language: string; words: TranscriptWord[]; engine: string; model: string; duration_seconds: number };

export async function listTranscripts(urls: string[]): Promise<Map<string, Transcript>> {
  const out = new Map<string, Transcript>();
  if (urls.length === 0) return out;
  const { data, error } = await createServerSupabase()
    .from("media_transcripts")
    .select("url, language, words, engine, model, duration_seconds")
    .in("url", urls);
  if (error) throw error;
  for (const r of (data ?? []) as Row[]) {
    out.set(r.url, { url: r.url, language: r.language, words: r.words, engine: r.engine, model: r.model, durationSeconds: r.duration_seconds });
  }
  return out;
}

/** Which of these files already have a transcript (no word payload, rule 8). */
export async function listTranscribedUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const { data, error } = await createServerSupabase().from("media_transcripts").select("url").in("url", urls);
  if (error) throw error;
  return new Set(((data ?? []) as { url: string }[]).map((r) => r.url));
}

export async function saveTranscript(t: Transcript): Promise<void> {
  const { error } = await createServerSupabase().from("media_transcripts").upsert(
    { url: t.url, language: t.language, words: t.words, engine: t.engine, model: t.model, duration_seconds: t.durationSeconds },
    { onConflict: "url" },
  );
  if (error) throw error;
}
