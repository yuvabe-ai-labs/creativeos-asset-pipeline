import {
  scriptDocSchema,
  MAX_LOCATIONS,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCTS,
  type ScriptDoc,
  type ScriptImage,
} from "./schema";
import { castIdFor } from "./copilot/draft";

// D446 — every change to a script's own products and locations, and to which of them each shot
// uses, in one pure place. The copilot's ops, the script page's pickers and the image routes all
// call this, so a product removed by chat and one removed by a click leave the doc the same way:
// gone from the list AND from every shot that showed it.

export type AssetOp =
  | { op: "add_product"; name: string }
  | { op: "rename_product"; productId: string; name: string }
  | { op: "remove_product"; productId: string }
  | { op: "set_product_images"; productId: string; images: ScriptImage[] }
  | { op: "add_location"; name: string; description: string }
  | { op: "update_location"; locationId: string; name: string; description: string }
  | { op: "remove_location"; locationId: string }
  | { op: "set_location_image"; locationId: string; image: ScriptImage | null }
  | { op: "set_shot_assets"; shotId: string; products: string[]; location: string | null };

export type AssetOpResult =
  | { ok: true; doc: ScriptDoc; touchedShotIds: string[] }
  | { ok: false; error: string };

const cut = (s: string, n: number) => s.trim().slice(0, n).trim();

/** An id from a name, unique among `taken` (the same slug rule as cast ids, D331). */
export function assetIdFor(name: string, taken: Set<string>): string {
  return castIdFor(name, taken);
}

class AssetError extends Error {}

function apply(doc: ScriptDoc, op: AssetOp, touched: Set<string>): ScriptDoc {
  const productOf = (id: string) => {
    if (!doc.products.some((p) => p.id === id)) throw new AssetError(`There is no product "${id}".`);
  };
  const locationOf = (id: string) => {
    if (!doc.locations.some((l) => l.id === id)) throw new AssetError(`There is no location "${id}".`);
  };
  const named = (name: string) => {
    const n = cut(name, 80);
    if (!n) throw new AssetError("It needs a name.");
    return n;
  };

  switch (op.op) {
    case "add_product": {
      if (doc.products.length >= MAX_PRODUCTS) throw new AssetError(`A script can have up to ${MAX_PRODUCTS} products.`);
      const name = named(op.name);
      const id = assetIdFor(name, new Set(doc.products.map((p) => p.id)));
      return { ...doc, products: [...doc.products, { id, name, images: [] }] };
    }
    case "rename_product": {
      productOf(op.productId);
      const name = named(op.name);
      return { ...doc, products: doc.products.map((p) => (p.id === op.productId ? { ...p, name } : p)) };
    }
    case "remove_product": {
      productOf(op.productId);
      const shots = doc.shots.map((s) => {
        if (!s.products.includes(op.productId)) return s;
        touched.add(s.id);
        return { ...s, products: s.products.filter((id) => id !== op.productId) };
      });
      return { ...doc, products: doc.products.filter((p) => p.id !== op.productId), shots };
    }
    case "set_product_images": {
      productOf(op.productId);
      const seen = new Set<string>();
      const images = op.images.filter((i) => !seen.has(i.url) && !!seen.add(i.url)).slice(0, MAX_PRODUCT_IMAGES);
      return { ...doc, products: doc.products.map((p) => (p.id === op.productId ? { ...p, images } : p)) };
    }
    case "add_location": {
      if (doc.locations.length >= MAX_LOCATIONS) throw new AssetError(`A script can have up to ${MAX_LOCATIONS} locations.`);
      const name = named(op.name);
      const id = assetIdFor(name, new Set(doc.locations.map((l) => l.id)));
      return { ...doc, locations: [...doc.locations, { id, name, description: cut(op.description, 2000), image: null }] };
    }
    case "update_location": {
      locationOf(op.locationId);
      const name = named(op.name);
      const description = cut(op.description, 2000);
      return { ...doc, locations: doc.locations.map((l) => (l.id === op.locationId ? { ...l, name, description } : l)) };
    }
    case "remove_location": {
      locationOf(op.locationId);
      const shots = doc.shots.map((s) => {
        if (s.location !== op.locationId) return s;
        touched.add(s.id);
        return { ...s, location: null };
      });
      return { ...doc, locations: doc.locations.filter((l) => l.id !== op.locationId), shots };
    }
    case "set_location_image": {
      locationOf(op.locationId);
      return { ...doc, locations: doc.locations.map((l) => (l.id === op.locationId ? { ...l, image: op.image } : l)) };
    }
    case "set_shot_assets": {
      const i = doc.shots.findIndex((s) => s.id === op.shotId);
      if (i < 0) throw new AssetError(`There is no shot "${op.shotId}".`);
      const products = [...new Set(op.products)];
      products.forEach(productOf);
      if (op.location !== null) locationOf(op.location);
      const shots = [...doc.shots];
      shots[i] = { ...shots[i], products, location: op.location };
      touched.add(op.shotId);
      return { ...doc, shots };
    }
  }
}

/** One change, validated whole: the result is always a doc `scriptDocSchema` accepts, or an error. */
export function applyAssetOp(doc: ScriptDoc, op: AssetOp): AssetOpResult {
  const touched = new Set<string>();
  let next: ScriptDoc;
  try {
    next = apply(doc, op, touched);
  } catch (e) {
    if (e instanceof AssetError) return { ok: false, error: e.message };
    throw e;
  }
  const parsed = scriptDocSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That change would break the script." };
  return { ok: true, doc: parsed.data, touchedShotIds: [...touched] };
}
