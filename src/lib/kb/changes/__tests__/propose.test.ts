import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({ getJob: vi.fn(), startJob: vi.fn(), setJobPhase: vi.fn(), succeedJob: vi.fn(), failJob: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn(), listKBDocuments: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn(), listSettledChangeCards: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));
const parse = vi.hoisted(() => vi.fn());
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ responses: { parse } }) }));
vi.mock("@/lib/kb/document-input", () => ({ documentInput: vi.fn(async (docs: { filename: string }[]) => docs.map((d) => ({ type: "input_text", text: d.filename }))) }));

import { failJob, getJob, startJob, succeedJob } from "@/lib/jobs/db";
import { getClientById } from "@/lib/db/clients";
import { getActiveKBVersion, listKBDocuments } from "@/lib/db/kb";
import { insertCopilotMessages, listSettledChangeCards } from "@/lib/db/copilot-messages";
import { documentInput } from "@/lib/kb/document-input";
import { kbWith } from "@/lib/kb/__tests__/fixtures";
import { runKbProposal, type ProposeModel } from "../propose";

const V1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
const GUIDE = { id: "d-guide", filename: "guide.pdf", file_ext: "pdf", storage_url: "https://cdn/guide.pdf" };
const SITE = { id: "d-site", filename: "notes.md", file_ext: "md", storage_url: "https://cdn/notes.md" };
const TONE = "brand_profile.tone_of_voice";
const WORDS = "compliance.never_use_words";
const kb = kbWith({ [TONE]: { value: "Warm", status: "approved" }, [WORDS]: { value: ["cheap"], status: "approved" } });
const job = (input: object) => ({ id: "j1", client_id: "c1", kind: "kb-propose", input, status: "queued" });
const inserted = () => vi.mocked(insertCopilotMessages).mock.calls.map((c) => c[3]).flat();
const answering = (changes: Awaited<ReturnType<ProposeModel>>["changes"]): ProposeModel => vi.fn(async () => ({ changes }));

describe("runKbProposal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "o1", slug: "acme" } as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue({ id: V1, output: kb } as never);
    vi.mocked(listKBDocuments).mockResolvedValue([GUIDE, SITE] as never);
    vi.mocked(listSettledChangeCards).mockResolvedValue([]);
    vi.mocked(documentInput).mockImplementation(async (docs) => docs.map((d) => ({ type: "input_text", text: d.filename })));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes one card from the added documents, each value sourced to its document by name", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    const model = answering([{ path: WORDS, value: ["cheap", "chemical-free"], document: "guide.pdf" }]);
    await runKbProposal("j1", { model });
    expect(vi.mocked(documentInput).mock.calls[0][0]).toEqual([GUIDE]);
    expect(inserted()).toEqual([{
      role: "assistant", content: "guide.pdf would change 1 field.", suggestions: [],
      card: expect.objectContaining({ kind: "change", versionId: V1, fields: [expect.objectContaining({ path: WORDS, after: ["cheap", "chemical-free"], from: "guide.pdf", docId: GUIDE.id })] }),
    }]);
    expect(succeedJob).toHaveBeenCalled();
  });

  it("reads the remaining sources after a removal and proposes what they no longer support", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [], removed: ["old-guide.pdf"] }) as never);
    const model = answering([{ path: TONE, value: null, document: "" }]);
    await runKbProposal("j1", { model });
    expect(vi.mocked(documentInput).mock.calls[0][0]).toEqual([GUIDE, SITE]);
    expect(inserted()[0]).toMatchObject({
      content: "Without old-guide.pdf, 1 field is no longer supported.",
      card: { fields: [{ path: TONE, before: "Warm", after: null, from: "No remaining source supports it", docId: null }] },
    });
  });

  it("does not propose a change refused before from the same document", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    vi.mocked(listSettledChangeCards).mockResolvedValue([{
      kind: "change", versionId: V1, status: "discarded",
      fields: [{ path: WORDS, label: "W", before: ["cheap"], after: ["x"], from: "guide.pdf", docId: GUIDE.id }],
      decision: { by: "C", byId: null, at: "", kept: [], outOfDate: [] },
    }]);
    await runKbProposal("j1", { model: answering([{ path: WORDS, value: ["cheap", "chemical-free"], document: "guide.pdf" }]) });
    expect(inserted()).toEqual([{ role: "assistant", content: "Read guide.pdf. Nothing in it changes the brand KB.", card: { kind: "note" }, suggestions: [] }]);
  });

  it("says nothing changes, with no card, when the model proposes only equal values", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    await runKbProposal("j1", { model: answering([{ path: TONE, value: " Warm ", document: "guide.pdf" }]) });
    expect(inserted()[0]).toMatchObject({ content: "Read guide.pdf. Nothing in it changes the brand KB.", card: { kind: "note" } });
  });

  it("puts a single value into a list field as a list", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    await runKbProposal("j1", { model: answering([{ path: WORDS, value: "cheap, chemical-free", document: "guide.pdf" }]) });
    expect(inserted()[0].card).toMatchObject({ fields: [{ after: ["cheap", "chemical-free"] }] });
  });

  it("ends the job failed with a plain line in the thread, and no card, when the model fails", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    await runKbProposal("j1", { model: vi.fn(async () => { throw new Error("model down"); }) });
    expect(failJob).toHaveBeenCalledWith("j1", "Could not read guide.pdf.");
    // A failure reads as one: the red line, never the green tick of a note.
    expect(inserted()).toEqual([{ role: "assistant", content: "", card: { kind: "status", lines: [{ text: "Could not read guide.pdf. Try again from Source files.", state: "failed" }] }, suggestions: [] }]);
    expect(succeedJob).not.toHaveBeenCalled();
  });

  it("names the step while it runs", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }, { id: SITE.id, name: SITE.filename }], removed: [] }) as never);
    await runKbProposal("j1", { model: answering([]) });
    expect(startJob).toHaveBeenCalledWith("j1", "Reading guide.pdf and notes.md…");
  });

  it("does nothing when the client has no KB version any more", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue(null);
    const model = answering([]);
    await runKbProposal("j1", { model });
    expect(model).not.toHaveBeenCalled();
    expect(insertCopilotMessages).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalled();
  });

  it("tells the model each field's current value and which documents are new", async () => {
    vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
    const model = answering([]);
    await runKbProposal("j1", { model });
    const { system } = vi.mocked(model).mock.calls[0][0];
    expect(system).toContain(`${TONE} | `);
    expect(system).toContain("guide.pdf");
  });

  describe("review fixes", () => {
    it("drops a change whose source the model named as a document that is not there", async () => {
      vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
      await runKbProposal("j1", { model: answering([{ path: WORDS, value: ["cheap", "x"], document: "made-up.pdf" }]) });
      expect(inserted()[0]).toMatchObject({ content: "Read guide.pdf. Nothing in it changes the brand KB.", card: { kind: "note" } });
    });

    it("never clears a field when documents were only added", async () => {
      vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
      await runKbProposal("j1", { model: answering([{ path: TONE, value: null, document: "" }]) });
      expect(inserted()[0]).toMatchObject({ card: { kind: "note" } });
    });

    it("names the remaining documents for the model after a removal", async () => {
      vi.mocked(getJob).mockResolvedValue(job({ added: [], removed: ["old.pdf"] }) as never);
      const model = answering([]);
      await runKbProposal("j1", { model });
      expect(vi.mocked(model).mock.calls[0][0].system).toContain("guide.pdf, notes.md");
    });

    it("fails, and says so, when nothing in the documents could be read", async () => {
      vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
      vi.mocked(documentInput).mockResolvedValue([]);
      const model = answering([]);
      await runKbProposal("j1", { model });
      expect(model).not.toHaveBeenCalled();
      expect(failJob).toHaveBeenCalledWith("j1", "Could not read guide.pdf.");
      expect(inserted()[0]).toMatchObject({ card: { kind: "status", lines: [{ text: "Could not read guide.pdf. Try again from Source files.", state: "failed" }] } });
    });

    it("gives the model call its own limit, inside the task's, and no retries", async () => {
      vi.mocked(getJob).mockResolvedValue(job({ added: [{ id: GUIDE.id, name: GUIDE.filename }], removed: [] }) as never);
      parse.mockResolvedValue({ output_parsed: { changes: [] } });
      await runKbProposal("j1");
      expect(parse.mock.calls[0][1]).toEqual({ timeout: 480_000, maxRetries: 0 });
    });
  });
});
