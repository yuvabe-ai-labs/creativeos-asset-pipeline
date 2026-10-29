import { describe, it, expect } from "vitest";
import { renderConversation, CONVERSATION_WINDOW } from "../conversation";
import type { Angle, MessageCard, ScriptMessage } from "../schema";

// The copilot reads the last 10 messages, whole, so the conversation stays coherent (user, 28 Oct
// 2026): "go with B, but warmer" and "like you said before" have something to point back to.
const msg = (role: "user" | "assistant", content: string, card: MessageCard | null = null): ScriptMessage =>
  ({ id: content, role, content, card, suggestions: [], createdAt: "t" });
const angle = (id: string, hook: string): Angle => ({
  id, hook, situation: `situation ${id}`, productMoment: "", supportingCast: "", proof: "", reviewTheme: "",
  format: "", occasion: "", postDate: "", lead: "", leadAvatarId: null, signalIds: [], fromSignals: "",
});

describe("renderConversation", () => {
  it("keeps the last 10 messages, oldest first, labelled by who said them", () => {
    const history = Array.from({ length: 14 }, (_, i) => msg(i % 2 ? "assistant" : "user", `m${i}`));
    const text = renderConversation(history);
    expect(CONVERSATION_WINDOW).toBe(10);
    expect(text).not.toContain("m3");
    expect(text.split("\n")).toEqual(history.slice(4).map((m) => `${m.role === "user" ? "Person" : "Copilot"}: ${m.content}`));
  });

  it("sends every message whole, however long", () => {
    const long = "x".repeat(9000);
    expect(renderConversation([msg("user", long)])).toBe(`Person: ${long}`);
  });

  it("says in a line what each card showed, so the person can point back to it", () => {
    const text = renderConversation([
      msg("assistant", "Here are three angles.", { kind: "angles", angles: [angle("A", "Sunday visit"), angle("B", "Keys at dusk")] }),
      msg("assistant", "Here's the brief.", { kind: "confirmation", card: { title: "Keys at dusk", reelNumber: 3, lines: [], cast: [], beats: ["HOOK", "INTRO"], toConfirm: [] } }),
    ]);
    expect(text).toContain("Copilot: Here are three angles. [showed angles: A. Sunday visit: situation A; B. Keys at dusk: situation B]");
    expect(text).toContain("Copilot: Here's the brief. [showed the brief card \"Keys at dusk\", beats HOOK › INTRO]");
  });

  it("is empty when nothing has been said yet", () => {
    expect(renderConversation([])).toBe("");
  });
});
