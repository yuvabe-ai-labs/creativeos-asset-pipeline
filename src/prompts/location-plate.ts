import type { RegionalKit } from "@/lib/scripts/visualise/kits";
import type { ScriptDoc, ScriptLocation } from "@/lib/scripts/schema";

// D448 — one location plate: the empty set a script's shots happen in, drawn once so every panel
// and every clip set there starts from the same picture. Kept to the place alone: a person, a
// product or any lettering in a plate would ride into every shot that uses it.

export const LOCATION_PLATE_PROMPT_ID = "location-plate@1";

const sentence = (s: string) => s.trim().replace(/\.?\s*$/, ".");

export function locationPlatePrompt(args: {
  location: ScriptLocation;
  doc: ScriptDoc;
  kit: RegionalKit | null;
  aspect: string;
}): string {
  const { location, doc, kit, aspect } = args;
  return [
    `An empty location plate for a short video: ${sentence(location.name)}${location.description.trim() ? ` ${sentence(location.description)}` : ""}`,
    doc.context.settingAndCamera.trim() ? `The reel's setting: ${sentence(doc.context.settingAndCamera)}` : "",
    kit ? `Regional kit (${kit.region}). Kitchen and home: ${kit.kitchen}. The home is Indian, never European or Western.` : "",
    "Show only the place, as an empty set ready for filming: no people, no hands, no products, no packaging, " +
      "no text, signs or logos. Eye level, the whole space readable, natural light as described.",
    `Frame: ${aspect}.`,
  ].filter(Boolean).join("\n");
}
