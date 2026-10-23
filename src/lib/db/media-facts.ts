// What the server measured in a stored file's header, kept once per file (D392, migration 0059).
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MediaFacts } from "@/lib/editor/types";

type FactsRow = { url: string; duration_seconds: number; video: MediaFacts["video"]; audio: MediaFacts["audio"] };

export async function listMediaFacts(urls: string[]): Promise<Map<string, MediaFacts>> {
  const out = new Map<string, MediaFacts>();
  if (urls.length === 0) return out;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("media_facts")
    .select("url, duration_seconds, video, audio")
    .in("url", urls);
  if (error) throw error;
  for (const row of (data ?? []) as FactsRow[]) {
    out.set(row.url, { durationSeconds: row.duration_seconds, video: row.video, audio: row.audio });
  }
  return out;
}

export async function saveMediaFacts(rows: Array<{ url: string; facts: MediaFacts }>): Promise<void> {
  if (rows.length === 0) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from("media_facts").upsert(
    rows.map((r) => ({ url: r.url, duration_seconds: r.facts.durationSeconds, video: r.facts.video, audio: r.facts.audio })),
    { onConflict: "url" },
  );
  if (error) throw error;
}
