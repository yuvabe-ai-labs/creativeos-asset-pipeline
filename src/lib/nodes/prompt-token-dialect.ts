// How a reference to an attached image is written in a given field's text.
//
// Two fields now hold references and both must edit them as atomic chips, but they store them
// differently. The Instruction is authored by a person and keeps a self-describing token; the
// generated motion prompt ships to Omni and must carry the vendor's own `<IMAGE_REF_N>` syntax.
// The editor is one component, so the difference lives here rather than as a second editor.

// Type-only: erased at compile time, so multishot-models.ts and this module have no runtime cycle.
import type { MultishotCapability } from "./multishot-models";

export type TextSegment = { kind: "text"; text: string };
export type MentionSegment = { kind: "mention"; label: string; id: string };
export type Segment = TextSegment | MentionSegment;

export type TokenDialect = {
  /** Split raw field text into text runs and reference chips. */
  parse(value: string): Segment[];
  /** The exact source text a chip stands for. Caret arithmetic depends on its LENGTH. */
  tokenOf(segment: MentionSegment): string;
  /** The token to insert when the operator picks this upstream from the @ menu. */
  tokenForId(id: string, label: string): string | null;
  /**
   * What a rendered chip reads, given the upstream's own name when it resolves.
   *
   * Both dialects show the reference's NAME — a chip must look the same wherever it appears, and
   * the same file picked from the same @ menu should not read one way in the Instruction and
   * another in the prompt. The dialects differ only in how they recover that name from a stored
   * token, which is why this is a dialect method rather than one shared function.
   */
  chipLabel(segment: MentionSegment, upstreamLabel: string | undefined): string;
};

export function serializeSegments(segments: Segment[], dialect: TokenDialect): string {
  return segments.map((s) => (s.kind === "text" ? s.text : dialect.tokenOf(s))).join("");
}

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** `@[Label](nodeId)` — the Instruction field's own format, carrying its own label and target. */
export function mentionDialect(): TokenDialect {
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(MENTION_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        segments.push({ kind: "mention", label: m[1], id: m[2] });
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf: (s) => `@[${s.label}](${s.id})`,
    tokenForId: (id, label) => `@[${label}](${id})`,
    // The stored label is "Type: Name"; the bare name reads better on a chip.
    chipLabel: (s, upstreamLabel) => upstreamLabel ?? s.label.replace(/^[^:]+:\s*/, ""),
  };
}

const IMAGE_REF_RE = /<IMAGE_REF_(\d+)>/g;

/**
 * `<IMAGE_REF_N>` — Omni's own inline syntax, ZERO-based over the attached references.
 *
 * The token carries only a number, so the dialect needs `orderedIds`: the attached images in the
 * order they are sent, which is what N indexes. That list is `visionAttachmentsOf(upstream)` and
 * must be the same one the prompt roster and the reference strip use — a different order here
 * would let the editor draw one photograph on a chip while the token bound another.
 *
 * An index past the end still parses, as a chip with no matching upstream. The editor renders it
 * marked rather than dropping it: the model can invent a token, and that is worth seeing.
 */
export function imageRefDialect(orderedIds: string[]): TokenDialect {
  const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(IMAGE_REF_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        const i = Number(m[1]);
        // `label` is unused by this dialect's own serialization — the id round-trips the index —
        // but the editor reads it for the chip's tooltip and its fallback text.
        segments.push({ kind: "mention", label: m[0], id: orderedIds[i] ?? `__missing_${i}` });
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf(segment) {
      const i = indexOf.get(segment.id);
      // An unknown id is one the model invented. Its own label IS the original token, so echoing
      // it keeps the operator's text byte-identical instead of silently rewriting it to REF 0.
      return i === undefined ? segment.label : `<IMAGE_REF_${i}>`;
    },
    tokenForId(id) {
      const i = indexOf.get(id);
      return i === undefined ? null : `<IMAGE_REF_${i}>`;
    },
    // The reference's own name, exactly as the @ menu and the Instruction's chips show it. A chip
    // must read the same wherever it appears — the index belongs in the tooltip, not on its face.
    chipLabel: (segment, upstreamLabel) => upstreamLabel ?? segment.label,
  };
}

// `\d+` then a boundary — `@image_10` must parse as index 10, not as `@image_1` plus a literal
// "0". The greedy digit run is what guarantees that; do not "tighten" it to `\d`.
const KLING_IMAGE_RE = /@image_(\d+)/g;

/**
 * `@image_N` — Kling's own handle syntax, ONE-based over the attached references.
 *
 * Kling numbers its `contents[].id` fields `image_1`, `image_2`, … (see `buildKlingContents` in
 * providers/kling.ts, which already emits exactly that), so a handle in the prompt binds to a
 * `refer_image` by name rather than by position. Omni's `<IMAGE_REF_N>` is zero-based over the
 * same list. That one-off difference is the entire reason this is a second dialect and not a
 * parameter: getting it wrong binds every citation to its neighbour, silently, in a paid clip.
 *
 * Structured to mirror `imageRefDialect` line for line — same `orderedIds` contract, same
 * unknown-id behaviour (echo the original text rather than rewriting it), same chip label. Read
 * them side by side; a divergence between them is a bug in one of them.
 */
export function klingImageDialect(orderedIds: string[]): TokenDialect {
  const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(KLING_IMAGE_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        const i = Number(m[1]) - 1; // 1-based on the wire, 0-based in orderedIds
        segments.push({ kind: "mention", label: m[0], id: orderedIds[i] ?? `__missing_${i}` });
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf(segment) {
      const i = indexOf.get(segment.id);
      return i === undefined ? segment.label : `@image_${i + 1}`;
    },
    tokenForId(id) {
      const i = indexOf.get(id);
      return i === undefined ? null : `@image_${i + 1}`;
    },
    chipLabel: (segment, upstreamLabel) => upstreamLabel ?? segment.label,
  };
}

// `@Image ` then a greedy digit run. The capital I and the SPACE are both load-bearing: Kling's
// dialect matches `@image_(\d+)`, and these two token shapes differ only by case and that space.
// Do not make this case-insensitive and do not make the space optional.
const SEEDANCE_IMAGE_RE = /@Image (\d+)/g;

/**
 * `@Image N` — Seedance 2.5's own asset handle, ONE-based over the attached references.
 *
 * Structured to mirror `imageRefDialect` and `klingImageDialect` line for line; read all three
 * side by side, because a divergence between them is a bug in one of them. The only intended
 * differences are the token shape and the index base.
 */
export function seedanceImageDialect(orderedIds: string[]): TokenDialect {
  const indexOf = new Map(orderedIds.map((id, i) => [id, i]));
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(SEEDANCE_IMAGE_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        const i = Number(m[1]) - 1;
        segments.push({ kind: "mention", label: m[0], id: orderedIds[i] ?? `__missing_${i}` });
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf(segment) {
      const i = indexOf.get(segment.id);
      return i === undefined ? segment.label : `@Image ${i + 1}`;
    },
    tokenForId(id) {
      const i = indexOf.get(id);
      return i === undefined ? null : `@Image ${i + 1}`;
    },
    chipLabel: (segment, upstreamLabel) => upstreamLabel ?? segment.label,
  };
}

/**
 * The dialect a multishot beat is stored in, given its node's target model.
 *
 * One call site per editor instead of a conditional at each — the editor is one component and the
 * difference between models belongs here, which is what this module exists for.
 */
export function dialectForCapability(
  cap: MultishotCapability,
  orderedIds: string[],
): TokenDialect {
  // Exhaustive switch, no default: a new dialect is a COMPILE error here rather than a silent
  // fall back to Omni's tokens (D245).
  switch (cap.refTokenDialect) {
    case "kling-image": return klingImageDialect(orderedIds);
    case "seedance-image": return seedanceImageDialect(orderedIds);
    case "image-ref": return imageRefDialect(orderedIds);
  }
}
