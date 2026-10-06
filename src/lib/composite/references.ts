import type { UpstreamOutput } from "@/lib/db/nodes";
import type { RefImageMeta } from "@/lib/image-gen/validate";
import { isGeneratedImageType } from "@/lib/nodes/image-node-types";
import { mentionDialect } from "@/lib/nodes/prompt-token-dialect";
import { refDisplayName } from "@/lib/nodes/ref-binding";

// D312 — the composite's reference roster. The image model gets one flat list of URLs, so every
// wired image is numbered by its position in that list and the instruction's chips resolve to
// those numbers. An avatar arrives already expanded into D308's rows — its front under the Avatar
// node's id, its fresh profile sheet under avatarSheetId — so each entry is exactly one image.
// Pure: the route and the tests feed it rows; nothing here reads the database.

export type CompositeRefRole = "avatar" | "avatar-sheet" | "image";

export type CompositeRef = {
  nodeId: string;
  name: string;
  role: CompositeRefRole;
  image: RefImageMeta;
  /** 1-based position in the request's reference list. */
  position: number;
};

const MENTION = mentionDialect();

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** One upstream row as a roster entry, or null when it carries no image. */
function entryOf(u: UpstreamOutput): Omit<CompositeRef, "position"> | null {
  const d = u.data;
  const meta = {
    filename: str(d.filename),
    fileSizeBytes: num(d.fileSizeBytes),
    imageWidth: num(d.imageWidth),
    imageHeight: num(d.imageHeight),
  };
  if (isGeneratedImageType(u.type)) {
    const url = str(u.activeOutput);
    if (!url) return null;
    const fallback = u.type === "composite" ? "Composite" : "Image";
    return { nodeId: u.nodeId, name: str(d.title) ?? fallback, role: "image", image: { url, ...meta } };
  }
  if (u.type !== "file" && u.type !== "draw") return null;
  const url = str(d.fileUrl);
  if (!url || (u.type === "file" && d.fileKind !== "image")) return null;
  // D308's avatar rows are file rows flagged `presenter`: true for the front, "sheet" for the sheet.
  if (d.presenter === true || d.presenter === "sheet") {
    const avatarName = str(d.title) ?? "Avatar";
    return d.presenter === true
      ? { nodeId: u.nodeId, name: avatarName, role: "avatar", image: { url, ...meta } }
      : { nodeId: u.nodeId, name: `${avatarName} sheet`, role: "avatar-sheet", image: { url, ...meta } };
  }
  const fallback = u.type === "draw" ? "Sketch" : "File";
  return {
    nodeId: u.nodeId,
    name: str(d.title) ?? str(d.filename) ?? fallback,
    role: "image",
    image: { url, ...meta },
  };
}

/** The upstream rows that carry an image, in order, each with its position. */
export function compositeRefs(ups: readonly UpstreamOutput[]): CompositeRef[] {
  const refs: CompositeRef[] = [];
  for (const u of ups) {
    const entry = entryOf(u);
    if (entry) refs.push({ ...entry, position: refs.length + 1 });
  }
  return refs;
}

/** Every image the request carries, in roster order. */
export function referenceImagesOf(refs: CompositeRef[]): RefImageMeta[] {
  return refs.map((r) => r.image);
}

/** The instruction with each chip replaced by its name and image position. */
export function resolveCompositeMentions(instruction: string, refs: CompositeRef[]): string {
  if (!instruction.includes("@[")) return instruction;
  const byId = new Map(refs.map((r) => [r.nodeId, r]));
  return MENTION.parse(instruction)
    .map((s) => {
      if (s.kind === "text") return s.text;
      const ref = byId.get(s.id);
      const name = refDisplayName(s.label);
      return ref ? `${name} (image ${ref.position})` : name;
    })
    .join("");
}

/** Names of the chips whose node is no longer in the roster, each once, in first-seen order. */
export function danglingMentions(instruction: string, refs: CompositeRef[]): string[] {
  const wired = new Set(refs.map((r) => r.nodeId));
  const names: string[] = [];
  for (const s of MENTION.parse(instruction)) {
    if (s.kind !== "mention" || wired.has(s.id)) continue;
    const name = refDisplayName(s.label);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function danglingMentionMessage(names: string[]): string {
  const quoted = names.map((n) => `'${n}'`);
  if (quoted.length === 1) {
    return `${quoted[0]} is mentioned in the instruction but no longer connected — reconnect it or remove the mention.`;
  }
  const list = `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  return `${list} are mentioned in the instruction but no longer connected — reconnect them or remove the mentions.`;
}
