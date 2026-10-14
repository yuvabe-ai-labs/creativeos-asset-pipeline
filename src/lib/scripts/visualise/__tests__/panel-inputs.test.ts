import { describe, it, expect } from "vitest";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { parseRegionalKits } from "../kits";
import { blankAreas, panelAspect } from "../panel-prompt";
import { castReadyForPanels, estimatePanelCredits, panelInputs, panelReferenceCap } from "../panel-inputs";
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

describe("panelInputs on Reel 01 (D342)", () => {
  it("sends both people's four views for a two-person shot, fronts first, and numbers them in the prompt", () => {
    const s06 = inputs("s06");
    expect(s06.references.map((r) => `${r.castId}:${r.view}`)).toEqual([
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
    expect(s06.references.map((r) => `${r.castId}:${r.view}`)).toEqual([
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

  it("draws nobody on a B-roll shot, with no references", () => {
    const s09 = inputs("s09");
    expect(s09.references).toEqual([]);
    expect(s09.prompt).toContain("Nobody is on screen");
    expect(s09.prompt).not.toContain("reference images show");
  });

  it("leaves the review card, the claim card and the pack blank (spec §6.3)", () => {
    expect(blankAreas(shot("s08"))).toEqual(["review card"]);
    expect(blankAreas(shot("s13"))).toEqual(["claim card", "pack"]);
    expect(blankAreas(shot("s14"))).toEqual(["pack"]);
    expect(blankAreas(shot("s03"))).toEqual([]);
    expect(inputs("s08").prompt).toContain("plain blank rectangle where the review card");
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

describe("the panel model (testing, 8 Oct: ChatGPT by default, changeable under Advanced)", () => {
  it("draws with GPT Image 2 unless another is chosen, from OpenAI or Gemini only", () => {
    expect(PANEL_MODEL_ID).toBe("openai:gpt-image-2");
    expect(PANEL_MODEL_IDS).toContain("gemini:gemini-3.1-flash-image");
    expect(PANEL_MODEL_IDS.some((id) => id.startsWith("seedream:"))).toBe(false);
    expect(isPanelModel("seedream:seedream-5-0-lite")).toBe(false);
  });

  it("sizes the reference cap and the price to the chosen model", () => {
    const nb2 = "gemini:gemini-3.1-flash-image";
    expect(panelReferenceCap(nb2)).toBe(imageGenClientModelMap[nb2]!.maxReferenceImages! - 1);
    expect(estimatePanelCredits(8, "9:16", nb2)).toBe(estimateAvatarImageCredits({ modelId: nb2, aspect: "9:16", referenceCount: 9 }));
  });
});
