import { AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarViewId } from "@/lib/avatars/schema";
import type { Product, ScriptDoc, ScriptLocation, Shot } from "@/lib/scripts/schema";
import { PANEL_ASPECTS, PANEL_DEFAULT_ASPECT } from "./constants";
import type { RegionalKit } from "./kits";

// D342 — the panel prompt, built from the shot, the setting, the regional kit and each on-screen
// person in words AND their four views. Every clause answers a finding of the dry run (parent
// spec §11.1) or a house rule (no generated text, brands or labelled packs).

export type PanelPerson = {
  castId: string;
  name: string;
  description: string;
  /** The four views, or none while the person's avatar is not ready. */
  views: { view: AvatarViewId; url: string }[];
};
/** A person's view, or (D449) the shot's location plate or one of its products' pictures, or (D469)
 *  the panel a Redraw changes. */
export type PanelReference =
  | { url: string; panel: true }
  | { url: string; castId: string; view: AvatarViewId }
  | { url: string; asset: "location"; assetId: string }
  | { url: string; asset: "product"; assetId: string; angle: number };

/** D449 — the shot's own location and products, from the script (phase 2 of D446). */
export type PanelAssets = { location: ScriptLocation | null; products: Product[] };
export const NO_PANEL_ASSETS: PanelAssets = { location: null, products: [] };

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
/** D449 — Redraw's "Change this picture": the picked take is reference image 1 and only the note
 *  changes. Everything the take already got right (who, where, framing, style) is held.
 *  D469 — and the shot's own references follow it, named as in a draw: with the take alone, a
 *  change lost the people, the place and the product (Reel 33 S1: "he looks at the back of the
 *  product" had no back view to draw from, and the no-text rule blanked the real pack). */
export function panelChangePrompt(
  note: string,
  context: { shot: Shot; people: PanelPerson[]; references: PanelReference[]; assets?: PanelAssets },
): string {
  const { shot, people, references } = context;
  const assets = context.assets ?? NO_PANEL_ASSETS;
  const realProduct = references.some((r) => "asset" in r && r.asset === "product");
  return [
    "Reference image 1 is the current storyboard panel. Redraw it with one change: " + sentence(note),
    "Keep everything else exactly as it is: the people and how they look, the setting, the framing and the drawing style. " +
      "When it is a sheet of several frames, keep every frame and change only what the note names.",
    `The shot it draws: ${sentence(shot.visual)} Where the change and the shot differ, the change wins.`,
    styleReferenceClause(references.length + 1),
    locationClause(assets.location, references),
    people.length > 0 ? peopleClause(people, references) : "",
    productsClause(assets.products, references),
    people.length > 0 ? PANEL_REFERENCE_CLAUSE : "",
    realProduct ? PANEL_NO_TEXT_WITH_PRODUCTS_CLAUSE : PANEL_NO_TEXT_CLAUSE,
  ].filter(Boolean).join("\n\n");
}

/** D449 — with the real product in the frame, its own packaging is drawn as pictured; nothing else
 *  gets lettering. (The pack-only rule above still holds for every other container.) */
export const PANEL_NO_TEXT_WITH_PRODUCTS_CLAUSE =
  "Never draw any text, letters, numbers, captions or price tags of your own. The products in the reference " +
  "images keep their packaging exactly as pictured; every other container, jar, packet and box is plain and unlabelled.";

export const PANEL_NO_TEXT_CLAUSE =
  "Never draw any text, letters, numbers, logos, brand names, labels, price tags or captions anywhere " +
  "in the frame. Every container, jar, packet and box is plain and unlabelled.";

// Spec §6.3 — the pack goes in during the edit until the product has a picture. D457 — a review
// card, claim card or caption is added by hand after generation, and a blank box drawn for it rode
// into the video (Reel 07: a blank card held over the pack), so the panel draws the scene without
// it (PANEL_NO_GRAPHICS_CLAUSE) and holds no space for it.
const BLANK_AREAS = [
  { id: "pack", test: /\bpack\b/i, clause: "Draw the product's pack plain, in its own shape, with no printing at all; the real pack is added in the edit." },
] as const;
export type BlankArea = (typeof BLANK_AREAS)[number]["id"];

export function blankAreas(shot: Pick<Shot, "visual" | "onScreenText">): BlankArea[] {
  const text = `${shot.visual} ${shot.onScreenText}`;
  return BLANK_AREAS.filter((a) => a.test.test(text)).map((a) => a.id);
}

/** D457 — what the edit lays over a shot (a logo, a tagline, on-screen text, a card, a badge, a
 *  caption, a split screen) is added by hand after generation: the panel draws the live scene under
 *  it, never a card or a box for it. D470 — across every brand's scripts, not one reel's words. */
export const PANEL_NO_GRAPHICS_CLAUSE =
  "The logo, text, card, badge, caption or split screen this shot mentions is added by hand after the video is " +
  "made. Draw the live scene without it, as one full frame: no card, sign, sticker, box, panel or empty space " +
  "standing in for it.";

const EDIT_LAYER =
  /\b(logo|tagline|captions?|subtitles?|lower third|overlay|graphic|badge|disclaimer|(?:end|title|review|claim|text|study|disclaimer) card|card-style|split[- ]screen|grid layout|on[- ]screen text|(?:text|name|price)s? (?:appear(?:s|ing)?|on screen|over)|appear(?:s|ing)? on screen)\b/i;
/** A logo printed on the product, or a note that there is none, is not laid over the shot. */
const NOT_EDIT_LAYER =
  /\bno (?:brand )?logo\b|\blogo stays off\b|\b(?:front|printed|pack's|box's) logo\b|\blogo on the (?:pack|box|bottle|jar|pouch|product|label)\b/gi;

export function mentionsGraphic(shot: Pick<Shot, "visual">): boolean {
  return EDIT_LAYER.test(shot.visual.replace(NOT_EDIT_LAYER, ""));
}

/** D470 — a screen's content (an app, a page, a payment, a message) cannot be drawn true to the
 *  real one, so the panel shows a plain lit screen; the real capture goes in during the edit. */
export const PANEL_SCREEN_CLAUSE =
  "A phone, laptop or TV screen that faces the camera shows a plain lit screen with no app, page, text or picture " +
  "on it; what it shows is added in the edit.";

const SCREEN_MENTION = /\b(screens?|phones?|smartphones?|laptops?|tablets?|monitors?|tv|website|app)\b/i;

/** "On screen", "off-screen" and a split screen say where something is in the frame, not a device. */
const SCREEN_AS_FRAME = /\b(?:on|off)[- ]screen\b|\bsplit[- ]screen\b/gi;

export const mentionsScreen = (shot: Pick<Shot, "visual">) => SCREEN_MENTION.test(shot.visual.replace(SCREEN_AS_FRAME, ""));

// D463 — a shot whose action has several moments ("Anjali holds up the pack and asks. Hemant takes
// it from her and reads the label.") is drawn as a storyboard sheet: four frames of it in order, in
// one image, so the people and room cannot drift between them. D470 — a moment is an action verb
// after a doer (the script's own cast, he/she/they, "someone"), or one that continues the doer's
// sentence ("and reads", ", then stirs"). Camera moves and things ("Camera tilts", "Sliced onions")
// are not doers. One person's two actions ("lifts the lid and smiles") stay one frame: a sheet
// asks the clip to move through frames, so it is only for an action that passes between people or
// runs three or more steps.
const NOT_A_DOER = new Set([
  "the", "a", "an", "this", "that", "these", "those", "its", "his", "her", "their", "one", "each", "every",
  "camera", "pan", "close", "shot", "shots", "cut", "cuts", "quick", "walking", "different", "sliced", "top",
  "split", "transition", "slow", "hold", "hero", "final", "match", "logo", "text", "frame", "view", "scene",
  "light", "sunlight", "steam", "music", "visual", "action", "next", "then", "evening", "morning",
]);
const PRONOUN = new Set(["he", "she", "they", "someone"]);
const DOER_VERB = /\b([A-Za-z][\w'-]*)\s+(?:then\s+|also\s+|slowly\s+|quickly\s+|gently\s+)?(?!is\b|was\b|has\b|does\b|its\b|this\b|his\b|always\b|as\b)([a-z]+s)\b/g;
const CONTINUES = /(?:,\s*|\band\s+|\bthen\s+)(?:then\s+)?(?:\w+ly\s+)?(?!is\b|was\b|has\b|its\b|this\b|his\b|as\b)([a-z]{3,}s)\b/g;

const castTokens = (cast: readonly string[]) =>
  new Set(cast.flatMap((n) => n.toLowerCase().split(/[^a-z]+/)).filter((t) => t.length >= 3 && !NOT_A_DOER.has(t)));

function shotActions(visual: string, cast: readonly string[]): { moments: number; doers: number } {
  const named = castTokens(cast);
  const isDoer = (word: string) => {
    const w = word.toLowerCase();
    if (PRONOUN.has(w)) return true;
    if (named.size > 0) return named.has(w);
    // No cast to go by: a capitalised word that is not a camera or scene word.
    return /^[A-Z]/.test(word) && !NOT_A_DOER.has(w);
  };
  let moments = 0;
  const doers = new Set<string>();
  const pronouns = new Set<string>();
  for (const sentence of visual.split(/(?<=[.!?])\s+|\s*;\s*/)) {
    let firstEnd = -1;
    for (const m of sentence.matchAll(DOER_VERB)) {
      if (!isDoer(m[1])) continue;
      moments += 1;
      const w = m[1].toLowerCase();
      (PRONOUN.has(w) ? pronouns : doers).add(w);
      if (firstEnd < 0) firstEnd = (m.index ?? 0) + m[0].length;
    }
    if (firstEnd < 0) continue;
    for (const c of sentence.slice(firstEnd).matchAll(CONTINUES)) {
      if (!NOT_A_DOER.has(c[1])) moments += 1;
    }
  }
  // A pronoun is one of the named people when any are named; on its own, "she" and "he" are two.
  return { moments, doers: doers.size > 0 ? doers.size : pronouns.size };
}

export const PANEL_GRID_FRAMES = 4;

/** How many moments the shot's action has. `cast` is the script's cast names. */
export function shotMoments(shot: Pick<Shot, "visual">, cast: readonly string[] = []): number {
  return shotActions(shot.visual, cast).moments;
}

/** A sheet when the action passes between two people, or runs three or more steps. */
export function drawsAsGrid(shot: Pick<Shot, "visual">, cast: readonly string[] = []): boolean {
  const { moments, doers } = shotActions(shot.visual, cast);
  return moments >= 3 || (doers >= 2 && moments >= 2);
}

export function panelGridClause(aspect: string): string {
  return `This panel is a storyboard sheet: ${PANEL_GRID_FRAMES} frames of this one shot in a 2 by 2 grid, read left to ` +
    "right, top to bottom, showing its moments in order, the first frame its start and the last its end. Each frame " +
    `is ${aspect}, full bleed inside its cell, with a thin white gutter between frames and no other border. The same ` +
    "people, clothes, products, place and light in all four frames; only the action and, where it helps, the framing " +
    "change. No numbers, arrows or notes.";
}

/** The script's aspect when the model accepts it; otherwise 9:16, the reels' own. */
export function panelAspect(doc: ScriptDoc): string {
  const aspect = doc.header.aspect.trim();
  return (PANEL_ASPECTS as readonly string[]).includes(aspect) ? aspect : PANEL_DEFAULT_ASPECT;
}

const sentence = (s: string) => s.trim().replace(/\.?\s*$/, ".");

function referenceNumbers(references: PanelReference[], castId: string): string {
  return references
    .map((r, i) => ("castId" in r && r.castId === castId ? `${i + 1} (${AVATAR_VIEW_LABELS[r.view].toLowerCase()})` : null))
    .filter(Boolean)
    .join(", ");
}

const numbersOf = (references: PanelReference[], test: (r: PanelReference) => boolean) =>
  references.flatMap((r, i) => (test(r) ? [i + 1] : []));
const list = (ns: number[]) => (ns.length <= 1 ? String(ns[0] ?? "") : `${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}`);

/** D449 — where the shot happens: its plate when sent, else the place in words. */
function locationClause(location: ScriptLocation | null, references: PanelReference[]): string {
  if (!location) return "";
  const [n] = numbersOf(references, (r) => "asset" in r && r.asset === "location");
  if (n) {
    // D462 — the room drifted between panels (a dark table in one, a light one in the next): every
    // panel names the same pieces, in the same colours.
    return `The shot is set in ${location.name}: reference image ${n} shows this exact place, empty. Draw the shot there, ` +
      "with the same walls, surfaces, furniture and light, seen from this shot's own camera: the same table, chairs, " +
      "shelves and doors, in the same shapes, materials and colours, in every panel. The people and the action go in it.";
  }
  return `The shot is set in ${location.name}${location.description.trim() ? `: ${sentence(location.description)}` : "."}`;
}

/** D462 — Reel 32 S3 drew a pack in each person's hand while one is handed over, and S1 showed the
 *  front while the shot taps the back label. */
export const PANEL_ONE_PRODUCT_CLAUSE =
  "There is one of it in the frame (one pair, one set) unless the shot says there are more; when it passes from one person to " +
  "another, only one of them holds it. When the shot names a side of it (the back, the label), show that side.";

/** D462 — what a panel draws beyond its shot. The reel's setting line and the regional kit listed
 *  props and food (a study page, a notebook, chapatis, varan), and every panel drew them: a thali
 *  on the table in the intro, notes beside the pack shot. They give the look of the place only. */
export const PANEL_ONLY_WHAT_THE_SHOT_NAMES_CLAUSE =
  "Draw only what this shot needs: the people, products and objects its action names, and the room's own " +
  "furniture. No food, dishes, papers or other objects the shot does not name, even when the setting or the " +
  "regional kit lists them.";

/** D462 — every panel came back the same medium-wide view from the same height. */
export const PANEL_FRAMING_CLAUSE =
  "Frame it as a storyboard artist would for this action, unless the shot gives the camera: close on the " +
  "detail when the action is about one (a label, hands, a spoon), medium on one person, wider when two people " +
  "share the moment.";

/** D449 — the products the shot shows: copied from their pictures, or a blank pack until one exists. */
function productsClause(products: Product[], references: PanelReference[]): string {
  if (products.length === 0) return "";
  const lines = products.map((p) => {
    const ns = numbersOf(references, (r) => "asset" in r && r.asset === "product" && r.assetId === p.id);
    return ns.length > 0
      ? `- ${p.name}: reference image${ns.length > 1 ? "s" : ""} ${list(ns)} show${ns.length > 1 ? "" : "s"} it. Draw exactly this product, ` +
        "in the same shape, colours and proportions, wherever the shot shows it. " + PANEL_ONE_PRODUCT_CLAUSE
      : `- ${p.name}: no picture of it yet. Draw a plain version of what it is, with no logo, label or printing; ` +
        "the real one is added in the edit.";
  });
  return ["Products in this shot (exactly these):", ...lines].join("\n");
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
  /** D449 — the shot's location and products; none when the script has neither. */
  assets?: PanelAssets;
}): string {
  const { doc, shot, kit, people, references } = input;
  const assets = input.assets ?? NO_PANEL_ASSETS;
  // D449 — a product with a picture is drawn as itself, so the blank-pouch stand-in goes.
  const realProduct = references.some((r) => "asset" in r && r.asset === "product");
  const blanks = blankAreas(shot)
    .filter((id) => !(id === "pack" && realProduct))
    .map((id) => BLANK_AREAS.find((a) => a.id === id)!.clause);
  const peopleRefs = references.some((r) => "castId" in r);
  const aspect = panelAspect(doc);
  return [
    PANEL_STYLE_BLOCK,
    styleReferenceClause(references.length + 1),
    `Frame: ${aspect}.`,
    drawsAsGrid(shot, doc.cast.map((c) => c.name)) ? panelGridClause(aspect) : "",
    `This shot: ${sentence(shot.visual)}`,
    PANEL_FRAMING_CLAUSE,
    // D458 — the place and light are the reel's; a camera note there is for the shot it describes.
    // D462 — and the objects it lists only where the shot's action uses them.
    doc.context.settingAndCamera
      ? "The reel's setting (take its place and light only; an object it lists appears only when this shot's action " +
        `uses it, and a camera note in it is only for the shot it describes): ${sentence(doc.context.settingAndCamera)}`
      : "",
    kit
      ? `Regional kit (${kit.region}). Kitchen and home: ${kit.kitchen}. At the table: ${kit.table}. ` +
        `Wardrobe: ${kit.wardrobe}. Use it for the look of the place and clothes; its food and objects appear only ` +
        `when this shot's action uses them. The look is of ${kit.region}, never another region's.`
      : "",
    locationClause(assets.location, references),
    people.length === 0 ? PANEL_NOBODY_CLAUSE : peopleClause(people, references),
    productsClause(assets.products, references),
    PANEL_ONLY_WHAT_THE_SHOT_NAMES_CLAUSE,
    ...blanks,
    mentionsGraphic(shot) ? PANEL_NO_GRAPHICS_CLAUSE : "",
    mentionsScreen(shot) ? PANEL_SCREEN_CLAUSE : "",
    peopleRefs ? PANEL_REFERENCE_CLAUSE : "",
    realProduct ? PANEL_NO_TEXT_WITH_PRODUCTS_CLAUSE : PANEL_NO_TEXT_CLAUSE,
  ].filter(Boolean).join("\n\n");
}
