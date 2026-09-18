// D272 / BUG-010 — prompt text stores WHICH image it cites, not WHERE that image sits.
//
// A generated prompt used to store positions (`<IMAGE_REF_1>`, `@Image 2`, `@image_2`), and every
// reader resolved them against the images connected NOW. Disconnect the first of three and the
// second's citation bound to the third — silently, in a paid clip. The Instruction field never
// drifted because it stores `@[Label](nodeId)`. Now generated text does too: positions exist only
// at the boundary with a writer or a video model, computed over the images connected at that moment.
import {
  mentionDialect,
  imageRefDialect,
  seedanceImageDialect,
  type Segment,
  type TokenDialect,
} from "./prompt-token-dialect";
import { visionAttachmentsOf } from "./compose-message";

export type RefEntry = { id: string; label: string };

// A positional token past the end of the roster — the model invented it, or it predates a removal
// with no stored id. The model dialects give it this id prefix and echo its original text.
const MISSING_PREFIX = "__missing_";
const isInvented = (id: string) => id.startsWith(MISSING_PREFIX);

const MENTION = mentionDialect();

/** "File: Sandals.png" → "Sandals.png". The stored label is "Type: Name", like the Instruction's. */
export function refDisplayName(label: string): string {
  return label.replace(/^[^:]+:\s*/, "");
}

/**
 * The dialect generated prompt text is EDITED and STORED in. Reads both forms — `@[Label](id)`
 * and the model's own positional tokens (resolved via `model`, i.e. the current order, exactly as
 * before) — and always writes `@[Label](id)`. So an old prompt still shows its chips, and the first
 * save converts it: no migration.
 */
export function storedRefDialect(
  model: TokenDialect,
  labelOf: (id: string) => string | undefined = () => undefined,
): TokenDialect {
  return {
    parse(value) {
      const out: Segment[] = [];
      for (const seg of MENTION.parse(value)) {
        if (seg.kind === "mention") {
          out.push(seg);
          continue;
        }
        for (const inner of model.parse(seg.text)) {
          out.push(
            inner.kind === "mention" && !isInvented(inner.id)
              ? { ...inner, label: labelOf(inner.id) ?? inner.label }
              : inner,
          );
        }
      }
      return out;
    },
    // An invented position has no image to name; echo its original text rather than minting an
    // id-shaped token that would claim a binding it never had.
    tokenOf: (s) => (isInvented(s.id) ? s.label : MENTION.tokenOf(s)),
    tokenForId: (id, label) => MENTION.tokenForId(id, label),
    chipLabel: (s, upstreamLabel) => upstreamLabel ?? refDisplayName(s.label),
  };
}

/** Writer output (positions, in the order the writer was sent) → stored form (ids). */
export function toStoredRefs(
  text: string,
  model: TokenDialect,
  labelOf: (id: string) => string | undefined,
): string {
  const stored = storedRefDialect(model, labelOf);
  return stored
    .parse(text)
    .map((s) => (s.kind === "text" ? s.text : stored.tokenOf(s)))
    .join("");
}

/**
 * Stored form → the model's positions over the images connected now (`model` is built from that
 * order). A cited image that is no longer connected is reported in `missing` and written as its
 * plain name — never renumbered onto whichever image now sits in its old slot.
 */
export function renderRefs(
  text: string,
  model: TokenDialect,
): { text: string; missing: RefEntry[] } {
  const missing: RefEntry[] = [];
  const parts = storedRefDialect(model)
    .parse(text)
    .map((s) => {
      if (s.kind === "text") return s.text;
      if (isInvented(s.id)) return s.label; // legacy / invented: behave exactly as before
      const token = model.tokenForId(s.id, s.label);
      if (token !== null) return token;
      if (!missing.some((m) => m.id === s.id)) missing.push({ id: s.id, label: s.label });
      return refDisplayName(s.label);
    });
  return { text: parts.join(""), missing };
}

/** The ids a text cites, from either form, in first-seen order. */
export function citedRefIds(text: string, model: TokenDialect): string[] {
  const seen: string[] = [];
  for (const s of storedRefDialect(model).parse(text)) {
    if (s.kind === "mention" && !isInvented(s.id) && !seen.includes(s.id)) seen.push(s.id);
  }
  return seen;
}

export function missingRefsMessage(missing: RefEntry[]): string {
  const names = missing.map((m) => `'${refDisplayName(m.label)}'`);
  if (names.length === 1) {
    return `${names[0]} is cited in the prompt but no longer connected — reconnect it or regenerate the prompt.`;
  }
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} are cited in the prompt but no longer connected — reconnect them or regenerate the prompt.`;
}

/**
 * The positional dialect a single-take motion prompt is written in for `target` (a
 * VideoPromptTarget), or null for the prose targets (Veo, Kling), whose "the first image" cannot be
 * converted and stays out of scope.
 */
export function singleTakeRefDialect(
  target: string | undefined,
  ids: string[],
): TokenDialect | null {
  if (target === "gemini-omni") return imageRefDialect(ids);
  if (target === "seedance") return seedanceImageDialect(ids);
  return null;
}

/** The references a writer is sent, in the order it numbers them, each with a stored label. */
export function refEntriesOf(
  previews: Array<{
    nodeId: string;
    label: string;
    type: string;
    fileUrl?: string;
    fileKind?: string;
    useLlm?: boolean;
    name?: string;
  }>,
): RefEntry[] {
  return visionAttachmentsOf(previews).map((u) => ({
    id: u.nodeId,
    label: u.name ? `${u.label}: ${u.name}` : u.label,
  }));
}
