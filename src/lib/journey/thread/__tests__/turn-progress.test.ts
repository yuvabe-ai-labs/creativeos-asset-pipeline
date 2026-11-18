import { describe, expect, it } from "vitest";
import { applyTurnEvent, NO_PROGRESS, type TurnProgress } from "../turn-progress";
import type { KbTurnEvent } from "../turn-events";

const after = (...events: KbTurnEvent[]): TurnProgress => events.reduce(applyTurnEvent, NO_PROGRESS);
const STATE = { messages: [], live: [], suggestions: [], waiting: null };

describe("applyTurnEvent", () => {
  it("shows the step it is told", () => {
    expect(after({ type: "step", text: "Saving the website…" })).toEqual({ step: "Saving the website…", text: "" });
  });

  it("adds words as they arrive and drops the step line", () => {
    expect(after({ type: "step", text: "Starting the build…" }, { type: "text", delta: "Hel" }, { type: "text", delta: "lo" })).toEqual({ step: null, text: "Hello" });
  });

  it("clears the words on a reset", () => {
    expect(after({ type: "text", delta: "Let me" }, { type: "reset" })).toEqual(NO_PROGRESS);
  });

  it("replaces half-written words when a step follows", () => {
    expect(after({ type: "text", delta: "Let me" }, { type: "step", text: "Saving your answer…" })).toEqual({ step: "Saving your answer…", text: "" });
  });

  it("ends with nothing shown on the final state and on an error", () => {
    const working = after({ type: "text", delta: "Almost" });
    expect(applyTurnEvent(working, { type: "state", state: STATE, changed: false, saved: {} })).toEqual(NO_PROGRESS);
    expect(applyTurnEvent(working, { type: "error", error: "The copilot could not answer." })).toEqual(NO_PROGRESS);
  });

  it("leaves what is shown alone for a save and for a page change", () => {
    const working = after({ type: "step", text: "Saving the website…" });
    expect(applyTurnEvent(working, { type: "saved", saved: { website: "https://acme.com/" } })).toBe(working);
    expect(applyTurnEvent(working, { type: "page" })).toBe(working);
  });
});
