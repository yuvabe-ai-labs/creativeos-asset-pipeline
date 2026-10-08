import type { ScriptDoc } from "../schema";
import { castIdFor, clampLength } from "./draft";
import { shotFieldsSchema, type ShotFields } from "./output";

// Streaming the first draft (D336, refined): the model's JSON arrives a few characters at a time.
// These turn an unfinished prefix into what can be shown so far: the header, the cast, and every
// shot that has finished arriving. Display only: the saved script still goes through toScriptDoc.

export type PartialDraft = {
  header: Record<string, string>;
  context: { purpose?: string; settingAndCamera?: string; disclaimers?: string; watchOuts?: string[] };
  cast: { key: string; name: string; description: string; isLead: boolean }[];
  shots: ShotFields[];
};

/** Closes whatever is open (a string, objects, arrays) and drops a dangling comma, colon or key, so
 *  the prefix parses. Backs off to an earlier comma when the end is not yet a whole value. */
export function completeJson(text: string): string {
  let t = text;
  for (let attempt = 0; attempt < 40; attempt++) {
    const closed = close(t);
    try {
      JSON.parse(closed);
      return closed;
    } catch {
      const cut = backOff(t);
      if (cut === null) return "null";
      t = cut;
    }
  }
  return "null";
}

function close(t: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of t) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = t;
  if (inString) out = (escaped ? out.slice(0, -1) : out) + '"';
  out = out.replace(/[\s,:]+$/, "");
  return out + stack.reverse().join("");
}

function backOff(t: string): string | null {
  const comma = t.lastIndexOf(",");
  if (comma > 0) return t.slice(0, comma);
  const open = Math.max(t.lastIndexOf("{"), t.lastIndexOf("["));
  if (open >= 0 && open < t.length - 1) return t.slice(0, open + 1);
  return null;
}

const str = (v: unknown): v is string => typeof v === "string";

export function parsePartialDraft(text: string): PartialDraft | null {
  let obj: unknown;
  try {
    obj = JSON.parse(completeJson(text));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const header: Record<string, string> = {};
  if (o.header && typeof o.header === "object") {
    for (const [k, v] of Object.entries(o.header)) if (str(v)) header[k] = v;
  }
  const ctx = (o.context && typeof o.context === "object" ? o.context : {}) as Record<string, unknown>;
  const context: PartialDraft["context"] = {
    ...(str(ctx.purpose) ? { purpose: ctx.purpose } : {}),
    ...(str(ctx.settingAndCamera) ? { settingAndCamera: ctx.settingAndCamera } : {}),
    ...(str(ctx.disclaimers) ? { disclaimers: ctx.disclaimers } : {}),
    ...(Array.isArray(ctx.watchOuts) ? { watchOuts: ctx.watchOuts.filter(str) } : {}),
  };
  const cast = (Array.isArray(o.cast) ? o.cast : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && str((c as Record<string, unknown>).name))
    .map((c) => ({ key: str(c.key) ? c.key : "", name: c.name as string, description: str(c.description) ? c.description : "", isLead: c.isLead === true }));

  // A shot is shown once it has fully arrived: while the list is still open, its last entry may be
  // half a shot. The schema puts `summary` after `shots`, so its key means the list is closed.
  const rawShots = Array.isArray(o.shots) ? o.shots : [];
  const shotsAt = text.lastIndexOf('"shots"');
  const listClosed = shotsAt >= 0 && /"summary"\s*:/.test(text.slice(shotsAt));
  const shots = (listClosed ? rawShots : rawShots.slice(0, -1))
    .map((s) => shotFieldsSchema.safeParse(s))
    .flatMap((r) => (r.success ? [r.data] : []));

  if (Object.keys(header).length === 0 && cast.length === 0 && shots.length === 0) return null;
  return { header, context, cast, shots };
}

/** A read-only script to draw while the draft streams. Not validated and never saved. */
export function previewDoc(p: PartialDraft): ScriptDoc {
  const taken = new Set<string>();
  const byRef = new Map<string, string>();
  const cast = p.cast.map((c, i) => {
    const id = castIdFor(c.name || `Person ${i + 1}`, taken);
    if (c.key) byRef.set(c.key.toLowerCase(), id);
    byRef.set(c.name.toLowerCase(), id);
    return { id, name: c.name, description: c.description, avatarId: null, isLead: c.isLead };
  });
  const h = p.header;
  return {
    header: {
      reelNumber: null,
      title: h.title?.trim() || "Writing the first draft…",
      format: h.format ?? "", region: h.region ?? "", postDate: h.postDate ?? "", theme: h.theme ?? "",
      aspect: h.aspect ?? "", targetLength: h.targetLength ?? "", production: h.production ?? "",
    },
    context: {
      purpose: p.context.purpose ?? "",
      settingAndCamera: p.context.settingAndCamera ?? "",
      disclaimers: p.context.disclaimers ?? "",
      watchOuts: p.context.watchOuts ?? [],
    },
    cast,
    shots: p.shots.map((s, i) => ({
      id: `preview-${i + 1}`,
      beat: s.beat,
      lengthSeconds: clampLength(s.lengthSeconds),
      visual: s.visual,
      vo: s.vo,
      onScreenText: s.onScreenText,
      onScreen: s.onScreen.map((r) => byRef.get(r.trim().toLowerCase())).filter((x): x is string => !!x),
    })),
  };
}
