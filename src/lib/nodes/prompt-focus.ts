// D178: describeApprovalPill lived here and mapped `changes_requested` to an amber
// "warning" tone while every other approval surface reserves amber for `pending` and the
// destructive token for a rejection. Its three call sites each re-implemented the
// tone -> class mapping verbatim, so the drift was invisible. Replaced by
// components/review/approval-status-badge.tsx, which owns the labels, the colours and the
// icon together.

// One beat per sentence for the generated-prompt read view. The boundary requires
// whitespace AFTER the terminator, so decimals ("f/1.8") and hex codes never split.
export function splitSentenceBeats(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type BeatSegment = { text: string; highlighted: boolean };

// Camera specs are always worth cross-checking — even under an Auto control, where the
// model chose the value itself: any focal length ("85mm", "100 mm") and any aperture
// ("f/4", "f/1.8").
export const CAMERA_SPEC_PATTERNS: RegExp[] = [/\b\d{2,3}\s?mm\b/, /\bf\/\d+(?:\.\d+)?/];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Case-insensitive, non-overlapping matching for the read view's cross-check highlights.
// String terms treat hyphens and spaces as interchangeable ("center-framed" matches
// "center framed"); RegExp terms match as written (their flags are ignored — "gi" is
// applied). The earliest match wins each position; on a tie the longest match wins, so a
// short term never swallows the front of a longer one.
export function segmentByTerms(text: string, terms: Array<string | RegExp>): BeatSegment[] {
  if (!text) return [];
  const sources = terms
    .map((t) =>
      typeof t === "string"
        ? t.trim()
          ? escapeRegExp(t.trim()).replace(/[\s-]+/g, "[-\\s]+")
          : ""
        : t.source,
    )
    .filter(Boolean);

  const matches: { start: number; end: number }[] = [];
  for (const source of sources) {
    for (const m of text.matchAll(new RegExp(source, "gi"))) {
      if (m[0] && m.index !== undefined) matches.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: BeatSegment[] = [];
  let pos = 0;
  for (const match of matches) {
    if (match.start < pos) continue; // overlaps an already-accepted match
    if (match.start > pos) segments.push({ text: text.slice(pos, match.start), highlighted: false });
    segments.push({ text: text.slice(match.start, match.end), highlighted: true });
    pos = match.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlighted: false });
  return segments;
}

export type VersionChip = {
  id: string;
  label: string; // "v3"
  isActive: boolean;
  isError: boolean;
  disabled: boolean; // active OR error OR restoring
};

// Compact chip model, newest-first (index 0 = highest generation number), mirroring the
// numbering PromptVersionHistory uses (genNumber = total - index). Structural input type keeps
// this lib module free of a component dependency; VersionSummary[] satisfies it.
export function buildVersionChips(
  versions: { id: string; error: string | null }[],
  activeVersionId: string | null,
  restoring: boolean,
): VersionChip[] {
  const total = versions.length;
  return versions.map((v, i) => {
    const isActive = v.id === activeVersionId;
    const isError = !!v.error;
    return {
      id: v.id,
      label: `v${total - i}`,
      isActive,
      isError,
      disabled: isActive || isError || restoring,
    };
  });
}
