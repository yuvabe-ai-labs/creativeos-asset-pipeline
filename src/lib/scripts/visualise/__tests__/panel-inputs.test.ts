import { describe, it, expect } from "vitest";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { parseRegionalKits } from "../kits";
import { blankAreas, panelAspect, PANEL_NO_GRAPHICS_CLAUSE } from "../panel-prompt";
import { castReadyForPanels, estimatePanelCredits, panelInputs, panelReferenceCap, type PanelInputs } from "../panel-inputs";
import { shotKey } from "../keys";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { isPanelModel, PANEL_MODEL_ID, PANEL_MODEL_IDS } from "../constants";
import {
  avatarMap, HUSBAND_AVATAR, linkedDoc, MEENAKSHI_AVATAR, readyAvatar, reel01Doc,
} from "./fixtures";

const KITS = parseRegionalKits(
  "Regional kits\n| Region | At the table | Kitchen and home | Wardrobe |\n| **Tamil Nadu** | Idli and dosa | Iron tawa, kolam, steel dabba | Cotton saree; veshti |",
);
const doc = linkedDoc();
const shot = (id: string) => doc.shots.find((s) => s.id === id)!;
const avatars = avatarMap(readyAvatar(MEENAKSHI_AVATAR, "meenakshi"), readyAvatar(HUSBAND_AVATAR, "husband"));
const inputs = (id: string, cap = panelReferenceCap(), map = avatars, d = doc) =>
  panelInputs({ doc: d, shot: d.shots.find((s) => s.id === id)!, avatars: map, kits: KITS, cap });

describe("castReadyForPanels (D341)", () => {
  it("needs a saved, live avatar with a current four-view sheet", () => {
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m"))).toBe(true);
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m", { status: "draft" }))).toBe(false);
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m", { sheetStale: true }))).toBe(false);
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m", { archivedAt: "2026-10-08T00:00:00.000Z" }))).toBe(false);
    expect(castReadyForPanels(makeAvatar({ sheetViews: null }))).toBe(false);
    expect(castReadyForPanels(undefined)).toBe(false);
  });
});

/** A reference as "cast:view", or (D449) as its asset and id. */
const refLabel = (r: PanelInputs["references"][number]) => ("castId" in r ? `${r.castId}:${r.view}` : `${r.asset}:${r.assetId}`);

describe("panelInputs on Reel 01 (D342)", () => {
  it("sends both people's four views for a two-person shot, fronts first, and numbers them in the prompt", () => {
    const s06 = inputs("s06");
    expect(s06.references.map(refLabel)).toEqual([
      "meenakshi:front", "husband:front",
      "meenakshi:left", "meenakshi:right", "meenakshi:back",
      "husband:left", "husband:right", "husband:back",
    ]);
    expect(s06.prompt).toContain("Reference images 1 (front), 3 (left), 4 (right), 5 (back) show this person.");
    expect(s06.prompt).toContain("Reference images 2 (front), 6 (left), 7 (right), 8 (back) show this person.");
    expect(s06.prompt).toContain("Meenakshi, 54, Chennai.");
    expect(s06.prompt).toContain("Her husband, 58, in a veshti.");
    expect(s06.waitingFor).toEqual([]);
  });

  it("keeps every front when the model's reference cap is short, dropping other views first", () => {
    const s06 = inputs("s06", 5);
    expect(s06.references.map(refLabel)).toEqual([
      "meenakshi:front", "husband:front", "meenakshi:left", "meenakshi:right", "meenakshi:back",
    ]);
    expect(s06.prompt).toContain("Reference images 2 (front) show this person.");
  });

  it("dresses each person exactly as their reference images, whatever the description says they wear elsewhere", () => {
    // Testing on staging: Meenakshi's description says "Cotton saree in the kitchen, silk with a
    // zari border for guests"; a kitchen shot drew a grey cotton saree over her cream silk views.
    const p = inputs("s02").prompt;
    expect(p).toContain("Dress them exactly as in those images: the same garments, colours and borders in every panel");
    expect(p).toContain("whatever the description says they wear elsewhere");
  });

  it("has no clothing instruction for a person drawn without reference images", () => {
    expect(inputs("s02", 0).prompt).not.toContain("Dress them exactly as in those images");
  });

  it("opens with the house style block: full bleed, no drawn border (testing: some panels came back framed)", () => {
    const p = inputs("s01").prompt;
    expect(p.startsWith("STYLE (the same in every panel")).toBe(true);
    expect(p).toContain("Framing: full bleed");
    expect(p).toContain("No drawn border, frame line, margin, paper edge, tape or vignette");
  });

  it("names the house style image, sent after the people's views, as style only", () => {
    expect(inputs("s06").prompt).toContain("Reference image 9 shows the drawing style only");
    expect(inputs("s09").prompt).toContain("Reference image 1 shows the drawing style only");
    expect(inputs("s09").prompt).toContain("never copy its room, furniture, objects or layout");
  });

  it("keeps one reference slot for the house style image", () => {
    expect(panelReferenceCap()).toBe(imageGenClientModelMap[PANEL_MODEL_ID]!.maxReferenceImages! - 1);
  });

  it("prices the house style image in, so the cost shown is what is reserved", () => {
    expect(estimatePanelCredits(8, "9:16")).toBe(estimateAvatarImageCredits({ modelId: PANEL_MODEL_ID, aspect: "9:16", referenceCount: 9 }));
  });

  it("draws the setting, the kit, the sketch style, and never any text or brand", () => {
    const p = inputs("s03").prompt;
    expect(p).toContain("marker-and-wash sketch");
    expect(p).toContain("Regional kit (Tamil Nadu)");
    expect(p).toContain("Iron tawa, kolam");
    expect(p).toContain("Chennai flat with a Golu");
    expect(p).toContain("Never draw any text, letters, numbers, logos, brand names");
  });

  it("never carries the shot's VO or on-screen text into the prompt", () => {
    const p = inputs("s01").prompt;
    expect(p).not.toContain("Golu starts today.");
  });

  // D458 — the reel's setting gives the place and light; its camera note is not every panel's.
  it("reads the reel's setting for its place and light, not its camera note", () => {
    const p = inputs("s03").prompt;
    expect(p).toMatch(/The reel's setting \(take its place and light; a camera note in it is only for the shot it describes\)/);
    expect(p).not.toMatch(/Setting and camera for the whole reel/);
  });

  it("draws nobody on a B-roll shot, with no references", () => {
    const s09 = inputs("s09");
    expect(s09.references).toEqual([]);
    expect(s09.prompt).toContain("Nobody is on screen");
    expect(s09.prompt).not.toContain("reference images show");
  });

  // D457 — a review card or claim card is added by hand after generation: no blank box for it.
  it("leaves only the pack blank, and draws a card's scene without the card (spec §6.3, D457)", () => {
    expect(blankAreas(shot("s08"))).toEqual([]);
    expect(blankAreas(shot("s13"))).toEqual(["pack"]);
    expect(blankAreas(shot("s14"))).toEqual(["pack"]);
    expect(blankAreas(shot("s03"))).toEqual([]);
    expect(inputs("s08").prompt).not.toMatch(/blank rectangle/);
    expect(inputs("s08").prompt).toContain(PANEL_NO_GRAPHICS_CLAUSE);
    expect(inputs("s03").prompt).not.toContain(PANEL_NO_GRAPHICS_CLAUSE);
    expect(inputs("s14").prompt).toContain("plain blank pouch with no printing");
  });

  it("waits for each on-screen person who has no avatar ready, but not on B-roll", () => {
    const unlinked = reel01Doc();
    expect(inputs("s06", undefined, new Map(), unlinked).waitingFor).toEqual(["Meenakshi", "Meenakshi's husband"]);
    expect(inputs("s03", undefined, new Map(), unlinked).waitingFor).toEqual([]);
    const noViews = avatarMap(readyAvatar(MEENAKSHI_AVATAR, "meenakshi", { sheetViews: null }), readyAvatar(HUSBAND_AVATAR, "husband"));
    expect(inputs("s06", undefined, noViews).waitingFor).toEqual(["Meenakshi"]);
  });

  it("records each on-screen person's avatar and face, for out-of-date checks", () => {
    const faces = inputs("s06").faces;
    expect(Object.keys(faces)).toEqual(["meenakshi", "husband"]);
    expect(faces.meenakshi.avatarId).toBe(MEENAKSHI_AVATAR);
  });

  it("uses the script's aspect when the model takes it, else 9:16", () => {
    expect(panelAspect(doc)).toBe("9:16");
    expect(panelAspect({ ...doc, header: { ...doc.header, aspect: "4:5" } })).toBe("9:16");
    expect(panelAspect({ ...doc, header: { ...doc.header, aspect: "16:9" } })).toBe("16:9");
  });

  it("prices a panel like any Nano Banana 2 image, by its reference count", () => {
    expect(estimatePanelCredits(8, "9:16")).toBeGreaterThan(0);
  });
});

describe("the panel model (D424: Nano Banana 2.1 by default, changeable under Advanced)", () => {
  it("draws with Nano Banana 2.1 unless another is chosen, from OpenAI or Gemini only", () => {
    expect(PANEL_MODEL_ID).toBe("gemini:gemini-nano-banana-2.1");
    expect(PANEL_MODEL_IDS).toContain(PANEL_MODEL_ID);
    expect(PANEL_MODEL_IDS).toContain("openai:gpt-image-2");
    expect(PANEL_MODEL_IDS.some((id) => id.startsWith("seedream:"))).toBe(false);
    expect(isPanelModel("seedream:seedream-5-0-lite")).toBe(false);
  });

  it("sizes the reference cap and the price to the chosen model", () => {
    const nb2 = "gemini:gemini-3.1-flash-image";
    expect(panelReferenceCap(nb2)).toBe(imageGenClientModelMap[nb2]!.maxReferenceImages! - 1);
    expect(estimatePanelCredits(8, "9:16", nb2)).toBe(estimateAvatarImageCredits({ modelId: nb2, aspect: "9:16", referenceCount: 9 }));
  });
});

// D449 — phase 2 of D446: a panel is drawn in the shot's own location, with its real products.
describe("panels with the script's products and locations", () => {
  const withAssets = (over: (d: ScriptDoc) => void = () => {}): ScriptDoc => {
    const d: ScriptDoc = {
      ...structuredClone(doc),
      products: [
        { id: "pouch", name: "Brandname flour pouch", images: [
          { url: "https://x/pouch-front.png", source: "upload" }, { url: "https://x/pouch-back.png", source: "upload" },
        ] },
        { id: "jar", name: "Brandname jar", images: [] },
      ],
      locations: [{ id: "kitchen", name: "Home kitchen", description: "Teal walls, a wooden counter.", image: { url: "https://x/kitchen.png", source: "plate" } }],
    };
    d.shots = d.shots.map((s) => (s.id === "s06" ? { ...s, products: ["pouch", "jar"], location: "kitchen" } : s));
    over(d);
    return d;
  };

  it("sends faces first, then the place and the product, then other views and angles", () => {
    const s06 = inputs("s06", panelReferenceCap(), avatars, withAssets());
    expect(s06.references.map(refLabel)).toEqual([
      "meenakshi:front", "husband:front", "location:kitchen", "product:pouch",
      "meenakshi:left", "meenakshi:right", "meenakshi:back", "husband:left", "husband:right", "husband:back",
      "product:pouch",
    ]);
  });

  it("keeps the place and the product's main picture before other views when the cap is short", () => {
    const s06 = inputs("s06", 5, avatars, withAssets());
    expect(s06.references.map(refLabel)).toEqual(["meenakshi:front", "husband:front", "location:kitchen", "product:pouch", "meenakshi:left"]);
  });

  it("tells the model the place and the products by reference number, and blanks only a product with no picture", () => {
    const { prompt } = inputs("s06", panelReferenceCap(), avatars, withAssets());
    expect(prompt).toContain("The shot is set in Home kitchen: reference image 3 shows this exact place, empty.");
    expect(prompt).toContain("- Brandname flour pouch: reference images 4 and 11 show it. Draw exactly this product");
    expect(prompt).toContain("- Brandname jar: draw it as a plain blank pack with no printing");
    expect(prompt).toContain("The products in the reference images keep their packaging exactly as pictured");
    expect(prompt).not.toContain("Every container, jar, packet and box is plain and unlabelled.\n");
  });

  it("names a location with no plate in words", () => {
    const d = withAssets((x) => { x.locations[0].image = null; });
    const { prompt, references } = inputs("s06", panelReferenceCap(), avatars, d);
    expect(references.some((r) => "asset" in r && r.asset === "location")).toBe(false);
    expect(prompt).toContain("The shot is set in Home kitchen: Teal walls, a wooden counter.");
  });

  it("goes out of date when the shot's place or product pictures change, and not before they exist", () => {
    const before = shotKey(doc, shot("s06"));
    expect(shotKey(reel01Doc(), reel01Doc().shots.find((s) => s.id === "s06")!)).toBe(before);
    const a = withAssets();
    const b = withAssets((x) => { x.products[0].images = [{ url: "https://x/new.png", source: "upload" }]; });
    const c = withAssets((x) => { x.locations[0].image = null; });
    const key = (d: ScriptDoc) => shotKey(d, d.shots.find((s) => s.id === "s06")!);
    expect(new Set([before, key(a), key(b), key(c)]).size).toBe(4);
  });
});
