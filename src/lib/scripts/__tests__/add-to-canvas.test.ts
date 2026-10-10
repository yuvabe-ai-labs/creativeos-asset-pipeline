import { describe, it, expect, vi } from "vitest";
import { addScriptToCanvas, type AddScriptDeps } from "../add-to-canvas";
import { scriptDocSchema, type Script } from "../schema";
import reel01 from "../fixtures/reel-01.json";

const script = (stage: Script["stage"] = "approved"): Script => ({
  id: "s1", clientId: "c1", stage, doc: scriptDocSchema.parse(reel01), approvedAt: null, createdAt: "x", updatedAt: "x",
});

function deps(overrides: Partial<AddScriptDeps> = {}): AddScriptDeps & { toast: { loading: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } } {
  return {
    getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: null }),
    addScriptNode: vi.fn(),
    attachAvatar: vi.fn(),
    parse: vi.fn().mockResolvedValue({ ok: true, output: { visual_script: { shots: new Array(14).fill({}) } } }),
    writeParsed: vi.fn(),
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
    expect(d.addScriptNode).toHaveBeenCalledWith("n1", POS, { title: "Golu starts today", source: expect.stringContaining("| Beat | Visual | VO | On-screen text |") });
    expect(d.writeParsed).toHaveBeenCalledWith("n1", { visual_script: { shots: expect.any(Array) } });
    expect(d.toast.success).toHaveBeenCalledWith('"Golu starts today" parsed into 14 shots', { id: "t1" });
  });

  it("attaches the lead's avatar when it has a usable one", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script(), leadAvatarId: "a1" }) });
    await addScriptToCanvas("s1", POS, d);
    expect(d.attachAvatar).toHaveBeenCalledWith("a1", "n1", POS);
  });

  it("refuses a script that is not approved, without creating a node", async () => {
    const d = deps({ getDetail: vi.fn().mockResolvedValue({ script: script("in_review"), leadAvatarId: null }) });
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
});
