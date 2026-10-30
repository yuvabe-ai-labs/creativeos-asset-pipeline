import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { REEL_07_IMPORT } from "@/lib/scripts/fixtures/reel-07-import";
import { toScriptDoc } from "../draft";
import { applyOps, type OpsGen } from "../ops";
import { buildImport } from "../import";
import type { DraftOutput, EditOp, ShotFields } from "../output";

// D447 — the copilot names a script's products and locations, and sets each shot's picks.

const gen: OpsGen = { newShotId: () => "new1", avatarIds: new Set() };
const op = (o: Partial<EditOp> & Pick<EditOp, "op">): EditOp => ({
  path: null, value: null, shotId: null, afterShotId: null, shot: null, second: null, list: null, cast: null,
  itemId: null, product: null, location: null, ...o,
});
const fields = (o: Partial<ShotFields> = {}): ShotFields => ({
  beat: "HOOK", lengthSeconds: 4, visual: "v", vo: "", onScreenText: "", onScreen: [], products: [], location: "", ...o,
});

const draft = (over: Partial<DraftOutput> = {}): DraftOutput => ({
  header: { title: "T", format: "UGC", region: "South", postDate: "", theme: "", aspect: "9:16", targetLength: "", production: "" },
  context: { purpose: "", settingAndCamera: "", disclaimers: "None apply.", watchOuts: ["w"] },
  cast: [{ key: "james", name: "James", description: "", avatarId: null, isLead: true }],
  shots: [
    fields({ onScreen: ["james"], products: ["pouch"], location: "studio" }),
    fields({ beat: "OUTRO", products: ["pouch", "Jar", "nothing-like-this"], location: "Podcast Set" }),
    fields({ beat: "OUTRO", location: "nowhere" }),
  ],
  products: [{ key: "pouch", name: "Jackfruit365 pouch" }, { key: "jar", name: "Jar" }],
  locations: [{ key: "studio", name: "Podcast set", description: "A warm studio desk, microphone arm." }],
  summary: "",
  suggestions: [],
  ...over,
});

describe("toScriptDoc with products and locations", () => {
  const doc = toScriptDoc(draft(), { reelNumber: 1, avatarIds: new Set() });

  it("creates them with ids from their names and no images", () => {
    expect(doc.products).toEqual([
      { id: "jackfruit365-pouch", name: "Jackfruit365 pouch", images: [] },
      { id: "jar", name: "Jar", images: [] },
    ]);
    expect(doc.locations).toEqual([
      { id: "podcast-set", name: "Podcast set", description: "A warm studio desk, microphone arm.", image: null },
    ]);
  });

  it("resolves each shot's keys or names to ids, dropping what it does not know", () => {
    expect(doc.shots.map((s) => [s.products, s.location])).toEqual([
      [["jackfruit365-pouch"], "podcast-set"],
      [["jackfruit365-pouch", "jar"], "podcast-set"],
      [[], null],
    ]);
  });
});

describe("copilot edit ops on products and locations", () => {
  const base = scriptDocSchema.parse({
    ...structuredClone(reel01),
    products: [{ id: "pouch", name: "Pouch", images: [] }],
    locations: [{ id: "kitchen", name: "Kitchen", description: "", image: null }],
  });
  const notes = { brief: "", confirmations: [] };
  const ok = (ops: EditOp[]) => {
    const r = applyOps(base, notes, ops, gen);
    if (!r.ok) throw new Error(r.error);
    return r;
  };

  it("adds, renames and removes a product, removal reaching the shots", () => {
    const shotId = base.shots[0].id;
    const withJar = ok([
      op({ op: "add_product", product: { productId: null, name: "Jar" } }),
      op({ op: "update_shot", shotId, shot: fields({ products: ["pouch", "jar"], location: "kitchen" }) }),
      op({ op: "update_product", product: { productId: "pouch", name: "Green pouch" } }),
    ]).doc;
    expect(withJar.products.map((p) => [p.id, p.name])).toEqual([["pouch", "Green pouch"], ["jar", "Jar"]]);
    expect(withJar.shots[0]).toMatchObject({ products: ["pouch", "jar"], location: "kitchen" });

    const r = applyOps(withJar, notes, [op({ op: "remove_product", product: { productId: "pouch", name: "" } })], gen);
    expect(r.ok && r.doc.shots[0].products).toEqual(["jar"]);
    expect(r.ok && r.touchedShotIds).toContain(shotId);
  });

  it("adds, updates and removes a location", () => {
    const out = ok([
      op({ op: "add_location", location: { locationId: null, name: "Veranda", description: "Green walls." } }),
      op({ op: "update_location", location: { locationId: "kitchen", name: "Home kitchen", description: "Teal walls." } }),
      op({ op: "remove_location", location: { locationId: "veranda", name: "", description: "" } }),
    ]).doc;
    expect(out.locations).toEqual([{ id: "kitchen", name: "Home kitchen", description: "Teal walls.", image: null }]);
  });

  it("names the change that failed", () => {
    const r = applyOps(base, notes, [op({ op: "update_product", product: { productId: "ghost", name: "x" } })], gen);
    expect(r).toEqual({ ok: false, error: 'Change 1 (update_product): There is no product "ghost".' });
  });
});

describe("import reads products and locations from the paste", () => {
  const raw = {
    ...REEL_07_IMPORT,
    products: [{ key: "flour", name: "Jackfruit365 flour pack" }],
    locations: [{ key: "kitchen", name: "Rhea's kitchen", description: "A small city kitchen." }],
    shots: REEL_07_IMPORT.shots.map((s, i) => (i === 3 ? { ...s, products: ["flour"], location: "kitchen" } : s)),
  };
  const r = buildImport(raw, { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [] });

  it("adds them and the shot's picks", () => {
    if ("error" in r) throw new Error(r.error);
    expect(r.doc.products.map((p) => p.name)).toEqual(["Jackfruit365 flour pack"]);
    expect(r.doc.shots[3]).toMatchObject({ products: ["jackfruit365-flour-pack"], location: "rhea-s-kitchen" });
  });

  it("asks the person to check them, as an open item", () => {
    if ("error" in r) throw new Error(r.error);
    expect(r.notes.confirmations.map((c) => c.text)).toContain(
      "The products and locations were read from the paste: Jackfruit365 flour pack, Rhea's kitchen. Check them, and add their pictures.",
    );
  });
});
