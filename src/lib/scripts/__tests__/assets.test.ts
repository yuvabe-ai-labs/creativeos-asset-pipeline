import { describe, it, expect } from "vitest";
import { scriptDocSchema, type ScriptDoc } from "../schema";
import { applyAssetOp, type AssetOp } from "../assets";
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
