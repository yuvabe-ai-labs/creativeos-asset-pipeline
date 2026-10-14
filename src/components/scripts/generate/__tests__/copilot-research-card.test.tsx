import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotChatMessage } from "../copilot-chat-message";
import type { MessageCard, ScriptMessage } from "@/lib/scripts/copilot/schema";

const signals = [{ id: "sig-1", name: "Evening label-reading" }, { id: "sig-2", name: "Dabba prep" }];
const research = (perAngle: { angleId: string; signalIds: string[] }[]): MessageCard => ({ kind: "research", signals, perAngle });
const message = (card: MessageCard, content = ""): ScriptMessage => ({ id: "m1", role: "assistant", content, card, createdAt: "t" });
const actions = { busy: false, send: () => {}, resolve: () => {} };
const html = (m: ScriptMessage) => renderToStaticMarkup(<CopilotChatMessage message={m} actions={actions} avatars={[]} />);

describe("the Market Research card", () => {
  it("names only the signals each angle used, with no explaining text", () => {
    const out = html(message(research([{ angleId: "A", signalIds: ["sig-1"] }, { angleId: "B", signalIds: ["sig-1", "sig-2"] }, { angleId: "C", signalIds: [] }])));
    expect(out).toContain("Evening label-reading · Dabba prep");
    expect(out).toContain("2 signals read");
    expect(out).not.toMatch(/no signal used/i);
    expect(out).not.toMatch(/where and when/i);
    // C drew on nothing, so it has no row.
    expect(out).not.toMatch(/>C</);
  });

  it("shows nothing when no angle drew on a signal", () => {
    expect(html(message(research([{ angleId: "A", signalIds: [] }])))).toBe("");
  });

  it("keeps the acknowledgement line when the card is hidden", () => {
    expect(html(message(research([{ angleId: "A", signalIds: [] }]), "Kerala Piravi it is."))).toContain("Kerala Piravi it is.");
  });
});
