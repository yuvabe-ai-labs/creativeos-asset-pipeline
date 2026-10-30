import { describe, it, expect } from "vitest";
import { scriptAssetRows, scriptAssetTagOf, withScriptAssetImages } from "../asset-nodes";

// D450 — a Product or Location node becomes the image rows every reader already handles.

const product = {
  nodeId: "p1",
  type: "product",
  data: {
    scriptId: "s", productId: "pouch", name: "Brandname pouch",
    images: [{ url: "https://x/front.png", source: "upload" }, { url: "https://x/back.png", source: "upload" }],
  },
};
const location = {
  nodeId: "l1",
  type: "location",
  data: { scriptId: "s", locationId: "kitchen", name: "Home kitchen", description: "Teal walls.", image: { url: "https://x/k.png", source: "plate" } },
};

describe("scriptAssetRows", () => {
  it("makes a product's main picture, then each angle, tagged and described for the writer", () => {
    const rows = scriptAssetRows(product);
    expect(rows.map((r) => r.nodeId)).toEqual(["p1", "p1:1"]);
    expect(rows.map((r) => r.data.fileUrl)).toEqual(["https://x/front.png", "https://x/back.png"]);
    expect(rows[0].type).toBe("file");
    expect(rows[0].data.scriptAsset).toEqual({ kind: "product", id: "pouch", name: "Brandname pouch", angle: 0 });
    expect(rows[1].data.processedOutput).toBe("Brandname pouch, another angle of the same product.");
  });

  it("makes a location's plate one row, and a location with no plate none", () => {
    expect(scriptAssetRows(location).map((r) => [r.nodeId, r.data.fileUrl])).toEqual([["l1", "https://x/k.png"]]);
    expect(scriptAssetRows({ ...location, data: { ...location.data, image: null } })).toEqual([]);
  });

  it("expands asset nodes in place and leaves every other row alone", () => {
    const file = { nodeId: "f", type: "file", data: {} };
    expect(withScriptAssetImages([file, product, location]).map((r) => r.nodeId)).toEqual(["f", "p1", "p1:1", "l1"]);
  });

  it("reads a row's tag back, and nothing from a plain row", () => {
    const [main] = scriptAssetRows(product);
    expect(scriptAssetTagOf(main.data)).toEqual({ kind: "product", id: "pouch", name: "Brandname pouch", angle: 0 });
    expect(scriptAssetTagOf({ presenter: true })).toBeNull();
  });
});
