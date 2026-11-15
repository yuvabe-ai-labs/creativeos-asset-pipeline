import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/copilot-messages", () => ({ listCopilotMessages: vi.fn(), insertCopilotMessages: vi.fn(), insertOpeningIfEmpty: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/load", () => ({ loadKbContext: vi.fn() }));

import { insertCopilotMessages, insertOpeningIfEmpty, listCopilotMessages } from "@/lib/db/copilot-messages";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import type { KbContext } from "@/lib/journey/kb-copilot/context";
import type { ThreadMessage } from "../schema";
import { loadThread } from "../load";

const client = { id: "c1", slug: "acme", name: "Acme" } as never;
const empty: KbContext = {
  clientName: "Acme", kbStatus: "pending", hasVersion: false, websiteUrl: null, instagram: null, facebook: null,
  documentCount: 0, imageCount: 0, job: null, importing: [], studyingImages: false, importFailed: [], studyFailed: false, importedBefore: [],
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

  it("still offers the reply choices when the only status is a failure", async () => {
    withCtx({ ...empty, documentCount: 1, importFailed: ["instagram"] });
    const state = await loadThread(client);
    expect(state.live).toHaveLength(1);
    expect(state.suggestions).toEqual(["Start the build"]);
  });

  it("fails when the thread cannot be read, instead of showing an empty one", async () => {
    vi.mocked(listCopilotMessages).mockRejectedValue(new Error("db down"));
    await expect(loadThread(client)).rejects.toThrow("db down");
  });
});
