import { describe, it, expect } from "vitest";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import { MAX_LOCATION_VERSIONS } from "../schema";
import { applyAssetOp, docImageUrls, locationVersions, withoutLocationVersions, type AssetOp } from "../assets";
import reel01 from "../fixtures/reel-01.json";

// D446 — every change to a script's products, locations and per-shot picks.

const base = (): ScriptDoc => scriptDocSchema.parse(structuredClone(reel01));
const img = (n: number) => ({ url: `https://x/${n}.png`, source: "upload" as const });

function run(doc: ScriptDoc, ...ops: AssetOp[]): ScriptDoc {
  let d = doc;
  for (const op of ops) {
    const r = applyAssetOp(d, op);
    if (!r.ok) throw new Error(r.error);
    d = r.doc;
  }
  return d;
}

describe("applyAssetOp", () => {
  it("adds a product with an id made from its name, unique across products", () => {
    const doc = run(base(), { op: "add_product", name: "Jackfruit365 pouch" }, { op: "add_product", name: "Jackfruit365 Pouch" });
    expect(doc.products.map((p) => p.id)).toEqual(["jackfruit365-pouch", "jackfruit365-pouch-2"]);
    expect(doc.products[0]).toMatchObject({ name: "Jackfruit365 pouch", images: [] });
  });

  it("renames a product without changing its id", () => {
    const doc = run(base(), { op: "add_product", name: "Pouch" }, { op: "rename_product", productId: "pouch", name: "Green pouch" });
    expect(doc.products[0]).toMatchObject({ id: "pouch", name: "Green pouch" });
  });

  it("keeps a product's images in order, drops repeats and caps them at six", () => {
    const doc = run(
      base(),
      { op: "add_product", name: "Pouch" },
      { op: "set_product_images", productId: "pouch", images: [img(1), img(2), img(1), img(3), img(4), img(5), img(6), img(7)] },
    );
    expect(doc.products[0].images.map((i) => i.url)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `https://x/${n}.png`));
  });

  it("sets a shot's products and location, without repeats", () => {
    const shotId = base().shots[0].id;
    const doc = run(
      base(),
      { op: "add_product", name: "Pouch" },
      { op: "add_location", name: "Podcast set", description: "A warm desk." },
      { op: "set_shot_assets", shotId, products: ["pouch", "pouch"], location: "podcast-set" },
    );
    expect(doc.shots[0]).toMatchObject({ products: ["pouch"], location: "podcast-set" });
  });

  it("reports the shots a pick change touched", () => {
    const doc = run(base(), { op: "add_product", name: "Pouch" });
    const shotId = doc.shots[1].id;
    const r = applyAssetOp(doc, { op: "set_shot_assets", shotId, products: ["pouch"], location: null });
    expect(r.ok && r.touchedShotIds).toEqual([shotId]);
  });

  it("removing a product takes it out of every shot that showed it", () => {
    const doc = run(base(), { op: "add_product", name: "Pouch" }, { op: "add_product", name: "Jar" });
    const [a, b] = doc.shots;
    const picked = run(
      doc,
      { op: "set_shot_assets", shotId: a.id, products: ["pouch", "jar"], location: null },
      { op: "set_shot_assets", shotId: b.id, products: ["pouch"], location: null },
    );
    const r = applyAssetOp(picked, { op: "remove_product", productId: "pouch" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.products.map((p) => p.id)).toEqual(["jar"]);
    expect(r.doc.shots[0].products).toEqual(["jar"]);
    expect(r.doc.shots[1].products).toEqual([]);
    expect(r.touchedShotIds.sort()).toEqual([a.id, b.id].sort());
  });

  it("removing a location clears it from every shot set there", () => {
    const doc = run(base(), { op: "add_location", name: "Kitchen", description: "" });
    const picked = run(doc, { op: "set_shot_assets", shotId: doc.shots[0].id, products: [], location: "kitchen" });
    const out = run(picked, { op: "remove_location", locationId: "kitchen" });
    expect(out.locations).toEqual([]);
    expect(out.shots[0].location).toBeNull();
  });

  it("updates a location's words and its plate", () => {
    const doc = run(
      base(),
      { op: "add_location", name: "Kitchen", description: "" },
      { op: "update_location", locationId: "kitchen", name: "Home kitchen", description: "Teal walls, wooden counter." },
      { op: "set_location_image", locationId: "kitchen", image: { url: "https://x/plate.png", source: "plate" } },
    );
    expect(doc.locations[0]).toEqual({
      id: "kitchen", name: "Home kitchen", description: "Teal walls, wooden counter.",
      image: { url: "https://x/plate.png", source: "plate" },
      versions: [{ url: "https://x/plate.png", source: "plate" }],
    });
  });

  describe("location versions (D489)", () => {
    const plate = (n: number) => ({ url: `https://x/plate-${n}.png`, source: "plate" as const });
    const kitchen = () => run(base(), { op: "add_location", name: "Kitchen", description: "" });
    const setPlate = (n: number, extra: Partial<Extract<AssetOp, { op: "set_location_image" }>> = {}): AssetOp =>
      ({ op: "set_location_image", locationId: "kitchen", image: plate(n), ...extra });

    it("keeps every new plate, oldest first, with how a drawn one was drawn", () => {
      const doc = run(kitchen(), setPlate(1, { mode: "fresh" }), setPlate(2, { mode: "change", note: "warmer light" }));
      expect(doc.locations[0].image).toEqual(plate(2));
      expect(doc.locations[0].versions).toEqual([
        { ...plate(1), mode: "fresh" },
        { ...plate(2), mode: "change", note: "warmer light" },
      ]);
    });

    it("puts an earlier plate back without adding a version", () => {
      const doc = run(kitchen(), setPlate(1), setPlate(2), setPlate(1));
      expect(doc.locations[0].image).toEqual(plate(1));
      expect(doc.locations[0].versions?.map((v) => v.url)).toEqual([plate(1).url, plate(2).url]);
    });

    it("keeps the versions when the plate is cleared", () => {
      const doc = run(kitchen(), setPlate(1), { op: "set_location_image", locationId: "kitchen", image: null });
      expect(doc.locations[0].image).toBeNull();
      expect(doc.locations[0].versions).toHaveLength(1);
    });

    it("drops the oldest past the cap", () => {
      let doc = kitchen();
      for (let i = 1; i <= MAX_LOCATION_VERSIONS + 1; i++) doc = run(doc, setPlate(i));
      const urls = doc.locations[0].versions!.map((v) => v.url);
      expect(urls).toHaveLength(MAX_LOCATION_VERSIONS);
      expect(urls[0]).toBe(plate(2).url);
      expect(urls.at(-1)).toBe(plate(MAX_LOCATION_VERSIONS + 1).url);
    });

    it("starts a location stored before versions from its current plate, so that one is kept", () => {
      const old = kitchen();
      old.locations[0] = { ...old.locations[0], image: plate(1) };
      delete old.locations[0].versions;
      expect(locationVersions(old.locations[0])).toEqual([plate(1)]);
      const doc = run(old, setPlate(2));
      expect(doc.locations[0].versions?.map((v) => v.url)).toEqual([plate(1).url, plate(2).url]);
    });

    it("counts past plates as the doc's own pictures, and leaves them out where history is not wanted", () => {
      const doc = run(kitchen(), setPlate(1), setPlate(2));
      expect(docImageUrls(doc).has(plate(1).url)).toBe(true);
      expect(withoutLocationVersions(doc).locations[0].versions).toBeUndefined();
      expect(JSON.stringify(withoutLocationVersions(doc))).not.toContain(plate(1).url);
    });
  });

  it("refuses unknown ids, empty names and going over the caps", () => {
    expect(applyAssetOp(base(), { op: "rename_product", productId: "nope", name: "x" }).ok).toBe(false);
    expect(applyAssetOp(base(), { op: "add_product", name: "   " }).ok).toBe(false);
    expect(applyAssetOp(base(), { op: "set_shot_assets", shotId: "nope", products: [], location: null }).ok).toBe(false);
    expect(applyAssetOp(base(), { op: "set_shot_assets", shotId: base().shots[0].id, products: ["ghost"], location: null }).ok).toBe(false);
    let doc = base();
    for (let i = 0; i < 8; i++) doc = run(doc, { op: "add_product", name: `P${i}` });
    const ninth = applyAssetOp(doc, { op: "add_product", name: "P9" });
    expect(ninth).toEqual({ ok: false, error: "A script can have up to 8 products." });
  });
});
