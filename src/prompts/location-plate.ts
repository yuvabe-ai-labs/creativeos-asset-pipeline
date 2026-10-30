import type { RegionalKit } from "@/lib/scripts/visualise/kits";
import type { ScriptDoc, ScriptLocation } from "@/lib/scripts/schema";

// D448 — one location plate: the empty set a script's shots happen in, drawn once so every panel
// and every clip set there starts from the same picture. Kept to the place alone: a person, a
// product or any lettering in a plate would ride into every shot that uses it.

// @2 (D449): Redraw — a fresh plate may carry one note; "change" edits the current plate.
export const LOCATION_PLATE_PROMPT_ID = "location-plate@2";

const sentence = (s: string) => s.trim().replace(/\.?\s*$/, ".");

const EMPTY_SET =
  "Show only the place, as an empty set ready for filming: no people, no hands, no products, no packaging, " +
  "no text, signs or logos.";

export function locationPlatePrompt(args: {
  location: ScriptLocation;
  doc: ScriptDoc;
  kit: RegionalKit | null;
  aspect: string;
  /** D449 — Redraw's note on a fresh draw. */
  note?: string;
}): string {
  const { location, doc, kit, aspect } = args;
  const note = args.note?.trim() ?? "";
  return [
    `An empty location plate for a short video: ${sentence(location.name)}${location.description.trim() ? ` ${sentence(location.description)}` : ""}`,
    doc.context.settingAndCamera.trim() ? `The reel's setting: ${sentence(doc.context.settingAndCamera)}` : "",
    kit ? `Regional kit (${kit.region}). Kitchen and home: ${kit.kitchen}. The home is Indian, never European or Western.` : "",
    note ? `Also: ${sentence(note)}` : "",
    `${EMPTY_SET} Eye level, the whole space readable, natural light as described.`,
    `Frame: ${aspect}.`,
  ].filter(Boolean).join("\n");
}

/** D449 — Redraw's "Change this picture": the current plate is the reference and only the note
 *  changes; it stays an empty set. */
export function locationPlateChangePrompt(note: string): string {
  return [
    `Reference image 1 is a location plate for a short video. Redraw it with one change: ${sentence(note)}`,
    "Keep everything else exactly as it is: the space, its surfaces, furniture, light and camera position.",
    EMPTY_SET,
  ].join("\n");
}
