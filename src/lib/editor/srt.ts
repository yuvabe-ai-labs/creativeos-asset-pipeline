// SRT read/write, ported from the rough-cut spike (D392: the package's caption fallback, and the
// editor's import/export). Cues carry text and reel timing only; captions.ts attaches them to
// pieces. Accepts what Windows tools write: CRLF, a UTF-8 BOM, and short fractions (",5").

export type SrtCue = { start: number; end: number; text: string };

function stamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, "0")}`;
}

function parseStamp(s: string): number {
  const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  // The fraction is a decimal: ",5" is 500 ms, not 5 ms (the spike's bug).
  const ms = Number(m[4].slice(0, 3).padEnd(3, "0"));
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + ms / 1000;
}

export function toSrt(cues: SrtCue[]): string {
  return [...cues]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`)
    .join("\n");
}

export function parseSrt(text: string): SrtCue[] {
  const out: SrtCue[] = [];
  for (const block of text.replace(/^﻿/, "").replace(/\r/g, "").split(/\n\s*\n/)) {
    const m = block.match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)[^\n]*\n([\s\S]+)/);
    if (m) out.push({ start: parseStamp(m[1]), end: parseStamp(m[2]), text: m[3].trim() });
  }
  return out;
}
