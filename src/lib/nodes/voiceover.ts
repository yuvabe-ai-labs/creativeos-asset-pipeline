// D267 — script voiceover: the mapping check, and (Task 3) the per-model renderer.
// Pure and browser-safe: the Script node, the renderers and the API routes all import it.
import type { ReelScript, VoLine } from "./reel-script";

export const VO_MAPPING_ISSUE =
  "VO mapping dropped or changed a line — re-parse or edit the shot lines.";

const NO_VO = /^\s*(none|no\s+voice[\s-]?over|n\/a)\b/i;

// Quote/apostrophe characters that are DELETED (never turned into a boundary) so a contraction
// like "don't" / curly "don't" tokenises as one word, not two.
const QUOTE_CHARS_G = /["'“”‘’‚„]/g;
const QUOTE_CHAR = /["'“”‘’‚„]/;
const ALNUM = /[\p{L}\p{N}]/u;

/** Lower-case word tokens: quotes deleted, everything else non-alnum becomes a boundary. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(QUOTE_CHARS_G, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Same tokenisation as `tokens`, but keeps each token's start offset in the original string. */
function tokenizePositions(s: string): { text: string; start: number }[] {
  const lower = s.toLowerCase();
  const out: { text: string; start: number }[] = [];
  let cur = "";
  let start = -1;
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (QUOTE_CHAR.test(ch)) continue;
    if (ALNUM.test(ch)) {
      if (!cur) start = i;
      cur += ch;
    } else if (cur) {
      out.push({ text: cur, start });
      cur = "";
    }
  }
  if (cur) out.push({ text: cur, start });
  return out;
}

// Real timecodes only — a bare numeric range like "20-30" (no unit) must survive untouched.
const MMSS_RANGE = /\b\d{1,2}:\d{2}(?:\.\d+)?\s*[-–]\s*\d{1,2}:\d{2}(?:\.\d+)?\b/g;
const NUM_RANGE_WITH_UNIT = /\b\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds)\b/gi;
const STANDALONE_NUM_UNIT = /\b\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds)\b/gi;
const LABEL_WORDS = /\b(?:vo|voice[\s-]?over|narrator|narration)\b\s*(?:\([^)]*\))?\s*:?/gi;

// Same three timecode shapes as above (MM:SS range, "N-N" with a unit, "N" with a unit), unanchored
// and reusable inside a larger pattern — used by the trailing-label-clause check below.
const TIMECODE_SRC =
  "(?:\\d{1,2}:\\d{2}(?:\\.\\d+)?\\s*[-–]\\s*\\d{1,2}:\\d{2}(?:\\.\\d+)?" +
  "|\\d+(?:\\.\\d+)?\\s*[-–]\\s*\\d+(?:\\.\\d+)?\\s*(?:s|sec|secs|seconds)" +
  "|\\d+(?:\\.\\d+)?\\s*(?:s|sec|secs|seconds))";

// A label clause introducing a quote ends in a colon, optionally followed by "at" and a timecode
// ("...warm neutral: at 0-2s", "...from 4s:"). Anchored at the end of the segment.
const TRAILING_LABEL_RE = new RegExp(`:\\s*(?:at\\s+)?(?:${TIMECODE_SRC})?\\s*$`, "i");

/** Strips timecodes ("0:04.0 – 0:08.0", "0-2s", "4 sec") and speaker labels ("VO:", "Narrator:"). */
function stripScaffolding(s: string): string {
  return s
    .replace(MMSS_RANGE, " ")
    .replace(NUM_RANGE_WITH_UNIT, " ")
    .replace(STANDALONE_NUM_UNIT, " ")
    .replace(LABEL_WORDS, " ");
}

// A quoted span is the actual spoken words; straight "…" or curly "…" — never single quotes,
// which are also contraction marks. Returns [start, end) content ranges (quotes excluded).
const STRAIGHT_QUOTE_SPAN = /"([^"]*)"/g;
const CURLY_QUOTE_SPAN = /“([^”]*)”/g;

function quotedSpans(raw: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const re of [STRAIGHT_QUOTE_SPAN, CURLY_QUOTE_SPAN]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const start = m.index + 1;
      spans.push([start, start + m[1].length]);
    }
  }
  return spans;
}

/**
 * The text outside all quoted spans: before the first, between each pair, and after the last —
 * each range including the quote characters themselves, so only the words between them remain.
 */
function outsideSegments(raw: string, spans: Array<[number, number]>): string[] {
  const quoteRanges = spans
    .map(([s, e]): [number, number] => [s - 1, e + 1])
    .sort((a, b) => a[0] - b[0]);
  const segments: string[] = [];
  let cursor = 0;
  for (const [qs, qe] of quoteRanges) {
    segments.push(raw.slice(cursor, qs));
    cursor = qe;
  }
  segments.push(raw.slice(cursor));
  return segments;
}

/** Removes every `(...)` and `[...]` span entirely — production/delivery notes ("(Music ducks
 *  under the line.)", "[beat]") are never spoken, regardless of where they sit. */
function stripBracketedNotes(s: string): string {
  return s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
}

/**
 * Drops a trailing label clause — text that introduces the quoted span right after this segment,
 * such as "Voiceover, off-screen narrator, warm: at 0-2s " or "VO: ". Only meaningful when a
 * colon-terminated (optionally "at TIMECODE"-suffixed) run reaches the end of the segment; a colon
 * anywhere else is ordinary prose (e.g. a ratio "3:1") and is left alone. Once such a run is found,
 * the whole label clause — back to the previous sentence end ('.', '!', '?') or the segment's
 * start, whichever is nearer — is dropped, not just the regex match itself.
 */
function stripTrailingLabel(s: string): string {
  const m = TRAILING_LABEL_RE.exec(s);
  if (!m) return s;
  const before = s.slice(0, m.index);
  const sentenceEnd = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"));
  return s.slice(0, sentenceEnd + 1);
}

/** First index `i >= from` where `needle` appears as a contiguous run in `haystack`, or -1. */
function findRun(haystack: string[], needle: string[], from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Walks `lines` in order, finding each as a contiguous whole-token run in `reelTokens` at or
 * after a cursor that only advances. Returns the per-token coverage, or null if some line's
 * tokens never appear (dropped or changed).
 */
function matchAndCover(reelTokens: string[], lines: string[][]): boolean[] | null {
  const covered = new Array<boolean>(reelTokens.length).fill(false);
  let cursor = 0;
  for (const line of lines) {
    const at = findRun(reelTokens, line, cursor);
    if (at === -1) return null;
    for (let i = at; i < at + line.length; i++) covered[i] = true;
    cursor = at + line.length;
  }
  return covered;
}

/**
 * Whether the per-shot lines faithfully reproduce the reel-wide VO. Null when they do, when the
 * script has no VO and nothing was mapped, or when the parse predates per-shot lines.
 *
 * Refines spec §3.3: real scripts wrap the spoken words in timecodes, speaker labels and
 * (sometimes) quotes, so literal equality would warn on every script. Instead:
 *
 * 1. Tokenise, don't substring — a mapped line must match reel words at whole-word boundaries.
 *    ("Come to work" must not "match" inside "Come to workshop": that's a changed word, not a
 *    prefix hit.) Quote/apostrophe characters are deleted rather than turned into a boundary, so
 *    "don't" and "don't" tokenise the same regardless of which quote style the model used.
 * 2. Walk the mapped lines in order, finding each as a contiguous run of reel tokens at or after
 *    a cursor that only moves forward; a line that isn't found there means it was dropped or
 *    changed. This also records which reel tokens got covered.
 * 3. Whether leftover (uncovered) reel tokens matter depends on whether the reel VO uses quotes:
 *    - Quoted (the reel text contains "…" or "…" spans): the quotes delimit the actual spoken
 *      words, so every token *inside* a quoted span must be covered. Text *outside* the quotes
 *      (before the first span, between spans, and after the last) is mostly scaffolding — a
 *      speaker label, "at 0-2s", delivery notes — but isn't ignored outright, because a plain
 *      sentence dropped entirely (no quotes at all) must still be caught. Each outside segment is
 *      processed on its own:
 *        a. Bracketed notes — every `(...)` and `[...]` span — are removed entirely; they're
 *           production/delivery notes ("(Music ducks under the line.)"), never spoken words.
 *        b. If the segment sits right before a quoted span (every segment except the one after
 *           the last quote), a trailing label clause is dropped: a colon introduces the quote
 *           that follows ("Voiceover, off-screen narrator, warm: at 0-2s "), so a colon-terminated
 *           run reaching the segment's end (optionally "at TIMECODE") — and everything back to the
 *           previous sentence end or the segment's start — is a label, not spoken content. A colon
 *           that ISN'T immediately before a quote (a ratio "3:1", ordinary prose) is left alone.
 *        c. The remainder is run through the same timecode/label-word stripping as unquoted prose,
 *           tokenised, and any token already covered by a mapped line's match is dropped (drawing
 *           from the same coverage the quoted check computed). A segment with more than two tokens
 *           still uncovered after that flags the issue — a dropped plain sentence, even one that
 *           happens to contain a colon, still exceeds this budget.
 *    - Unquoted prose: there's no delimiter, so timecodes and label words ("VO:", "Narrator:") are
 *      stripped first, and up to two remaining uncovered tokens are tolerated (minor connective
 *      words the parse legitimately dropped) before it's flagged.
 */
export function voiceoverMappingIssue(script: ReelScript | null): string | null {
  if (!script) return null;
  const shots = script.visual_script?.shots ?? [];
  if (!shots.some((s) => s.voiceover !== undefined)) return null;

  const lines = shots
    .flatMap((s) => s.voiceover ?? [])
    .map((l) => tokens(l.text))
    .filter((t) => t.length > 0);

  const reelRaw = (script.voiceover ?? "").trim();
  if (!reelRaw || NO_VO.test(reelRaw)) return lines.length === 0 ? null : VO_MAPPING_ISSUE;

  const spans = quotedSpans(reelRaw);
  if (spans.length > 0) {
    const positioned = tokenizePositions(reelRaw);
    const covered = matchAndCover(
      positioned.map((t) => t.text),
      lines,
    );
    if (!covered) return VO_MAPPING_ISSUE;
    const inSpan = (start: number) => spans.some(([s, e]) => start >= s && start < e);
    if (positioned.some((t, i) => inSpan(t.start) && !covered[i])) return VO_MAPPING_ISSUE;

    const coveredBag = new Map<string, number>();
    positioned.forEach((t, i) => {
      if (covered[i]) coveredBag.set(t.text, (coveredBag.get(t.text) ?? 0) + 1);
    });
    const segments = outsideSegments(reelRaw, spans);
    for (let i = 0; i < segments.length; i++) {
      const followsIntoQuote = i < segments.length - 1;
      let cleaned = stripBracketedNotes(segments[i]);
      if (followsIntoQuote) cleaned = stripTrailingLabel(cleaned);
      const segTokens = tokens(stripScaffolding(cleaned));
      let uncovered = 0;
      for (const tok of segTokens) {
        const n = coveredBag.get(tok) ?? 0;
        if (n > 0) coveredBag.set(tok, n - 1);
        else uncovered++;
      }
      if (uncovered > 2) return VO_MAPPING_ISSUE;
    }
    return null;
  }

  const reelTokens = tokens(stripScaffolding(reelRaw));
  const covered = matchAndCover(reelTokens, lines);
  if (!covered) return VO_MAPPING_ISSUE;
  return covered.filter((c) => !c).length > 2 ? VO_MAPPING_ISSUE : null;
}

export type { VoLine };
