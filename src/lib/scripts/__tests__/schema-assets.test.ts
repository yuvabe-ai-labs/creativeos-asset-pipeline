import { describe, it, expect } from "vitest";
import {
  scriptDocSchema,
  MAX_LOCATIONS,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCTS,
  type ScriptDoc,
} from "../schema";
import reel01 from "../fixtures/reel-01.json";

// D446 — a script's own products and locations, and each shot's picks.

/** Reel 01 as stored before products existed: no `products`, `locations` or per-shot picks. */
const legacy = () => structuredClone(reel01) as unknown as Record<string, unknown>;
const parsed = (doc: unknown) => scriptDocSchema.safeParse(doc);

const pouch = { id: "pouch", name: "Jackfruit365 pouch", images: [{ url: "https://x/pouch.png", source: "upload" }] };
const set = { id: "podcast-set", name: "Podcast set", description: "A warm studio desk.", image: null };

function withAssets(over: (doc: ScriptDoc) => void): unknown {
  const doc = scriptDocSchema.parse(legacy());
  doc.products = [structuredClone(pouch)] as ScriptDoc["products"];
  doc.locations = [structuredClone(set)] as ScriptDoc["locations"];
  over(doc);
  return doc;
}

describe("script products and locations", () => {
  it("reads a doc stored before they existed, with empty lists and no picks", () => {
    const result = parsed(legacy());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.products).toEqual([]);
    expect(result.data.locations).toEqual([]);
    expect(result.data.shots.every((s) => s.products.length === 0 && s.location === null)).toBe(true);
  });

  it("accepts a shot that shows a known product in a known location", () => {
    const doc = withAssets((d) => {
      d.shots[0].products = ["pouch"];
      d.shots[0].location = "podcast-set";
    });
    expect(parsed(doc).success).toBe(true);
  });

  it("rejects a shot naming a product the script does not have", () => {
    const result = parsed(withAssets((d) => { d.shots[0].products = ["jar"]; }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain('Unknown product "jar"');
  });

  it("rejects a shot set in a location the script does not have", () => {
    const result = parsed(withAssets((d) => { d.shots[0].location = "kitchen"; }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain('Unknown location "kitchen"');
  });

  it("rejects duplicate product or location ids", () => {
    expect(parsed(withAssets((d) => { d.products.push(structuredClone(d.products[0])); })).success).toBe(false);
    expect(parsed(withAssets((d) => { d.locations.push(structuredClone(d.locations[0])); })).success).toBe(false);
  });

  it("caps products, images per product and locations", () => {
    expect(MAX_PRODUCTS).toBe(8);
    expect(MAX_PRODUCT_IMAGES).toBe(6);
    expect(MAX_LOCATIONS).toBe(6);
    const many = (n: number, f: (i: number) => object) => Array.from({ length: n }, (_, i) => f(i));
    expect(parsed(withAssets((d) => {
      d.products = many(9, (i) => ({ ...pouch, id: `p${i}` })) as ScriptDoc["products"];
    })).success).toBe(false);
    expect(parsed(withAssets((d) => {
      d.products[0].images = many(7, (i) => ({ url: `https://x/${i}.png`, source: "upload" })) as ScriptDoc["products"][0]["images"];
    })).success).toBe(false);
    expect(parsed(withAssets((d) => {
      d.locations = many(7, (i) => ({ ...set, id: `l${i}` })) as ScriptDoc["locations"];
    })).success).toBe(false);
  });

  it("needs a URL and a known source on every image", () => {
    expect(parsed(withAssets((d) => {
      d.products[0].images = [{ url: "not a url", source: "upload" }] as ScriptDoc["products"][0]["images"];
    })).success).toBe(false);
    expect(parsed(withAssets((d) => {
      d.locations[0].image = { url: "https://x/set.png", source: "camera" } as unknown as ScriptDoc["locations"][0]["image"];
    })).success).toBe(false);
  });
});
