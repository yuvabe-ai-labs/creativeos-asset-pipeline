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
vi.mock("@/lib/db/canvas-graph", () => ({ getCanvasNode: vi.fn(), insertNodesWithFirstVersions: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-panels", () => ({ listPanelRecipes: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadScriptHouseStyle: vi.fn(async () => ({ path: "p", url: "https://cdn/house-style.jpg" })) }));

import { getCanvasNode, insertNodesWithFirstVersions } from "@/lib/db/canvas-graph";
import { getScript } from "@/lib/db/scripts";
import { listPanelRecipes } from "@/lib/db/script-panels";
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

describe("POST /api/canvas/[id]/storyboard-composites (D454)", () => {
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
