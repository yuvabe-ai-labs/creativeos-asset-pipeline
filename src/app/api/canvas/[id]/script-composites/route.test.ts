import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return {
    ...actual,
    withCanvas: (_req: Request, _params: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("cv1", { id: "cv1", client_id: "cl1" }),
  };
});
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/db/canvas-graph", () => {
  class NodeIdConflictError extends Error {}
  return { getCanvasNode: vi.fn(), insertNodesWithFirstVersions: vi.fn(), NodeIdConflictError };
});
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-panels", () => ({ listPanelRecipes: vi.fn(), listPlateRecipes: vi.fn(async () => []) }));
vi.mock("@/lib/storage", () => ({ uploadScriptHouseStyle: vi.fn(async () => ({ path: "p", url: "https://cdn/house-style.jpg" })) }));

import { getCanvasNode, insertNodesWithFirstVersions, NodeIdConflictError } from "@/lib/db/canvas-graph";
import { getScript } from "@/lib/db/scripts";
import { listPanelRecipes, listPlateRecipes } from "@/lib/db/script-panels";
import { HOUSE_STYLE_REF } from "@/lib/scripts/visualise/house-style";
import { POST } from "./route";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "cv1" }) });
const body = { scriptNodeId: "sn", panels: [{ nodeId: NODE_ID, label: "S1", position: { x: 10, y: 20 } }] };
const recipe = {
  takeId: "t1", url: "https://cdn/s1.png", prompt: "Draw a loose marker sketch.\n\nThis shot: he checks his watch.",
  width: 768, height: 1365, generationId: "g1", modelUsed: "gemini:gemini-nano-banana-2.1",
  params: { aspect_ratio: "9:16" }, inputs: { referenceUrls: ["https://cdn/maya.png", HOUSE_STYLE_REF.id] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCanvasNode).mockResolvedValue({
    id: "sn", type: "script", position: { x: 0, y: 0 },
    data: { storyboard: { scriptId: "sc1", panels: [{ label: "S1", beat: "Hook", shotId: "s01", url: "https://cdn/s1.png", takeId: "t1" }] } },
  });
  vi.mocked(getScript).mockResolvedValue({ id: "sc1" } as never);
  vi.mocked(listPanelRecipes).mockResolvedValue([recipe]);
});

describe("POST /api/canvas/[id]/script-composites (D454)", () => {
  it("makes a Composite per panel whose v1 is the panel as it was drawn", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(getScript).toHaveBeenCalledWith("cl1", "sc1");
    const [canvasId, entries, userId] = vi.mocked(insertNodesWithFirstVersions).mock.calls[0];
    expect([canvasId, userId]).toEqual(["cv1", "u1"]);
    expect(entries).toHaveLength(1);
    expect(entries[0].node).toMatchObject({
      id: NODE_ID, type: "composite", position: { x: 10, y: 20 },
      data: { title: "S1 · HOOK — storyboard", instruction: recipe.prompt, modelId: recipe.modelUsed, params: recipe.params, storyboardPanel: "S1", storyboardSketchUrl: recipe.url },
    });
    expect(entries[0].version).toEqual({
      output: recipe.url,
      paramsUsed: recipe.params,
      modelUsed: recipe.modelUsed,
      inputsUsed: expect.objectContaining({
        source: "storyboard", prompt: recipe.prompt, takeId: "t1", generationId: "g1",
        // The house style goes as its stored copy, never its bytes.
        referenceImageUrls: ["https://cdn/maya.png", "https://cdn/house-style.jpg"],
      }),
    });
    expect((await res.json()).nodes).toEqual([{ id: NODE_ID, position: { x: 10, y: 20 }, data: entries[0].node.data, output: recipe.url }]);
  });

  // D460 — an id the browser sent that belongs to another canvas is refused, never overwritten.
  it("refuses, plainly, ids that are another canvas's nodes", async () => {
    vi.mocked(insertNodesWithFirstVersions).mockRejectedValueOnce(new NodeIdConflictError("x"));
    const res = await post(body);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Those pictures could not be added here. Run Fan out again.");
  });

  it("refuses a script that is not this canvas's client's", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    expect((await post(body)).status).toBe(400);
    expect(insertNodesWithFirstVersions).not.toHaveBeenCalled();
  });

  it("refuses a panel the script does not carry, and a node that is not a script", async () => {
    expect((await post({ ...body, panels: [{ ...body.panels[0], label: "S9" }] })).status).toBe(400);
    vi.mocked(getCanvasNode).mockResolvedValue({ id: "sn", type: "file", position: { x: 0, y: 0 }, data: {} });
    expect((await post(body)).status).toBe(400);
    expect(insertNodesWithFirstVersions).not.toHaveBeenCalled();
  });

  it("leaves off a panel whose take is no longer the picture the script was added with", async () => {
    vi.mocked(listPanelRecipes).mockResolvedValue([{ ...recipe, url: "https://cdn/redrawn.png" }]);
    const res = await post(body);
    expect((await res.json()).nodes).toEqual([]);
    expect(vi.mocked(insertNodesWithFirstVersions).mock.calls[0][1]).toEqual([]);
  });
});

// D456 — a location plate the script page generated arrives as a Composite with that generation as v1.
describe("POST /api/canvas/[id]/script-composites, a generated plate (D456)", () => {
  const PLATE_ID = "22222222-2222-4222-8222-222222222222";
  const plateBody = { scriptNodeId: "sn", plates: [{ nodeId: PLATE_ID, locationId: "kitchen", position: { x: 0, y: 500 } }] };
  const kitchen = { id: "kitchen", name: "Home kitchen", description: "Teal walls.", image: { url: "https://cdn/k.png", source: "plate" } };
  const plateRecipe = {
    url: "https://cdn/k.png", generationId: "g9", modelUsed: "gemini:gemini-nano-banana-2.1",
    params: { aspect_ratio: "9:16" }, inputs: { prompt: "An empty home kitchen with teal walls.", promptId: "location-plate@2" },
  };
  beforeEach(() => {
    vi.mocked(getCanvasNode).mockResolvedValue({
      id: "sn", type: "script", position: { x: 0, y: 0 },
      data: { assets: { scriptId: "sc1", products: [], locations: [kitchen], picks: {} } },
    });
    vi.mocked(listPlateRecipes).mockResolvedValue([plateRecipe]);
  });

  it("makes the location's Composite, marked as the script's location, with the plate as v1", async () => {
    const res = await post(plateBody);
    expect(res.status).toBe(201);
    expect(listPlateRecipes).toHaveBeenCalledWith("sc1", ["https://cdn/k.png"]);
    const [entry] = vi.mocked(insertNodesWithFirstVersions).mock.calls[0][1];
    expect(entry.node).toMatchObject({
      id: PLATE_ID, type: "composite",
      data: {
        title: "Home kitchen", instruction: plateRecipe.inputs.prompt, modelId: plateRecipe.modelUsed,
        scriptId: "sc1", scriptAsset: { kind: "location", id: "kitchen", name: "Home kitchen", angle: 0 },
      },
    });
    expect(entry.version).toMatchObject({
      output: "https://cdn/k.png",
      inputsUsed: { source: "script-plate", prompt: plateRecipe.inputs.prompt, generationId: "g9" },
    });
  });

  it("refuses a location whose picture was not generated", async () => {
    vi.mocked(getCanvasNode).mockResolvedValue({
      id: "sn", type: "script", position: { x: 0, y: 0 },
      data: { assets: { scriptId: "sc1", products: [], locations: [{ ...kitchen, image: { url: "https://cdn/k.png", source: "upload" } }], picks: {} } },
    });
    expect((await post(plateBody)).status).toBe(400);
    expect(insertNodesWithFirstVersions).not.toHaveBeenCalled();
  });
});
