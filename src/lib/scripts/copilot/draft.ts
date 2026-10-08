import { scriptDocSchema, type CastMember, type ScriptDoc, type Shot } from "../schema";
import type { DraftOutput, ShotFields } from "./output";

// Spec 2 §7 — the model's first draft becomes a valid spec 1 script. The model never writes ids
// (D330); a slightly-off draft is repaired here rather than rejected (Review Focus 3).

const cut = (s: string, n: number) => s.trim().slice(0, n).trim();
const beatKey = (beat: string) => beat.trim().toUpperCase();

/** A shot's length, in tenths of a second, from 0.1 to 60; nonsense becomes 1 second. */
export function clampLength(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(60, Math.max(0.1, Math.round(n * 10) / 10));
}

export function castIdFor(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "person";
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

/** A shot id that is not in `taken` (and is then added to it). Random, so an id removed in an
 *  earlier edit is never handed to a new shot (spec 3 keys panels by shot id). */
export function newShotId(taken: Set<string>): string {
  let id: string;
  do id = `s${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  while (taken.has(id));
  taken.add(id);
  return id;
}

/** The carry rule (D326): a later shot in a beat that repeats the beat's VO line or card leaves it
 *  empty, so the parse does not map the line twice. */
export function carryShot(shots: Shot[], index: number): Shot {
  const shot = shots[index];
  let first = index;
  while (first > 0 && beatKey(shots[first - 1].beat) === beatKey(shot.beat)) first--;
  if (first === index) return shot;
  const head = shots[first];
  return {
    ...shot,
    vo: shot.vo.trim() && shot.vo.trim() === head.vo.trim() ? "" : shot.vo,
    onScreenText: shot.onScreenText.trim() && shot.onScreenText.trim() === head.onScreenText.trim() ? "" : shot.onScreenText,
  };
}

export function toShot(id: string, f: ShotFields, resolve: (ref: string) => string | null): Shot {
  const onScreen = [...new Set(f.onScreen.map(resolve).filter((x): x is string => x !== null))];
  return {
    id,
    beat: cut(f.beat, 40),
    lengthSeconds: clampLength(f.lengthSeconds),
    visual: cut(f.visual, 2000),
    vo: cut(f.vo, 1000),
    onScreenText: cut(f.onScreenText, 500),
    onScreen,
  };
}

export function toScriptDoc(draft: DraftOutput, opts: { reelNumber: number | null; avatarIds: ReadonlySet<string> }): ScriptDoc {
  if (draft.cast.length === 0) throw new Error("The draft came back with no cast.");
  if (draft.shots.length === 0) throw new Error("The draft came back with no shots.");

  const taken = new Set<string>();
  const byRef = new Map<string, string>();
  const marked = draft.cast.findIndex((c) => c.isLead);
  const leadIndex = marked >= 0 ? marked : 0;
  const cast: CastMember[] = draft.cast.map((c, i) => {
    const name = cut(c.name, 80) || `Person ${i + 1}`;
    const id = castIdFor(name, taken);
    byRef.set(c.key.trim().toLowerCase(), id);
    byRef.set(name.toLowerCase(), id);
    return {
      id,
      name,
      description: cut(c.description, 2000),
      avatarId: c.avatarId && opts.avatarIds.has(c.avatarId) ? c.avatarId : null,
      isLead: i === leadIndex,
    };
  });
  const resolve = (ref: string) => byRef.get(ref.trim().toLowerCase()) ?? null;
  const raw = draft.shots.map((s, i) => toShot(`s${String(i + 1).padStart(2, "0")}`, s, resolve));

  const h = draft.header;
  return scriptDocSchema.parse({
    header: {
      reelNumber: opts.reelNumber,
      title: cut(h.title, 120) || "Untitled reel",
      format: cut(h.format, 60),
      region: cut(h.region, 60),
      postDate: cut(h.postDate, 80),
      theme: cut(h.theme, 120),
      aspect: cut(h.aspect, 20),
      targetLength: cut(h.targetLength, 40),
      production: cut(h.production, 40),
    },
    context: {
      purpose: cut(draft.context.purpose, 2000),
      settingAndCamera: cut(draft.context.settingAndCamera, 2000),
      disclaimers: cut(draft.context.disclaimers, 2000),
      watchOuts: draft.context.watchOuts.map((w) => cut(w, 1000)).filter(Boolean),
    },
    cast,
    shots: raw.map((_, i) => carryShot(raw, i)),
  });
}
