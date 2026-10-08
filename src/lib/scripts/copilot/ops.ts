import { scriptDocSchema, type ScriptDoc, type Shot } from "../schema";
import type { EditOp } from "./output";
import type { ScriptNotes } from "./schema";
import { parseFieldPath, writeField } from "./fields";
import { carryShot, castIdFor, toShot } from "./draft";

// Spec 2 §9 — a copilot edit is a list of typed operations applied here, all or nothing (D331).
// Anything an operation does not name is carried over untouched, so "only the targeted part
// changes" holds by construction. Shot ids follow the rules spec 3 keys panels by (D330).

export type OpsGen = { newShotId: (taken: Set<string>) => string; avatarIds: ReadonlySet<string> };
export type OpsResult =
  | { ok: true; doc: ScriptDoc; notes: ScriptNotes; touchedShotIds: string[] }
  | { ok: false; error: string };

class OpError extends Error {}
const need = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new OpError(`it needs ${what}`);
  return value;
};
const cut = (s: string, n: number) => s.trim().slice(0, n).trim();

type Work = { doc: ScriptDoc; notes: ScriptNotes; taken: Set<string>; touched: Set<string>; gen: OpsGen };

function shotIndex(doc: ScriptDoc, id: string): number {
  const i = doc.shots.findIndex((s) => s.id === id);
  if (i < 0) throw new OpError(`there is no shot "${id}"`);
  return i;
}
function castOf(doc: ScriptDoc, id: string) {
  const c = doc.cast.find((m) => m.id === id);
  if (!c) throw new OpError(`there is no cast member "${id}"`);
  return c;
}
function resolver(doc: ScriptDoc) {
  return (ref: string) => {
    const r = ref.trim().toLowerCase();
    return doc.cast.find((c) => c.id === r || c.name.toLowerCase() === r)?.id ?? null;
  };
}
const withShots = (doc: ScriptDoc, shots: Shot[]): ScriptDoc => ({ ...doc, shots });

function applyOne(w: Work, op: EditOp): void {
  const { doc } = w;
  switch (op.op) {
    case "set_field": {
      const target = parseFieldPath(need(op.path, "a path"));
      if (!target) throw new OpError(`"${op.path}" is not a field it can change`);
      const out = writeField(doc, w.notes, target, need(op.value, "a value"));
      if ("error" in out) throw new OpError(out.error);
      w.doc = out.doc ?? doc;
      w.notes = out.notes;
      if (target.kind === "shot") w.touched.add(target.shotId);
      return;
    }
    case "update_shot": {
      const id = need(op.shotId, "a shot id");
      const i = shotIndex(doc, id);
      const shots = [...doc.shots];
      shots[i] = toShot(id, need(op.shot, "the shot"), resolver(doc));
      w.doc = withShots(doc, shots);
      w.touched.add(id);
      return;
    }
    case "insert_shot": {
      const at = op.afterShotId === null ? 0 : shotIndex(doc, op.afterShotId) + 1;
      const id = w.gen.newShotId(w.taken);
      const shots = [...doc.shots];
      shots.splice(at, 0, toShot(id, need(op.shot, "the shot"), resolver(doc)));
      w.doc = withShots(doc, shots);
      w.touched.add(id);
      return;
    }
    case "remove_shot": {
      const id = need(op.shotId, "a shot id");
      const i = shotIndex(doc, id);
      if (doc.shots.length === 1) throw new OpError("a script needs at least one shot");
      w.doc = withShots(doc, doc.shots.filter((_, j) => j !== i));
      w.touched.add(id);
      return;
    }
    case "split_shot": {
      const id = need(op.shotId, "a shot id");
      const i = shotIndex(doc, id);
      const first = toShot(id, need(op.shot, "the first half"), resolver(doc));
      const secondId = w.gen.newShotId(w.taken);
      const second = toShot(secondId, need(op.second, "the second half"), resolver(doc));
      const shots = [...doc.shots];
      shots.splice(i, 1, first, second);
      w.doc = withShots(doc, shots);
      w.touched.add(id).add(secondId);
      return;
    }
    case "move_shot": {
      const id = need(op.shotId, "a shot id");
      const i = shotIndex(doc, id);
      if (op.afterShotId === id) throw new OpError("a shot can't move after itself");
      const moving = doc.shots[i];
      const rest = doc.shots.filter((_, j) => j !== i);
      const at = op.afterShotId === null ? 0 : rest.findIndex((s) => s.id === op.afterShotId) + 1;
      if (op.afterShotId !== null && at === 0) throw new OpError(`there is no shot "${op.afterShotId}"`);
      rest.splice(at, 0, moving);
      w.doc = withShots(doc, rest);
      w.touched.add(id);
      return;
    }
    case "set_watch_outs":
      w.doc = { ...doc, context: { ...doc.context, watchOuts: need(op.list, "the list").map((x) => cut(x, 1000)).filter(Boolean) } };
      return;
    case "update_cast": {
      const c = need(op.cast, "the person");
      const id = need(c.castId, "a cast id");
      castOf(doc, id);
      w.doc = { ...doc, cast: doc.cast.map((m) => (m.id === id ? { ...m, name: cut(c.name, 80) || m.name, description: cut(c.description, 2000) } : m)) };
      return;
    }
    case "add_cast": {
      const c = need(op.cast, "the person");
      const name = cut(c.name, 80);
      if (!name) throw new OpError("a new person needs a name");
      const id = castIdFor(name, new Set(doc.cast.map((m) => m.id)));
      const avatarId = c.avatarId && w.gen.avatarIds.has(c.avatarId) ? c.avatarId : null;
      w.doc = { ...doc, cast: [...doc.cast, { id, name, description: cut(c.description, 2000), avatarId, isLead: false }] };
      return;
    }
    case "remove_cast": {
      const id = need(need(op.cast, "the person").castId, "a cast id");
      if (castOf(doc, id).isLead) throw new OpError("the lead can't be removed; make someone else the lead first");
      const shots = doc.shots.map((s) => {
        if (!s.onScreen.includes(id)) return s;
        w.touched.add(s.id);
        return { ...s, onScreen: s.onScreen.filter((x) => x !== id) };
      });
      w.doc = { ...doc, cast: doc.cast.filter((m) => m.id !== id), shots };
      return;
    }
    case "set_lead": {
      const id = need(need(op.cast, "the person").castId, "a cast id");
      castOf(doc, id);
      w.doc = { ...doc, cast: doc.cast.map((m) => ({ ...m, isLead: m.id === id })) };
      return;
    }
    case "link_avatar": {
      const c = need(op.cast, "the person");
      const id = need(c.castId, "a cast id");
      castOf(doc, id);
      if (c.avatarId !== null && !w.gen.avatarIds.has(c.avatarId)) throw new OpError("that is not one of the client's saved avatars");
      w.doc = { ...doc, cast: doc.cast.map((m) => (m.id === id ? { ...m, avatarId: c.avatarId } : m)) };
      return;
    }
    case "confirm_item": {
      const out = writeField(doc, w.notes, { kind: "confirm", itemId: need(op.itemId, "an item id") }, "yes");
      if ("error" in out) throw new OpError(out.error);
      w.notes = out.notes;
      return;
    }
  }
}

export function applyOps(doc: ScriptDoc, notes: ScriptNotes, ops: EditOp[], gen: OpsGen): OpsResult {
  const w: Work = { doc, notes, taken: new Set(doc.shots.map((s) => s.id)), touched: new Set(), gen };
  for (const [i, op] of ops.entries()) {
    try {
      applyOne(w, op);
    } catch (e) {
      if (e instanceof OpError) return { ok: false, error: `Change ${i + 1} (${op.op}): ${e.message}.` };
      throw e;
    }
  }
  // The carry rule, on the shots this edit touched only: an untouched shot stays exactly as it was.
  const shots = w.doc.shots.map((s, i) => (w.touched.has(s.id) ? carryShot(w.doc.shots, i) : s));
  const parsed = scriptDocSchema.safeParse({ ...w.doc, shots });
  if (!parsed.success) return { ok: false, error: `The change would break the script: ${parsed.error.issues[0]?.message ?? "invalid"}.` };
  return { ok: true, doc: parsed.data, notes: w.notes, touchedShotIds: [...w.touched] };
}

/** The touched shots as they were and as they would be, for a before-and-after card. */
export function beforeAfter(before: ScriptDoc, after: ScriptDoc, touched: string[]): { before: Shot[]; after: Shot[] } {
  const set = new Set(touched);
  return { before: before.shots.filter((s) => set.has(s.id)), after: after.shots.filter((s) => set.has(s.id)) };
}

/** Shots an edit rewrites whole (update, split, remove) whose content changed since `snapshot` was
 *  taken: the person typed into them while the copilot worked, or after it proposed. Such an edit is
 *  not applied, so it never undoes what the person typed (spec 2 §9). Returns the S-labels. */
export function staleTargets(ops: EditOp[], snapshot: Shot[], current: ScriptDoc): string[] {
  const rewrites = new Set(["update_shot", "split_shot", "remove_shot"]);
  const stale: string[] = [];
  for (const op of ops) {
    if (!rewrites.has(op.op) || !op.shotId) continue;
    const before = snapshot.find((s) => s.id === op.shotId);
    const index = current.shots.findIndex((s) => s.id === op.shotId);
    if (before && index >= 0 && JSON.stringify(before) !== JSON.stringify(current.shots[index])) stale.push(`S${index + 1}`);
  }
  return [...new Set(stale)];
}
