import { describe, it, expect } from "vitest";
import { scriptDocSchema } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { locationPlatePrompt } from "../location-plate";

const doc = scriptDocSchema.parse(reel01);
const location = { id: "podcast-set", name: "Podcast set", description: "A warm studio desk with a microphone arm", image: null };
const kit = { region: "Kerala", table: "banana leaf", kitchen: "steel vessels, a granite counter", wardrobe: "mundu" };

describe("locationPlatePrompt (D448)", () => {
  it("draws the place from its words and the reel's setting", () => {
    const p = locationPlatePrompt({ location, doc, kit: null, aspect: "9:16" });
    expect(p).toContain("An empty location plate for a short video: Podcast set. A warm studio desk with a microphone arm.");
    expect(p).toContain(`The reel's setting: ${doc.context.settingAndCamera.trim().replace(/\.?\s*$/, ".")}`);
    expect(p).toContain("Frame: 9:16.");
  });

  it("keeps people, products and lettering out of the plate", () => {
    const p = locationPlatePrompt({ location, doc, kit: null, aspect: "9:16" });
    expect(p).toMatch(/no people, no hands, no products, no packaging, no text, signs or logos/);
  });

  it("adds the regional kit's home, never its wardrobe", () => {
    const p = locationPlatePrompt({ location, doc, kit, aspect: "9:16" });
    expect(p).toContain("Regional kit (Kerala). Kitchen and home: steel vessels, a granite counter.");
    expect(p).not.toContain("mundu");
  });

  it("leaves out an empty setting and an empty description", () => {
    const bare = { ...doc, context: { ...doc.context, settingAndCamera: "  " } };
    const p = locationPlatePrompt({ location: { ...location, description: "" }, doc: bare, kit: null, aspect: "1:1" });
    expect(p).not.toMatch(/The reel's setting/);
    expect(p.split("\n")[0]).toBe("An empty location plate for a short video: Podcast set.");
  });
});
