import type { ReelScript } from "@/lib/nodes/reel-script";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { mentionDialect } from "@/lib/nodes/prompt-token-dialect";

// D320 — a Script, Shot or Multishot node wired into a composite is CONTEXT, not a reference
// image: it tells the image model which moment of the video this picture is a still for. The
// operator can @-mention the whole node or one shot of it ("@Reel · Shot 2"). Pure, so the
// browser (the `@` menu) and the route (the prompt) read the same shots under the same ids.

export const COMPOSITE_CONTEXT_TYPES = ["script", "shot", "multishot"] as const;

export function isCompositeContextType(type: string): boolean {
  return (COMPOSITE_CONTEXT_TYPES as readonly string[]).includes(type);
}

export type ContextShot = {
  /** The mention id: `${nodeId}:shot:${key}`. */
  id: string;
  /** "Shot 2", numbered as the script numbers it. */
  label: string;
  text: string;
  seconds?: number;
};

export type CompositeContext = {
  nodeId: string;
  type: string;
  title: string;
  shots: ContextShot[];
  /** The script's production notes (lighting, grade, time of day), when it has any. */
  notes: string;
};

const TYPE_TITLE: Record<string, string> = { script: "Script", shot: "Shot", multishot: "Multishot" };

/** Overall budget for the context block, so a long script cannot swamp the image prompt. */
const MAX_CONTEXT_CHARS = 2000;

const MENTION = mentionDialect();

export const contextShotId = (nodeId: string, key: string | number): string => `${nodeId}:shot:${key}`;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function scriptShots(nodeId: string, script: ReelScript | null | undefined, numbers?: number[]): ContextShot[] {
  return (script?.visual_script?.shots ?? [])
    .map((s, i) => {
      const n = numbers?.[i] ?? i + 1;
      return { id: contextShotId(nodeId, n), label: `Shot ${n}`, text: str(s.description), seconds: s.duration_seconds };
    })
    .filter((s) => s.text);
}

/**
 * One wired node as context, or null when it is not a context type. `output` is the node's active
 * output: a Script keeps its parse there (the browser's `data.parsed`, the server's activeOutput);
 * a Shot and a Multishot keep everything on `data`.
 */
export function compositeContextOf(
  nodeId: string,
  type: string,
  data: Record<string, unknown>,
  output: unknown,
): CompositeContext | null {
  if (!isCompositeContextType(type)) return null;

  if (type === "multishot") {
    const cuts = ((data.cuts ?? []) as MultishotCut[]).filter((c) => c && typeof c.text === "string");
    const script = data.script as ReelScript | undefined;
    return {
      nodeId,
      type,
      title: str(data.title) || str(script?.title) || TYPE_TITLE.multishot,
      shots: cuts
        .map((c, i) => ({ id: contextShotId(nodeId, c.id), label: `Shot ${i + 1}`, text: c.text.trim(), seconds: c.seconds }))
        .filter((s) => s.text),
      notes: str(script?.visual_script?.execution_refinement),
    };
  }

  const script = (type === "script" ? output : data.script) as ReelScript | null | undefined;
  const seeded = data.seededFrom as { shotIndexes?: number[] } | undefined;
  // A Shot node carries the script narrowed to its own shots; number them as the script does.
  const numbers = type === "shot" ? seeded?.shotIndexes?.map((i) => i + 1) : undefined;
  return {
    nodeId,
    type,
    title: str(data.title) || str(script?.title) || TYPE_TITLE[type],
    shots: scriptShots(nodeId, script, numbers),
    notes: str(script?.visual_script?.execution_refinement),
  };
}

/** What `@` offers for context: the whole node, then each of its shots. Labelled "Type: Name". */
export function contextMentionables(contexts: CompositeContext[]) {
  return contexts.flatMap((c) => [
    { id: c.nodeId, label: `${TYPE_TITLE[c.type] ?? c.type}: ${c.title}`, type: c.type },
    ...c.shots.map((s) => ({ id: s.id, label: `Shot: ${c.title} · ${s.label}`, type: "shot" })),
  ]);
}

/** Every id a context chip may point at — the whole node and each shot. */
export function contextIds(contexts: CompositeContext[]): Set<string> {
  return new Set(contexts.flatMap((c) => [c.nodeId, ...c.shots.map((s) => s.id)]));
}

/** The instruction with each context chip replaced by plain words the image model can read. */
export function resolveContextMentions(instruction: string, contexts: CompositeContext[]): string {
  if (!instruction.includes("@[") || contexts.length === 0) return instruction;
  const names = new Map<string, string>();
  for (const c of contexts) {
    names.set(c.nodeId, `${c.title} (see the shot context)`);
    for (const s of c.shots) names.set(s.id, `${s.label} of ${c.title} (see the shot context)`);
  }
  return MENTION.parse(instruction)
    .map((s) => (s.kind === "text" ? s.text : (names.get(s.id) ?? `@[${s.label}](${s.id})`)))
    .join("");
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * The context lines for the prompt. A node any of whose shots the instruction mentions contributes
 * just those shots; a node mentioned whole, or wired and not mentioned at all, contributes every
 * shot. Empty when nothing is wired.
 */
export function compositeContextLines(contexts: CompositeContext[], instruction: string): string[] {
  if (contexts.length === 0) return [];
  const mentioned = new Set<string>();
  for (const s of MENTION.parse(instruction)) if (s.kind === "mention") mentioned.add(s.id);

  const blocks = contexts.map((c) => {
    const picked = c.shots.filter((s) => mentioned.has(s.id));
    const shots = picked.length > 0 && !mentioned.has(c.nodeId) ? picked : c.shots;
    const lines = [`From ${c.title}:`];
    for (const s of shots) lines.push(`- ${s.label}${typeof s.seconds === "number" ? ` (${s.seconds}s)` : ""}: ${s.text}`);
    if (c.notes) lines.push(`- Production notes: ${c.notes}`);
    return lines.join("\n");
  });
  return [clip(blocks.join("\n"), MAX_CONTEXT_CHARS)];
}
