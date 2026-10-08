import { AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarViewId } from "@/lib/avatars/schema";
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";
import { PANEL_ASPECTS, PANEL_DEFAULT_ASPECT } from "./constants";
import type { RegionalKit } from "./kits";

// D341 — the panel prompt, built from the shot, the setting, the regional kit and each on-screen
// person in words AND their four views. Every clause answers a finding of the dry run (parent
// spec §11.1) or a house rule (no generated text, brands or labelled packs).

export type PanelPerson = {
  castId: string;
  name: string;
  description: string;
  /** The four views, or none while the person's avatar is not ready. */
  views: { view: AvatarViewId; url: string }[];
};
export type PanelReference = { url: string; castId: string; view: AvatarViewId };

// The house style, the same block first in every panel (approved in testing, 8 Oct 2026: a loose
// one-line style let some panels come back framed and others full bleed, with drifting lines).
export const PANEL_STYLE_BLOCK = [
  "STYLE (the same in every panel; it never varies):",
  "- A storyboard frame drawn as a marker-and-wash sketch: black fineliner and alcohol markers on white marker paper. It reads as a plan to approve, not a finished film.",
  "- Lines: confident, even, medium-weight black ink outlines around every figure and object; light hatching for shadow; no sketchy construction lines.",
  "- Colour: flat marker washes in a muted palette (warm greys, cream, ochre, muted gold, terracotta, sage); white paper left showing in the highlights; skin in warm mid-tones.",
  "- Light: soft daylight from one side; simple cool-grey cast shadows.",
  "- Detail: enough to read the action, the people and the setting; no photographic texture, no gradients, no 3D render look, no painterly brushwork.",
  "- Framing: full bleed. The drawing fills the whole frame edge to edge. No drawn border, frame line, margin, paper edge, tape or vignette.",
].join("\n");

/** The house style image is sent last (run-panel.ts), after the people's views. */
export function styleReferenceClause(styleRefNumber: number): string {
  return `Reference image ${styleRefNumber} shows the drawing style only: match its line, washes, palette and ` +
    "full-bleed framing; never copy its room, furniture, objects or layout.";
}
export const PANEL_NOBODY_CLAUSE = "Nobody is on screen: draw no people. Hands may appear only if the action needs them.";
export const PANEL_REFERENCE_CLAUSE =
  "The people's reference images show their identity only: never copy their plain grey background, lighting or layout.";
export const PANEL_NO_TEXT_CLAUSE =
  "Never draw any text, letters, numbers, logos, brand names, labels, price tags or captions anywhere " +
  "in the frame. Every container, jar, packet and box is plain and unlabelled.";

// Spec §6.3 — the card and the pack go in during the edit; the panel keeps their place blank.
const BLANK_AREAS = [
  { id: "review card", test: /\breview card\b/i, clause: "Leave a plain blank rectangle where the review card appears; it is added in the edit." },
  { id: "claim card", test: /\bclaim (card|line)\b/i, clause: "Leave a plain blank rectangle where the claim card sits; it is added in the edit." },
  { id: "pack", test: /\bpack\b/i, clause: "Draw the product pack as a plain blank pouch with no printing at all; the real pack is added in the edit." },
] as const;
export type BlankArea = (typeof BLANK_AREAS)[number]["id"];

export function blankAreas(shot: Pick<Shot, "visual" | "onScreenText">): BlankArea[] {
  const text = `${shot.visual} ${shot.onScreenText}`;
  return BLANK_AREAS.filter((a) => a.test.test(text)).map((a) => a.id);
}

/** The script's aspect when the model accepts it; otherwise 9:16, the reels' own. */
export function panelAspect(doc: ScriptDoc): string {
  const aspect = doc.header.aspect.trim();
  return (PANEL_ASPECTS as readonly string[]).includes(aspect) ? aspect : PANEL_DEFAULT_ASPECT;
}

const sentence = (s: string) => s.trim().replace(/\.?\s*$/, ".");

function referenceNumbers(references: PanelReference[], castId: string): string {
  return references
    .map((r, i) => (r.castId === castId ? `${i + 1} (${AVATAR_VIEW_LABELS[r.view].toLowerCase()})` : null))
    .filter(Boolean)
    .join(", ");
}

function peopleClause(people: PanelPerson[], references: PanelReference[]): string {
  const lines = people.map((p) => {
    const refs = referenceNumbers(references, p.castId);
    // The images, not the words, decide what they wear: a description may give a wardrobe per
    // place ("cotton in the kitchen, silk for guests"), which made the same person change clothes
    // between panels (spec 3 criterion 4).
    const seen = refs
      ? ` Reference images ${refs} show this person. Dress them exactly as in those images: the same garments, ` +
        "colours and borders in every panel, whatever the description says they wear elsewhere."
      : "";
    return `- ${p.name}: ${sentence(p.description || p.name)}${seen} Keep their face, hair, build, ` +
      "clothing and every identity marker named here exactly the same, in the same colours.";
  });
  return ["People on screen (exactly these, nobody else):", ...lines].join("\n");
}

export function buildPanelPrompt(input: {
  doc: ScriptDoc;
  shot: Shot;
  kit: RegionalKit | null;
  people: PanelPerson[];
  references: PanelReference[];
}): string {
  const { doc, shot, kit, people, references } = input;
  const blanks = blankAreas(shot).map((id) => BLANK_AREAS.find((a) => a.id === id)!.clause);
  return [
    PANEL_STYLE_BLOCK,
    styleReferenceClause(references.length + 1),
    `Frame: ${panelAspect(doc)}.`,
    `This shot: ${sentence(shot.visual)}`,
    doc.context.settingAndCamera ? `Setting and camera for the whole reel: ${sentence(doc.context.settingAndCamera)}` : "",
    kit
      ? `Regional kit (${kit.region}). Kitchen and home: ${kit.kitchen}. At the table: ${kit.table}. ` +
        `Wardrobe: ${kit.wardrobe}. Use what fits this shot. The home is Indian, never European or Western.`
      : "",
    people.length === 0 ? PANEL_NOBODY_CLAUSE : peopleClause(people, references),
    ...blanks,
    references.length > 0 ? PANEL_REFERENCE_CLAUSE : "",
    PANEL_NO_TEXT_CLAUSE,
  ].filter(Boolean).join("\n\n");
}
