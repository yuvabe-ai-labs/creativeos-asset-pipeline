import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotChatMessage } from "../copilot-chat-message";

const actions = { busy: false, send: () => {}, resolve: () => {}, link: () => {} };
const mine = (content: string) => ({ id: "m1", role: "user" as const, content, card: null, createdAt: "t" });

describe("the person's message", () => {
  it("shows a short message whole", () => {
    expect(renderToStaticMarkup(<CopilotChatMessage message={mine("Make it warmer")} actions={actions} avatars={[]} />)).not.toContain('data-clipped="true"');
  });
  it("clips a pasted script to its first lines, fading out", () => {
    const pasted = Array.from({ length: 40 }, (_, i) => `| row ${i} | visual | vo |`).join("\n");
    expect(renderToStaticMarkup(<CopilotChatMessage message={mine(pasted)} actions={actions} avatars={[]} />)).toContain('data-clipped="true"');
  });
});
