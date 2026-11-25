import { describe, it, expect, vi } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { changeWithRetry } from "../change";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateScript, type ScriptNotes, type ScriptPatch } from "../schema";

const doc = scriptDocSchema.parse(reel01);
const script = (v: number, title = doc.header.title): GenerateScript => ({
  id: "s1", clientId: "c1", stage: "generate", doc: { ...doc, header: { ...doc.header, title } },
  brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: v, createdAt: "t", updatedAt: "t",
});

describe("changeWithRetry", () => {
  it("saves against the version it read", async () => {
    const save = vi.fn(async (c: GenerateScript) => script(c.docVersion + 1));
    const out = await changeWithRetry({ read: async () => script(4), save }, () => ({ patch: { notes: EMPTY_NOTES }, result: "ok" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ docVersion: 4 }), { notes: EMPTY_NOTES });
    expect(out).toMatchObject({ result: "ok", script: { docVersion: 5 } });
  });

  it("on a conflict, re-reads and re-applies the change to the newer script, so a typed edit survives", async () => {
    const reads = [script(1), script(2, "Typed by the person")];
    const save = vi.fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async (c: GenerateScript) => script(c.docVersion + 1, "Typed by the person"));
    const seen: string[] = [];
    const out = await changeWithRetry(
      { read: async () => reads.shift()!, save },
      (current) => { seen.push(current.doc!.header.title); return { patch: { doc: current.doc! }, result: 1 }; },
    );
    expect(seen).toEqual([doc.header.title, "Typed by the person"]);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ docVersion: 2 }), { doc: expect.objectContaining({ header: expect.objectContaining({ title: "Typed by the person" }) }) });
    expect("script" in out && out.script.doc?.header.title).toBe("Typed by the person");
  });

  it("refuses a script that is no longer at Generate", async () => {
    const out = await changeWithRetry({ read: async () => ({ ...script(1), stage: "visualise" }), save: vi.fn() }, () => ({ patch: {}, result: 1 }));
    expect(out).toEqual({ error: "This script is final. Reopen it from Visualise to change it.", status: 409 });
  });

  it("is a 404 when the script is gone", async () => {
    expect(await changeWithRetry({ read: async () => null, save: vi.fn() }, () => ({ patch: {}, result: 1 })))
      .toEqual({ error: "Script not found.", status: 404 });
  });

  it("gives up after three conflicts", async () => {
    const save = vi.fn().mockResolvedValue(null);
    const out = await changeWithRetry({ read: async () => script(1), save }, () => ({ patch: {}, result: 1 }));
    expect(save).toHaveBeenCalledTimes(3);
    expect(out).toEqual({ error: "The script kept changing while saving. Try again.", status: 409 });
  });

  it("does not write when the change has nothing to save, and passes a change's own error through", async () => {
    const save = vi.fn();
    expect(await changeWithRetry({ read: async () => script(1), save }, () => ({ patch: null, result: "same" })))
      .toMatchObject({ result: "same", script: { docVersion: 1 } });
    expect(await changeWithRetry({ read: async () => script(1), save }, () => ({ error: "No.", status: 422 })))
      .toEqual({ error: "No.", status: 422 });
    expect(save).not.toHaveBeenCalled();
  });

  it("an edit to a guessed field settles that guess in the same save", async () => {
    const guess: ScriptNotes = { brief: "", confirmations: [{ id: "g1", text: "Beats were added.", confirmed: false, paths: [`shots.${doc.shots[0].id}.beat`] }] };
    const current = { ...script(1), notes: guess };
    const save = vi.fn<(c: GenerateScript, patch: ScriptPatch) => Promise<GenerateScript>>(async (c) => script(c.docVersion + 1));
    const edited = { ...current.doc!, shots: current.doc!.shots.map((s, i) => (i === 0 ? { ...s, beat: "OPEN" } : s)) };
    await changeWithRetry({ read: async () => current, save }, () => ({ patch: { doc: edited }, result: null }));
    expect(save.mock.calls[0][1].notes?.confirmations[0].confirmed).toBe(true);
  });

  it("a patch that replaces the draft keeps the guesses it brings", async () => {
    const fresh: ScriptNotes = { brief: "", confirmations: [{ id: "g1", text: "Beats were added.", confirmed: false, paths: [`shots.${doc.shots[0].id}.beat`] }] };
    const save = vi.fn<(c: GenerateScript, patch: ScriptPatch) => Promise<GenerateScript>>(async (c) => script(c.docVersion + 1));
    const replaced = { ...doc, shots: doc.shots.map((s, i) => (i === 0 ? { ...s, beat: "OPEN" } : s)) };
    await changeWithRetry({ read: async () => script(1), save }, () => ({ patch: { doc: replaced, notes: fresh }, result: null, replaces: true }));
    expect(save.mock.calls[0][1].notes).toBe(fresh);
  });
  describe("at Visualise", () => {
    const at = (stage: GenerateScript["stage"], updatedAt = "t1"): GenerateScript => ({ ...script(1), stage, updatedAt });

    it("refuses a script at Visualise unless the change is for Visualise", async () => {
      const out = await changeWithRetry({ read: async () => at("visualise"), save: vi.fn() }, () => ({ patch: {}, result: 1 }));
      expect(out).toEqual({ error: "This script is final. Reopen it from Visualise to change it.", status: 409 });
    });

    it("applies a change at Visualise when asked to", async () => {
      const save = vi.fn(async (c: GenerateScript) => ({ ...c, updatedAt: "t2" }));
      const out = await changeWithRetry({ read: async () => at("visualise"), save }, () => ({ patch: { notes: EMPTY_NOTES }, result: "ok" }), { stage: "visualise" });
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ stage: "visualise", updatedAt: "t1" }), { notes: EMPTY_NOTES });
      expect(out).toMatchObject({ result: "ok", script: { updatedAt: "t2" } });
    });

    it("refuses a Visualise change once the script has moved to review", async () => {
      const save = vi.fn();
      const out = await changeWithRetry({ read: async () => at("in_review"), save }, () => ({ patch: {}, result: 1 }), { stage: "visualise" });
      expect(out).toEqual({ error: "The script has moved on from Visualise, so nothing was changed.", status: 409 });
      expect(save).not.toHaveBeenCalled();
    });

    it("retries on the fresh script when the Visualise save misses", async () => {
      const reads = [at("visualise", "t1"), at("visualise", "t2")];
      const save = vi.fn().mockResolvedValueOnce(null).mockImplementationOnce(async (c: GenerateScript) => c);
      const change = vi.fn(() => ({ patch: {}, result: 1 }));
      const out = await changeWithRetry({ read: async () => reads.shift()!, save }, change, { stage: "visualise" });
      expect(change).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ updatedAt: "t2" }), {});
      expect(out).toMatchObject({ result: 1 });
    });
  });
});
