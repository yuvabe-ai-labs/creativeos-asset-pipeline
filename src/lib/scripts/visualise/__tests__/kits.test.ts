import { describe, it, expect } from "vitest";
import { collectStrings, parseRegionalKits, pickKit } from "../kits";
import { reel01Doc } from "./fixtures";

// The house rules' kits table as it reads in the Jackfruit365 outlines document.
const MARKDOWN = `Some rule about dress.

**Regional kits**

| Region | At the table | Kitchen and home | Wardrobe |
| :---- | :---- | :---- | :---- |
| **Kerala** | Rice, sambar, thoran | Nilavilakku, steel tumblers, appachatti | Mundu, set-mundu, kasavu border |
| **Tamil Nadu** | Rice, sambar, rasam; idli and dosa at breakfast | Kuthuvilakku, kolam, iron tawa, Golu steps in Navratri, steel dabba | Cotton saree; silk and zari for festive hosting; veshti |
| **Gujarat** | Rotli, dal, bhaat, shaak | Velan, tavdi, steel dabba, terrace with kites | Light cotton, saree with front pallu, kurta |

**Locked claim and proof lines (use verbatim)**

| Beat | Visual | VO | On-screen |
| HOOK | x | y | z |`;

// The same table pasted from the .docx, which arrives tab-separated.
const TABBED = "Regional kits\nRegion\tAt the table\tKitchen and home\tWardrobe\nTamil Nadu\tRice\tIron tawa, kolam\tCotton saree\n\nNext section";

describe("parseRegionalKits (D343)", () => {
  it("reads the kits table and nothing after it", () => {
    const kits = parseRegionalKits(MARKDOWN);
    expect(kits.map((k) => k.region)).toEqual(["Kerala", "Tamil Nadu", "Gujarat"]);
    expect(kits[1]).toEqual({
      region: "Tamil Nadu",
      table: "Rice, sambar, rasam; idli and dosa at breakfast",
      kitchen: "Kuthuvilakku, kolam, iron tawa, Golu steps in Navratri, steel dabba",
      wardrobe: "Cotton saree; silk and zari for festive hosting; veshti",
    });
  });

  it("reads a tab-separated paste too", () => {
    expect(parseRegionalKits(TABBED)).toEqual([
      { region: "Tamil Nadu", table: "Rice", kitchen: "Iron tawa, kolam", wardrobe: "Cotton saree" },
    ]);
  });

  it("finds nothing when the KB holds no kits table", () => {
    expect(parseRegionalKits("Brand voice: warm.")).toEqual([]);
    expect(parseRegionalKits("")).toEqual([]);
  });
});

describe("collectStrings", () => {
  it("gathers every string in a KB, wherever the house rules were pasted", () => {
    expect(collectStrings({ a: { value: "one", n: 3 }, b: [{ value: "two" }, null], c: "  " })).toEqual(["one", "two"]);
  });
});

describe("pickKit (D343)", () => {
  const kits = parseRegionalKits(MARKDOWN);

  it("picks Tamil Nadu for Reel 01 from 'Chennai' and 'Tamil', which the script says, not the state", () => {
    const doc = reel01Doc();
    const broll = doc.shots.find((s) => s.id === "s03")!;
    expect(pickKit(kits, doc, broll)?.region).toBe("Tamil Nadu");
  });

  it("prefers what the shot itself names, for a reel that crosses regions", () => {
    const doc = reel01Doc();
    const shot = { ...doc.shots[0], visual: "A sunny terrace in Ahmedabad with kites.", onScreen: [] };
    expect(pickKit(kits, doc, shot)?.region).toBe("Gujarat");
  });

  it("is null with no kits, or when nothing points to one", () => {
    const doc = reel01Doc();
    expect(pickKit([], doc, doc.shots[0])).toBeNull();
    const plain = { ...doc, header: { ...doc.header, region: "" }, context: { ...doc.context, settingAndCamera: "" },
      cast: doc.cast.map((c) => ({ ...c, description: "A person." })) };
    expect(pickKit(kits, plain, { ...doc.shots[2], visual: "A kitchen." })).toBeNull();
  });
});
