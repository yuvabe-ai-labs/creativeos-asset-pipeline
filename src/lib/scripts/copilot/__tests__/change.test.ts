import { describe, it, expect, vi } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { changeWithRetry } from "../change";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateScript } from "../schema";

const doc = scriptDocSchema.parse(reel01);
const script = (v: number, title = doc.header.title): GenerateScript => ({
  id: "s1", clientId: "c1", stage: "generate", doc: { ...doc, header: { ...doc.header, title } },
  brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: v, createdAt: "t", updatedAt: "t",
});

describe("changeWithRetry", () => {
  it("saves against the version it read", async () => {
    const save = vi.fn(async (v: number) => script(v + 1));
    const out = await changeWithRetry({ read: async () => script(4), save }, () => ({ patch: { notes: EMPTY_NOTES }, result: "ok" }));
    expect(save).toHaveBeenCalledWith(4, { notes: EMPTY_NOTES });
    expect(out).toMatchObject({ result: "ok", script: { docVersion: 5 } });
  });

  it("on a conflict, re-reads and re-applies the change to the newer script, so a typed edit survives", async () => {
    const reads = [script(1), script(2, "Typed by the person")];
    const save = vi.fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async (v: number) => script(v + 1, "Typed by the person"));
    const seen: string[] = [];
    const out = await changeWithRetry(
      { read: async () => reads.shift()!, save },
      (current) => { seen.push(current.doc!.header.title); return { patch: { doc: current.doc! }, result: 1 }; },
    );
    expect(seen).toEqual([doc.header.title, "Typed by the person"]);
    expect(save).toHaveBeenLastCalledWith(2, { doc: expect.objectContaining({ header: expect.objectContaining({ title: "Typed by the person" }) }) });
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
});
