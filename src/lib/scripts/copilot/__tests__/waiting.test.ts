import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { IMPORT_REPLY_PREFIX } from "../constants";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateState, type MessageCard, type OpenItem } from "../schema";
import { scriptWaiting } from "../waiting";

type Msg = GenerateState["messages"][number];
const msg = (role: Msg["role"], content: string, card: MessageCard | null = null): Msg => ({ id: `m-${content}`, role, content, card, suggestions: [], createdAt: "t" });
const doc = scriptDocSchema.parse(reel01);
const unlinked = scriptDocSchema.parse({ ...reel01, cast: reel01.cast.map((c) => ({ ...c, avatarId: null })) });
const openItem: OpenItem = { id: "confirm.0", label: "Confirm", question: "Is the price right?", path: null };

const state = (over: Partial<Pick<GenerateState, "messages" | "openItems">> & { doc?: GenerateState["script"]["doc"]; imported?: boolean } = {}): GenerateState => ({
  script: {
    id: "s1", clientId: "c1", stage: "generate", doc: over.doc ?? null,
    brief: { ...EMPTY_BRIEF, imported: over.imported ?? false, phase: over.doc ? "written" : EMPTY_BRIEF.phase },
    notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t",
  },
  messages: over.messages ?? [],
  openItems: over.openItems ?? [],
  avatars: [{ id: "a1", name: "Meenakshi", story: "", front: null, specific: false }],
  formats: [],
});

const proposal = (status: "pending" | "accepted"): MessageCard => ({ kind: "proposal", status, summary: "s", ops: [], before: [], after: [] });
const at = (s: GenerateState, over: { locked?: boolean; busy?: boolean } = {}) =>
  scriptWaiting({ stage: "generate", state: s, locked: over.locked ?? false, busy: over.busy ?? false });

describe("scriptWaiting at Generate", () => {
  it("waits on the person's answer while the script is not written", () => {
    expect(at(state())).toEqual({ kind: "reply", line: "Waiting for you: answer the copilot" });
  });

  it("asks for a pasted script while scripts are locked and nothing is written", () => {
    expect(at(state(), { locked: true })).toEqual({ kind: "task", line: "Waiting for you: paste your script" });
  });

  it("waits on the person's answer while a pasted script asks who plays whom, locked or not", () => {
    const importAsking = state({ doc: unlinked, imported: true, messages: [msg("assistant", `${IMPORT_REPLY_PREFIX}Reel 01 · 9 shots · 50s.`)] });
    expect(at(importAsking, { locked: true })).toEqual({ kind: "reply", line: "Waiting for you: answer the copilot" });
  });

  it("waits on a change or import card still to be decided", () => {
    expect(at(state({ doc, messages: [msg("assistant", "Here is the change.", proposal("pending"))] })))
      .toEqual({ kind: "change", line: "Waiting for you: review the change" });
  });

  it("does not count a card already decided", () => {
    expect(at(state({ doc, messages: [msg("assistant", "Done.", proposal("accepted"))] })))
      .toEqual({ kind: "task", line: "Waiting for you: mark the script final" });
  });

  it("asks to settle the open items on a written script that still has some", () => {
    expect(at(state({ doc, openItems: [openItem] }))).toEqual({ kind: "task", line: "Waiting for you: settle the open items" });
  });

  it("asks to mark the script final once nothing is open", () => {
    expect(at(state({ doc }))).toEqual({ kind: "task", line: "Waiting for you: mark the script final" });
  });

  it("says nothing while the copilot is answering", () => {
    expect(at(state({ doc }), { busy: true })).toBeNull();
  });
});

describe("scriptWaiting after Generate", () => {
  it("at Visualise", () => {
    expect(scriptWaiting({ stage: "visualise" })).toEqual({ kind: "task", line: "Waiting for you: finish the storyboard and send it for review" });
  });
  it("in review", () => {
    expect(scriptWaiting({ stage: "in_review" })).toEqual({ kind: "client", line: "Waiting for the client's review" });
  });
  it("approved, no canvas yet", () => {
    expect(scriptWaiting({ stage: "approved", hasCanvas: false })).toEqual({ kind: "task", line: "Waiting for you: create the canvas" });
  });
  it("approved, with a canvas", () => {
    expect(scriptWaiting({ stage: "approved", hasCanvas: true })).toBeNull();
  });
});
