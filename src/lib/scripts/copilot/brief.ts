import { reelLabel } from "../utils";
import type { Extraction } from "./output";
import type { Angle, Brief, ConfirmationCard, CopilotAvatar, OpenItem, Piece, ScriptNotes } from "./schema";

// Spec 2 §5 / interaction model §3.0 — the four pieces, asked in a fixed order, skipping anything
// already given; any or all can be skipped and the copilot proposes them. The code decides the next
// step; the model only reads the person's answer and fills what the step needs (D327).

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
  if (!isFounderLed(brief.format.value) && brief.lead.status === null) return { kind: "ask", piece: "lead" };
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
    next = applyAngle(next, picked, "given");
    changed = true;
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

/** Three angles, lettered A to C, citing only signals and avatars that exist (Review Focus 3). */
export function normalizeAngles(raw: Angle[], signalIds: ReadonlySet<string>, avatarIds: ReadonlySet<string>): Angle[] {
  return raw.slice(0, 3).map((a, i) => ({
    ...a,
    id: "ABC"[i],
    signalIds: [...new Set(a.signalIds.filter((id) => signalIds.has(id)))],
    leadAvatarId: a.leadAvatarId && avatarIds.has(a.leadAvatarId) ? a.leadAvatarId : null,
  }));
}

export function normalizeCard(raw: ConfirmationCard, opts: { reelNumber: number; avatarIds: ReadonlySet<string> }): ConfirmationCard {
  const marked = raw.cast.findIndex((c) => c.isLead);
  const lead = marked >= 0 ? marked : 0;
  return {
    title: raw.title.trim().slice(0, 120) || "Untitled reel",
    reelNumber: opts.reelNumber,
    lines: raw.lines.filter((l) => l.label.trim() && l.value.trim()),
    cast: raw.cast.map((c, i) => ({ ...c, isLead: i === lead, avatarId: c.avatarId && opts.avatarIds.has(c.avatarId) ? c.avatarId : null })),
    toConfirm: raw.toConfirm.map((t) => t.trim()).filter(Boolean),
  };
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export function questionFor(piece: "format" | "occasion" | "lead", ctx: { formats: string[]; avatars: CopilotAvatar[] }): string {
  switch (piece) {
    case "format":
      return `What format is this reel?${ctx.formats.length ? ` The library has ${list(ctx.formats)}.` : ""} Add "option" for the monthly away-from-home or younger reel, or describe a new format in your own words. Or skip it and I'll infer it from the narrative.`;
    case "occasion":
      return "What's the occasion or theme, and the post date if you have one? Skip it and I'll propose one from the season.";
    case "lead":
      return `Who leads? ${ctx.avatars.length ? `From the client's avatars: ${list(ctx.avatars.map((a) => a.name))}. ` : ""}Or name someone new, or skip it and I'll cast it.`;
  }
}

export function openingMessage(ctx: { clientName: string; formats: string[]; hasKb: boolean }): string {
  const kb = ctx.hasKb ? `${ctx.clientName}'s brand KB, house rules included` : `what you tell me (${ctx.clientName} has no brand KB yet)`;
  const formats = ctx.formats.length ? `, and the formats in its scripts: ${list(ctx.formats)}` : "";
  return [
    `I'm working from ${kb}${formats}. Before I write, I need four things, in this order: the format, the occasion or theme, who leads, and the angle. Skip any of them, or say "take it from here", and I'll propose the rest.`,
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
