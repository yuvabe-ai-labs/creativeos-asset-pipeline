import { describe, it, expect } from "vitest";
import { scriptAssetIds, scriptAssetRows, scriptAssetTagOf, storyboardPanelOf, storyboardPanelRow, withScriptAssetImages } from "../asset-nodes";

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

// D452, D454 — a storyboard is a Composite wired into the clip's shot: while it shows the
// approved sketch it is a composition guide, sent last; made real, it is the shot's still.
describe("storyboard panels", () => {
  const sketch = "https://x/s3.png";
  const panel = (activeOutput: unknown, data: Record<string, unknown> = {}) =>
    ({ nodeId: "pn", type: "composite", activeOutput, data: { storyboardPanel: "S3", storyboardSketchUrl: sketch, ...data } });

  it("recognises a storyboard Composite by its marker, and nothing else", () => {
    expect(storyboardPanelOf(panel(sketch), sketch)).toEqual({ label: "S3", url: sketch, sketch: true });
    expect(storyboardPanelOf({ type: "composite", data: {} }, sketch)).toBeNull();
    expect(storyboardPanelOf({ type: "file", data: { storyboardPanel: "S3", fileUrl: sketch } }, sketch)).toBeNull();
  });

  it("makes the sketch a row tagged as the shot's storyboard, telling the writer it is a placeholder", () => {
    const row = storyboardPanelRow(panel(sketch))!;
    expect(row.nodeId).toBe("pn");
    expect(row.data.fileUrl).toBe(sketch);
    expect(scriptAssetTagOf(row.data)).toEqual({ kind: "storyboard", id: "S3", name: "S3 storyboard", angle: 0 });
    expect(String(row.data.processedOutput)).toMatch(/placeholders/);
    expect(scriptAssetIds([row])).toEqual({ main: [], angles: [], storyboard: ["pn"] });
  });

  it("makes a storyboard made real the shot's still: a picture to match, ranked with the main pictures", () => {
    const row = storyboardPanelRow(panel("https://x/real.png"))!;
    expect(row.data.fileUrl).toBe("https://x/real.png");
    expect(scriptAssetTagOf(row.data)).toEqual({ kind: "still", id: "S3", name: "S3 still", angle: 0 });
    expect(String(row.data.processedOutput)).toMatch(/approved picture of this shot/);
    expect(scriptAssetIds([row])).toEqual({ main: ["pn"], angles: [], storyboard: [] });
  });

  it("sends nothing for a storyboard Composite with no picture", () => {
    expect(storyboardPanelRow(panel(null))).toBeNull();
  });
});
