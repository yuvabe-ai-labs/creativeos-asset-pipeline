import { reelLabel } from "../utils";
import type { Extraction } from "./output";
import type { Angle, Brief, ConfirmationCard, CopilotAvatar, OpenItem, Piece, ScriptNotes } from "./schema";

// Spec 2 §5 / interaction model §3.0 — the four pieces, asked in a fixed order, skipping anything
// already given; any or all can be skipped and the copilot proposes them. The code decides the next
// step; the model only reads the person's answer and fills what the step needs (D328).

export function isFounderLed(format: string): boolean {
  return /founder/i.test(format);
}

export type Step =
  | { kind: "ask"; piece: "format" | "occasion" | "lead" }
  | { kind: "angles" }
  | { kind: "card" }
  | { kind: "confirm" }
  | { kind: "edit" };

export function nextStep(brief: Brief, hasDoc: boolean): Step {
  if (hasDoc || brief.phase === "written") return { kind: "edit" };
  if (brief.format.status === null) return { kind: "ask", piece: "format" };
  if (brief.occasion.status === null) return { kind: "ask", piece: "occasion" };
  // Every format asks: a Founder-led reel's founder is a saved avatar too, picked, not guessed (D362).
  if (brief.lead.status === null) return { kind: "ask", piece: "lead" };
  // A skipped narrative still gets three proposed angles (and the copilot picks one).
  if (!brief.narrative.value.trim()) return { kind: "angles" };
  if (!brief.card) return { kind: "card" };
  return { kind: "confirm" };
}

export function angleText(a: Angle): string {
  return `${a.id}. ${a.hook.trim()}: ${a.situation.trim()}`;
}

/** The angle becomes the narrative; it fills every piece the person left empty or skipped, marked
 *  "proposed". A piece the person gave is never overwritten. */
export function applyAngle(brief: Brief, a: Angle, status: "given" | "proposed"): Brief {
  const fill = (p: Piece, v: string): Piece => (p.value.trim() || !v.trim() ? p : { value: v.trim(), status: "proposed" });
  const leadFilled = !brief.lead.value.trim() && a.lead.trim() !== "";
  return {
    ...brief,
    narrative: { value: angleText(a), status },
    format: fill(brief.format, a.format),
    occasion: fill(brief.occasion, a.occasion),
    postDate: brief.postDate.trim() || a.postDate.trim(),
    lead: fill(brief.lead, a.lead),
    leadAvatarId: leadFilled ? a.leadAvatarId : brief.leadAvatarId,
  };
}

export type Merge = { brief: Brief; changed: boolean; cardChange: string };

export function mergeExtraction(brief: Brief, ex: Extraction, avatarIds: ReadonlySet<string>): Merge {
  let changed = false;
  const take = (piece: Piece, a: { action: "given" | "skip" | "none"; value: string }): Piece => {
    if (a.action === "given" && a.value.trim()) {
      if (piece.value !== a.value.trim()) changed = true;
      return { value: a.value.trim(), status: "given" };
    }
    if (a.action === "skip" && piece.status === null) return { value: "", status: "skipped" };
    return piece;
  };

  let next: Brief = { ...brief, format: take(brief.format, ex.format), occasion: take(brief.occasion, ex.occasion), lead: take(brief.lead, ex.lead) };
  if (ex.occasion.action === "given" && ex.occasion.postDate.trim()) next = { ...next, postDate: ex.occasion.postDate.trim() };
  if (ex.lead.action === "given" && ex.lead.value.trim()) {
    next = { ...next, leadAvatarId: ex.lead.avatarId && avatarIds.has(ex.lead.avatarId) ? ex.lead.avatarId : null };
  }

  const letter = ex.narrative.angleId?.trim().toUpperCase();
  const picked = letter ? brief.angles.find((a) => a.id.toUpperCase() === letter) : undefined;
  if (picked) {
    // The reader often names the chosen angle again on a later message ("write it" read back as
    // "angle A"). Picking the angle that is already the narrative changes nothing; counting it as a
    // change rebuilt the card on every "write it", so the draft was never written.
    if (brief.narrative.value !== angleText(picked)) {
      next = applyAngle(next, picked, "given");
      changed = true;
    }
  } else {
    next = { ...next, narrative: take(next.narrative, ex.narrative) };
  }

  if (ex.skipAll) {
    for (const key of ["format", "occasion", "lead", "narrative"] as const) {
      if (next[key].status === null) next = { ...next, [key]: { value: "", status: "skipped" } };
    }
  }
  if (ex.reelNumber !== null && Number.isInteger(ex.reelNumber) && ex.reelNumber > 0 && ex.reelNumber !== next.reelNumber) {
    next = { ...next, reelNumber: ex.reelNumber };
    changed = true;
  }
  return { brief: next, changed, cardChange: ex.cardChange.trim() };
}

/** The short name a signal goes by in the angles prompt: S1 for the first, S2 for the second. The
 *  model answers with these, never the uuids, which it would have to copy exactly. */
export const signalHandle = (index: number) => `S${index + 1}`;

/** Three angles, lettered A to C, citing only signals and avatars that exist (Review Focus 3). Each
 *  signal handle the model gave is read back into that signal's id; anything else is dropped. */
export function normalizeAngles(raw: Angle[], signals: readonly { id: string }[], avatarIds: ReadonlySet<string>): Angle[] {
  const byHandle = new Map(signals.map((s, i) => [signalHandle(i), s.id]));
  const resolve = (handle: string) => byHandle.get(handle.trim().toUpperCase());
  return raw.slice(0, 3).map((a, i) => ({
    ...a,
    id: "ABC"[i],
    signalIds: [...new Set(a.signalIds.map(resolve).filter((id): id is string => id !== undefined))],
    leadAvatarId: a.leadAvatarId && avatarIds.has(a.leadAvatarId) ? a.leadAvatarId : null,
  }));
}

/** `lead`, when the person picked the lead's avatar, overrides whoever the model put first: the
 *  card leads with that avatar, by its name (D362). */
export function normalizeCard(
  raw: ConfirmationCard,
  opts: { reelNumber: number; avatarIds: ReadonlySet<string>; lead?: { avatarId: string; name: string } | null },
): ConfirmationCard {
  const marked = raw.cast.findIndex((c) => c.isLead);
  const lead = marked >= 0 ? marked : 0;
  return {
    title: raw.title.trim().slice(0, 120) || "Untitled reel",
    reelNumber: opts.reelNumber,
    lines: raw.lines.filter((l) => l.label.trim() && l.value.trim()),
    cast: raw.cast.map((c, i) => {
      const member = { ...c, isLead: i === lead, avatarId: c.avatarId && opts.avatarIds.has(c.avatarId) ? c.avatarId : null };
      return i === lead && opts.lead ? { ...member, name: opts.lead.name, avatarId: opts.lead.avatarId } : member;
    }),
    toConfirm: raw.toConfirm.map((t) => t.trim()).filter(Boolean),
  };
}

export function questionFor(piece: "format" | "occasion" | "lead", ctx: { formats: string[]; avatars: CopilotAvatar[] }): string {
  switch (piece) {
    // The options and the skip are chips under the message (suggestions.ts), so the prose never
    // repeats them: it asks, and says only what a chip can't (describe your own, name someone new).
    case "format":
      return ctx.formats.length ? "What format is this reel? Pick one below or describe your own." : "What format is this reel? Describe it in a few words.";
    case "occasion":
      return "What's the occasion or theme, and the post date if you have one?";
    case "lead":
      return ctx.avatars.length ? "Who leads? Pick an avatar below or name someone new." : "Who leads? Name someone.";
  }
}

export function openingMessage(ctx: { clientName: string; formats: string[]; hasKb: boolean }): string {
  const source = ctx.hasKb
    ? `Working from ${ctx.clientName}'s brand KB, house rules included.`
    : `${ctx.clientName} has no brand KB yet, so I'm working from what you tell me.`;
  return [
    source,
    "Four things before I write: format, occasion, who leads, angle.",
    questionFor("format", { formats: ctx.formats, avatars: [] }),
  ].join("\n\n");
}

/** "The confirmed brief becomes the reel's notes" plus the items to confirm (spec 2 §4.2, §5). */
export function cardToNotes(card: ConfirmationCard): ScriptNotes {
  const reel = reelLabel(card.reelNumber);
  const lines = [
    `${card.title}${reel ? ` · ${reel}` : ""}`,
    ...card.lines.map((l) => `${l.label}: ${l.value}${l.source === "proposed" ? " (proposed)" : ""}`),
    "Cast:",
    ...card.cast.map((c) => `- ${c.name}${c.isLead ? " (lead)" : ""}: ${c.role}`),
  ];
  return {
    brief: lines.join("\n").slice(0, 8000),
    confirmations: card.toConfirm.slice(0, 20).map((text, i) => ({ id: `c${i + 1}`, text: text.slice(0, 500), confirmed: false })),
  };
}

export function openItemsLine(items: OpenItem[]): string {
  if (items.length === 0) return "Nothing is left open: it's ready to mark final.";
  return `${items.length} thing${items.length === 1 ? "" : "s"} to settle before it's final. First: ${items[0].question}`;
}
