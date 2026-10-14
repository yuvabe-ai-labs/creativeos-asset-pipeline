import { scriptDocSchema, type ScriptDoc } from "../schema";
import type { ScriptNotes } from "./schema";

// Spec 2 §9 — one addressable text field of a script or its notes. Typing, inline AI edits, undo
// and the copilot's set_field operation all write through writeField, so a value is validated the
// same way whoever writes it. Shots and cast are addressed by id, never by position.

const HEADER_TEXT = ["title", "format", "region", "postDate", "theme", "aspect", "targetLength", "production"] as const;
const CONTEXT_TEXT = ["purpose", "settingAndCamera", "disclaimers"] as const;
const CAST_TEXT = ["name", "description"] as const;
const SHOT_TEXT = ["beat", "visual", "vo", "onScreenText", "lengthSeconds"] as const;
type HeaderText = (typeof HEADER_TEXT)[number];
type ContextText = (typeof CONTEXT_TEXT)[number];
type CastText = (typeof CAST_TEXT)[number];
type ShotText = (typeof SHOT_TEXT)[number];

export type FieldTarget =
  | { kind: "header"; field: HeaderText }
  | { kind: "reelNumber" }
  | { kind: "context"; field: ContextText }
  | { kind: "watchOut"; index: number }
  | { kind: "cast"; castId: string; field: CastText }
  | { kind: "shot"; shotId: string; field: ShotText }
  | { kind: "notes" }
  | { kind: "confirm"; itemId: string };

export const HEADER_LABEL: Record<HeaderText, string> = {
  title: "Title", format: "Format", region: "Region", postDate: "Post date", theme: "Theme",
  aspect: "Aspect", targetLength: "Target length", production: "Production",
};
const CONTEXT_LABEL: Record<ContextText, string> = { purpose: "Purpose", settingAndCamera: "Setting and camera", disclaimers: "Disclaimers" };
const SHOT_LABEL: Record<ShotText, string> = { beat: "beat", visual: "visual", vo: "VO", onScreenText: "on-screen text", lengthSeconds: "length" };

const oneOf = <T extends string>(list: readonly T[], v: string | undefined): v is T =>
  v !== undefined && (list as readonly string[]).includes(v);

export function parseFieldPath(path: string): FieldTarget | null {
  const parts = path.split(".");
  const [head, a, b] = parts;
  if (head === "header" && parts.length === 2) {
    if (a === "reelNumber") return { kind: "reelNumber" };
    if (oneOf(HEADER_TEXT, a)) return { kind: "header", field: a };
  }
  if (head === "context" && parts.length === 2 && oneOf(CONTEXT_TEXT, a)) return { kind: "context", field: a };
  if (head === "context" && parts.length === 3 && a === "watchOuts" && /^\d+$/.test(b)) return { kind: "watchOut", index: Number(b) };
  if (head === "cast" && parts.length === 3 && a && oneOf(CAST_TEXT, b)) return { kind: "cast", castId: a, field: b };
  if (head === "shots" && parts.length === 3 && a && oneOf(SHOT_TEXT, b)) return { kind: "shot", shotId: a, field: b };
  if (head === "notes" && parts.length === 2 && a === "brief") return { kind: "notes" };
  if (head === "notes" && parts.length === 3 && a === "confirm" && b) return { kind: "confirm", itemId: b };
  return null;
}

export function readField(doc: ScriptDoc | null, notes: ScriptNotes, t: FieldTarget): string | null {
  if (t.kind === "notes") return notes.brief;
  if (t.kind === "confirm") {
    const item = notes.confirmations.find((c) => c.id === t.itemId);
    return item ? (item.confirmed ? "yes" : "no") : null;
  }
  if (!doc) return null;
  switch (t.kind) {
    case "header": return doc.header[t.field];
    case "reelNumber": return doc.header.reelNumber === null ? "" : String(doc.header.reelNumber);
    case "context": return doc.context[t.field];
    case "watchOut": return doc.context.watchOuts[t.index] ?? null;
    case "cast": return doc.cast.find((c) => c.id === t.castId)?.[t.field] ?? null;
    case "shot": {
      const shot = doc.shots.find((s) => s.id === t.shotId);
      return shot ? String(shot[t.field]) : null;
    }
  }
}

type Written = { doc: ScriptDoc | null; notes: ScriptNotes } | { error: string };

export function writeField(doc: ScriptDoc | null, notes: ScriptNotes, t: FieldTarget, value: string): Written {
  if (t.kind === "notes") return { doc, notes: { ...notes, brief: value.slice(0, 8000) } };
  if (t.kind === "confirm") {
    if (!notes.confirmations.some((c) => c.id === t.itemId)) return { error: "That item is gone." };
    const confirmed = value.trim().toLowerCase() === "yes";
    return { doc, notes: { ...notes, confirmations: notes.confirmations.map((c) => (c.id === t.itemId ? { ...c, confirmed } : c)) } };
  }
  if (!doc) return { error: "There's no draft yet." };

  let next: ScriptDoc;
  switch (t.kind) {
    case "header":
      next = { ...doc, header: { ...doc.header, [t.field]: value } };
      break;
    case "reelNumber": {
      const v = value.trim();
      if (v !== "" && !/^\d+$/.test(v)) return { error: "The reel number is a whole number." };
      next = { ...doc, header: { ...doc.header, reelNumber: v === "" ? null : Number(v) } };
      break;
    }
    case "context":
      next = { ...doc, context: { ...doc.context, [t.field]: value } };
      break;
    case "watchOut": {
      const count = doc.context.watchOuts.length;
      if (t.index > count) return { error: "That watch-out is gone." };
      // Index `count` is the "Add a watch-out" slot: a typed value appends, an empty one is a no-op.
      if (t.index === count && value.trim() === "") return { doc, notes };
      const watchOuts = t.index === count
        ? [...doc.context.watchOuts, value]
        : value.trim() === ""
          ? doc.context.watchOuts.filter((_, i) => i !== t.index)
          : doc.context.watchOuts.map((w, i) => (i === t.index ? value : w));
      next = { ...doc, context: { ...doc.context, watchOuts } };
      break;
    }
    case "cast":
      if (!doc.cast.some((c) => c.id === t.castId)) return { error: "That person is gone." };
      next = { ...doc, cast: doc.cast.map((c) => (c.id === t.castId ? { ...c, [t.field]: value } : c)) };
      break;
    case "shot": {
      if (!doc.shots.some((s) => s.id === t.shotId)) return { error: "That shot is gone." };
      let v: string | number = value;
      if (t.field === "lengthSeconds") {
        const n = Number(value.trim().replace(/s$/i, "").trim());
        if (!Number.isFinite(n) || n < 0.1 || n > 60) return { error: "A shot's length is a number of seconds, from 0.1 to 60." };
        v = Math.round(n * 10) / 10;
      }
      next = { ...doc, shots: doc.shots.map((s) => (s.id === t.shotId ? { ...s, [t.field]: v } : s)) };
      break;
    }
    default:
      return { error: "Unknown field." };
  }
  const parsed = scriptDocSchema.safeParse(next);
  if (!parsed.success) return { error: `That change isn't allowed: ${parsed.error.issues[0]?.message ?? "invalid value"}.` };
  return { doc: parsed.data, notes };
}

export function fieldLabel(doc: ScriptDoc | null, t: FieldTarget): string {
  switch (t.kind) {
    case "header": return HEADER_LABEL[t.field];
    case "reelNumber": return "Reel number";
    case "context": return CONTEXT_LABEL[t.field];
    case "watchOut": return `Watch-out ${t.index + 1}`;
    case "cast": {
      const name = doc?.cast.find((c) => c.id === t.castId)?.name ?? "This person";
      return t.field === "name" ? `${name}'s name` : `${name}'s description`;
    }
    case "shot": {
      const i = doc?.shots.findIndex((s) => s.id === t.shotId) ?? -1;
      return `${i >= 0 ? `S${i + 1}` : "The shot"} ${SHOT_LABEL[t.field]}`;
    }
    case "notes": return "the reel's notes";
    case "confirm": return "an item to confirm";
  }
}
