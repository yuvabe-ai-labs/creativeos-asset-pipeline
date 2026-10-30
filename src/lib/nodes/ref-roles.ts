// D443 — what each reference image IS, told to the video model in one line.
//
// Every wired image is sent (D308), but until this line the model got them as an unlabelled list
// (`[# References <IMAGE_REF_0>@Image1 …]`) and had to guess which picture was the product and
// which the room. Most clips sent images no prompt text named, and a guessed role is how a
// packshot ends up as a second pouch on the table.
//
// The role comes from the writer's own reading of each attachment (the plan's `references`
// scratch array, D319), kept on the plan as `refRoles`. The writer still writes no tokens (D233):
// this module turns its reading into the line, numbered in the lane's dialect over exactly the
// images the request carries, so it cannot disagree with the prompt's own tokens.

import type { TokenDialect } from "./prompt-token-dialect";

export const REF_ROLES = ["product", "person", "location", "storyboard", "style", "brand mark", "other"] as const;
export type RefRole = (typeof REF_ROLES)[number];
/** D454 — what the roles line can say: the writer's roles, plus a storyboard made real, which only
 *  the canvas knows (the writer is never asked to tell a still from any other picture). */
export type LabelRole = RefRole | "still";

/** One attached image's role, by image id. `name` is what the operator would call it. */
export type RefRoleEntry = { id: string; role: RefRole; name: string };

const NAME_MAX = 60;

const isRole = (v: unknown): v is RefRole =>
  typeof v === "string" && (REF_ROLES as readonly string[]).includes(v);

/**
 * The writer's `references` reading → entries keyed by image id. Its `image` is the N of
 * "Reference image N", counted over `attachmentIds` (the same vision-attachment order the images
 * were labelled in). A number outside that list is dropped rather than failing the plan: the
 * reading is advisory, and the beats are what was paid for.
 */
export function refRolesFromReading(reading: unknown, attachmentIds: string[]): RefRoleEntry[] {
  if (!Array.isArray(reading)) return [];
  const out: RefRoleEntry[] = [];
  for (const item of reading) {
    const n = (item as { image?: unknown } | null)?.image;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > attachmentIds.length) continue;
    const id = attachmentIds[n - 1];
    if (out.some((e) => e.id === id)) continue;
    const { role, name } = item as { role?: unknown; name?: unknown };
    out.push({
      id,
      role: isRole(role) ? role : "other",
      name: typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "",
    });
  }
  return out;
}

/** A stored `refRoles` value narrowed to its well-formed rows; undefined when it is not a list. */
export function asRefRoles(raw: unknown): RefRoleEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(
    (e): e is RefRoleEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as RefRoleEntry).id === "string" &&
      isRole((e as RefRoleEntry).role) &&
      typeof (e as RefRoleEntry).name === "string",
  );
}

const named = (name: string) => (name ? ` (${name})` : "");

// What each role asks of the model. A product is copied; a place is a setting, never a second
// subject; a storyboard lends composition, never its drawing style.
const CLAUSE: Record<LabelRole, (name: string) => string> = {
  product: (n) => `is the product${named(n)}: keep it exactly as pictured`,
  person: (n) => `is a person${named(n)}`,
  location: (n) => `is the location${named(n)}: the place, not a subject`,
  // D452 — Google's own wording for a drawing used as a guide, plus "placeholders": the sketch's
  // people and objects must not compete with the real references.
  storyboard: (n) =>
    `is a rough storyboard sketch${named(n)}: follow only its composition, staging and camera framing, with its ` +
    "people and objects as placeholders for the other references, and never show the drawing, its lines or colours",
  // D454 — the shot's storyboard Composite once the operator has made it real: a picture to match.
  still: (n) => `is the approved still of this shot${named(n)}: match its moment, people, products, place and framing`,
  style: (n) => `is a style reference${named(n)}: light and colour only`,
  "brand mark": (n) => `is a brand mark${named(n)}: a logo graphic, not an object`,
  other: (n) => (n ? `is ${n}` : ""),
};

/**
 * "Reference roles: <IMAGE_REF_0> is the product (…): keep it exactly as pictured. …" — or "" when
 * no sent image has a label, or the model has no image tokens.
 *
 * `sentIds` is the request's reference order (after selectReferences), which is what each
 * dialect's numbers index. Semicolons become commas: on Kling a `;` ends a shot.
 */
export function referenceRolesLine(
  sentIds: string[],
  labels: ReadonlyMap<string, { role: LabelRole; name: string }>,
  dialect: TokenDialect | null,
): string {
  if (!dialect) return "";
  const parts: string[] = [];
  for (const id of sentIds) {
    const label = labels.get(id);
    if (!label) continue;
    const token = dialect.tokenForId(id, label.name);
    const clause = CLAUSE[label.role](label.name.replace(/;/g, ","));
    if (token && clause) parts.push(`${token} ${clause}`);
  }
  return parts.length > 0 ? `Reference roles: ${parts.join(". ")}.` : "";
}
