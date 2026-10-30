import { describe, it, expect, vi } from "vitest";
import { addScriptToCanvas, type AddScriptDeps } from "../add-to-canvas";
import { scriptDocSchema, type Script } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const script = (stage: Script["stage"] = "approved"): Script => ({
  id: "s1", clientId: "c1", stage, doc: scriptDocSchema.parse(reel01), approvedAt: null, createdAt: "x", updatedAt: "x",
});

function deps(overrides: Partial<AddScriptDeps> = {}): AddScriptDeps & { toast: { loading: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } } {
  return {
    getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: null, storyboard: [] }),
    addScriptNode: vi.fn(),
    attachAvatar: vi.fn(),
    parse: vi.fn().mockResolvedValue({ ok: true, output: { visual_script: { shots: new Array(14).fill({}) } } }),
    writeParsed: vi.fn(),
    fillScriptNode: vi.fn(),
    setParsing: vi.fn(),
    newId: () => "n1",
    toast: { loading: vi.fn().mockReturnValue("t1"), success: vi.fn(), error: vi.fn() },
    ...overrides,
  } as never;
}

const POS = { x: 10, y: 20 };

describe("addScriptToCanvas", () => {
  it("creates the node with the printed text, parses it and reports the shot count", async () => {
    const d = deps();
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).toHaveBeenCalledWith("n1", POS, { title: "Golu starts today", source: expect.stringContaining("| Shot | Beat | Visual | VO | On-screen text |") });
    expect(d.writeParsed).toHaveBeenCalledWith("n1", { visual_script: { shots: expect.any(Array) } });
    expect(d.toast.success).toHaveBeenCalledWith('"Golu starts today" parsed into 14 shots', { id: "t1" });
  });

  it("attaches the lead's avatar when it has a usable one", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: "a1", storyboard: [] }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.attachAvatar).toHaveBeenCalledWith("a1", "n1", POS);
  });

  it("refuses a script that is not approved, without creating a node", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script("in_review"), leadAvatarId: null, storyboard: [] }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).not.toHaveBeenCalled();
    expect(d.toast.error).toHaveBeenCalledWith("Only approved scripts can go on a canvas.");
  });

  it("a hard parse failure resolves the toast and says how to retry", async () => {
    const d = deps({ parse: vi.fn().mockResolvedValue({ ok: false, reason: "failed", error: "Extraction failed" }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).toHaveBeenCalled();
    expect(d.writeParsed).not.toHaveBeenCalled();
    expect(d.toast.error).toHaveBeenCalledWith("Extraction failed. The script is on the canvas; open the node to parse it again.", { id: "t1" });
  });

  it("a parse that throws (network down) resolves the toast instead of leaving it spinning", async () => {
    const d = deps({ parse: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) });
    await expect(addScriptToCanvas("s1", POS, d)).resolves.toBeUndefined();
    expect(d.toast.error).toHaveBeenCalledWith("Could not parse the script. It is on the canvas; open the node to parse it again.", { id: "t1" });
  });

  it("a script that cannot be loaded shows the error and creates nothing", async () => {
    const d = deps({ getDetail: vi.fn().mockRejectedValue(new Error("Could not load the script.")) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).not.toHaveBeenCalled();
    expect(d.toast.error).toHaveBeenCalledWith("Could not load the script.");
  });

  it("marks the node as parsing for exactly the length of the parse", async () => {
    const order: string[] = [];
    const d = deps({
      setParsing: vi.fn((_id: string, p: boolean) => void order.push(p ? "on" : "off")),
      parse: vi.fn(async () => { order.push("parse"); return { ok: true as const, output: { visual_script: { shots: [] } } }; }),
      writeParsed: vi.fn(() => void order.push("write")),
    });
    await addScriptToCanvas("s1", POS, d);
    expect(order).toEqual(["on", "parse", "write", "off"]);
    expect(d.setParsing).toHaveBeenCalledWith("n1", true);
  });

  it("clears the parsing state when the parse fails, is still saving, or throws (Review Focus 5)", async () => {
    for (const parse of [
      vi.fn().mockResolvedValue({ ok: false, reason: "failed", error: "Bad" }),
      vi.fn().mockResolvedValue({ ok: false, reason: "saving", error: "Still saving" }),
      vi.fn().mockRejectedValue(new Error("offline")),
    ]) {
      const d = deps({ parse });
      await addScriptToCanvas("s1", POS, d);
      expect(d.setParsing).toHaveBeenLastCalledWith("n1", false);
    }
  });

  it("fills an existing empty Script node instead of adding one, when told to", async () => {
    const d = deps();
    await addScriptToCanvas("s1", POS, d, { into: "seeded" });
    expect(d.addScriptNode).not.toHaveBeenCalled();
    expect(d.fillScriptNode).toHaveBeenCalledWith("seeded", { title: "Golu starts today", source: expect.any(String) });
    expect(d.setParsing).toHaveBeenCalledWith("seeded", true);
    expect(d.writeParsed).toHaveBeenCalledWith("seeded", expect.anything());
  });

  const PANELS = [{ label: "S1", beat: "HOOK", shotId: "s01", url: "https://x/p.png" }];

  // D450 — the script's products, locations and picks ride on the node, frozen.
  it("freezes the script's products and locations onto the node, and nothing when it has none", async () => {
    const s = script();
    s.doc = { ...s.doc, products: [{ id: "pouch", name: "Pouch", images: [] }], shots: s.doc.shots.map((x, i) => (i === 0 ? { ...x, products: ["pouch"] } : x)) };
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: s, leadAvatarId: null, storyboard: [] }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).toHaveBeenCalledWith("n1", POS, expect.objectContaining({
      assets: { scriptId: "s1", products: s.doc.products, locations: [], picks: { S1: { products: ["pouch"], location: null } } },
    }));
    const plain = deps();
    await addScriptToCanvas("s1", POS, plain);
    expect(vi.mocked(plain.addScriptNode).mock.calls[0][2]).not.toHaveProperty("assets");
  });

  it("puts the approved storyboard on the new Script node (D381)", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: null, storyboard: PANELS }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.addScriptNode).toHaveBeenCalledWith("n1", POS, expect.objectContaining({
      storyboard: { scriptId: "s1", panels: PANELS },
    }));
  });

  it("fills the seeded node with the storyboard too (Create canvas)", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: null, storyboard: PANELS }) });
    await addScriptToCanvas("s1", POS, d, { into: "seeded" });
    expect(d.fillScriptNode).toHaveBeenCalledWith("seeded", expect.objectContaining({
      storyboard: { scriptId: "s1", panels: PANELS },
    }));
  });

  it("adds no storyboard key when there are no approved panels", async () => {
    const d = deps();
    await addScriptToCanvas("s1", POS, d);
    const data = vi.mocked(d.addScriptNode).mock.calls[0][2];
    expect(data).not.toHaveProperty("storyboard");
  });
});
