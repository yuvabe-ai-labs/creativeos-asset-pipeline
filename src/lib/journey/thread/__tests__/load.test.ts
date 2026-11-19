import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/copilot-messages", () => ({ listCopilotMessages: vi.fn(), insertCopilotMessages: vi.fn(), insertOpeningIfEmpty: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/load", () => ({ loadKbContext: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ readKBFieldValues: vi.fn() }));

import { insertCopilotMessages, insertOpeningIfEmpty, listCopilotMessages } from "@/lib/db/copilot-messages";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { readKBFieldValues } from "@/lib/db/kb";
import type { KbContext } from "@/lib/journey/kb-copilot/context";
import type { ThreadMessage } from "../schema";
import { loadThread } from "../load";

const client = { id: "c1", slug: "acme", name: "Acme" } as never;
const empty: KbContext = {
  clientName: "Acme", clientSlug: "acme", unreviewed: null, kbStatus: "pending", hasVersion: false, websiteUrl: null, instagram: null, facebook: null,
  documentCount: 0, imageCount: 0, job: null, importing: [], studyingImages: false, importedBefore: [],
};
const withCtx = (ctx: KbContext) =>
  vi.mocked(loadKbContext).mockResolvedValue({ ctx, sources: new Map() });
const message = (over: Partial<ThreadMessage>): ThreadMessage =>
  ({ id: "m1", role: "assistant", content: "Hi", card: null, attachments: [], suggestions: [], createdAt: "", ...over });

describe("loadThread", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    withCtx(empty);
    vi.mocked(listCopilotMessages).mockResolvedValue([]);
  });

  it("keeps a question's choices on offer after a note about a save", async () => {
    vi.mocked(listCopilotMessages).mockResolvedValue([
      message({ id: "q", suggestions: ["Yes, that's right", "Skip this one"], card: { kind: "question", field: "a.b", label: "A" } }),
      message({ id: "n", content: "Manual edits saved: 1 field.", card: { kind: "note" } }),
    ]);
    expect((await loadThread(client)).suggestions).toEqual(["Yes, that's right", "Skip this one"]);
  });

  it("says what the person is waited on, from the brand KB as stored", async () => {
    withCtx({ ...empty, kbStatus: "in_review", hasVersion: true, unreviewed: [] });
    expect((await loadThread(client)).waiting).toMatchObject({ kind: "gate", action: "approve-kb" });
  });

  it("shows the opening for an empty thread without storing anything", async () => {
    const state = await loadThread(client);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ id: "opening", role: "assistant" });
    expect(state.messages[0].content).toContain("What is the brand's website?");
    expect(insertCopilotMessages).not.toHaveBeenCalled();
    expect(insertOpeningIfEmpty).not.toHaveBeenCalled();
  });

  it("reads the onboarding thread of this client", async () => {
    await loadThread(client);
    expect(listCopilotMessages).toHaveBeenCalledWith("c1", "onboarding");
  });

  it("offers the newest assistant message's reply choices when it is the last message", async () => {
    vi.mocked(listCopilotMessages).mockResolvedValue([message({ suggestions: ["Skip"] })]);
    expect((await loadThread(client)).suggestions).toEqual(["Skip"]);
  });

  it("falls back to what the client's state allows when the person spoke last", async () => {
    withCtx({ ...empty, documentCount: 1 });
    vi.mocked(listCopilotMessages).mockResolvedValue([message({ suggestions: ["Skip"] }), message({ id: "m2", role: "user", content: "wait" })]);
    expect((await loadThread(client)).suggestions).toEqual(["Start the build"]);
  });

  it("shows what is running and offers nothing while it runs", async () => {
    withCtx({ ...empty, websiteUrl: "https://acme.com", job: { status: "researching", phaseMessage: "Reading the website…" } });
    vi.mocked(listCopilotMessages).mockResolvedValue([message({ suggestions: ["Start the build"] })]);
    const state = await loadThread(client);
    expect(state.live).toEqual([{ text: "Reading the website…", state: "running" }]);
    expect(state.suggestions).toEqual([]);
  });

  it("keeps a question's choices on offer while images are collected or studied", async () => {
    withCtx({ ...empty, kbStatus: "in_review", hasVersion: true, unreviewed: ["a.b"], importing: ["website"], studyingImages: true });
    vi.mocked(listCopilotMessages).mockResolvedValue([message({ suggestions: ["Yes, that's right", "Skip this one"], card: { kind: "question", field: "a.b", label: "A" } })]);
    const state = await loadThread(client);
    expect(state.live.length).toBeGreaterThan(0);
    expect(state.suggestions).toEqual(["Yes, that's right", "Skip this one"]);
  });

  it("fails when the thread cannot be read, instead of showing an empty one", async () => {
    vi.mocked(listCopilotMessages).mockRejectedValue(new Error("db down"));
    await expect(loadThread(client)).rejects.toThrow("db down");
  });

  describe("pending change cards", () => {
    const change = (versionId = "v1", status = "pending") => message({ id: `c-${versionId}-${status}`, content: "", card: { kind: "change", versionId: versionId, status: status as never, decision: null, fields: [{ path: "brand_profile.tone_of_voice", label: "Tone", before: "Warm", after: "Plain", from: "You, in this chat", docId: null }] } });

    it("marks a field on a pending card that was changed by hand since", async () => {
      vi.mocked(listCopilotMessages).mockResolvedValue([change()]);
      vi.mocked(readKBFieldValues).mockResolvedValue({ "brand_profile.tone_of_voice": "Typed by hand" });
      const state = await loadThread(client);
      expect(state.messages[0].outOfDate).toEqual(["brand_profile.tone_of_voice"]);
    });

    it("reads only the paths on pending cards, and no KB at all when none is pending", async () => {
      vi.mocked(listCopilotMessages).mockResolvedValue([change("v1", "applied")]);
      await loadThread(client);
      expect(readKBFieldValues).not.toHaveBeenCalled();
      vi.mocked(listCopilotMessages).mockResolvedValue([change()]);
      vi.mocked(readKBFieldValues).mockResolvedValue({ "brand_profile.tone_of_voice": "Warm" });
      const state = await loadThread(client);
      expect(readKBFieldValues).toHaveBeenCalledWith("v1", ["brand_profile.tone_of_voice"]);
      expect(state.messages[0].outOfDate).toEqual([]);
    });

    it("fails the thread read when those values cannot be read", async () => {
      vi.mocked(listCopilotMessages).mockResolvedValue([change()]);
      vi.mocked(readKBFieldValues).mockRejectedValue(new Error("down"));
      await expect(loadThread(client)).rejects.toThrow("down");
    });
  });
});
