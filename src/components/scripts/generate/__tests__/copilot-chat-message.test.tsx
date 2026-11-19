import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import type { Angle, MessageCard } from "@/lib/scripts/copilot/schema";
import { CopilotChatMessage } from "../copilot-chat-message";

const actions = { busy: false, send: () => {}, resolve: () => {}, link: () => {} };
const mine = (content: string) => ({ id: "m1", role: "user" as const, content, card: null, suggestions: [], createdAt: "t" });

const doc = scriptDocSchema.parse(reel01);
const angle = { id: "A", hook: "h", situation: "s", productMoment: "", supportingCast: "", proof: "", format: "", occasion: "", postDate: "", lead: "", leadAvatarId: null, signalIds: [], fromSignals: "" } as Angle;
const confirmation = { title: "t", reelNumber: 4, lines: [], cast: [], beats: [], toConfirm: [] };
const proposal = (status: "pending" | "accepted"): MessageCard => ({ kind: "proposal", status, summary: "s", ops: [], before: [], after: [] });
const importCard: MessageCard = { kind: "import", status: "pending", summary: "Reel 07", replacing: "13 shots", doc, notes: { brief: "", confirmations: [] }, reply: "Imported." };
const theirs = (card: MessageCard) => ({ id: "m2", role: "assistant" as const, content: "", card, suggestions: [], createdAt: "t" });
const render = (card: MessageCard, live: boolean) =>
  renderToStaticMarkup(<CopilotChatMessage message={theirs(card)} actions={live ? actions : null} avatars={[]} />);

describe("a card after Generate (read-only)", () => {
  it("offers an angle only while its action can apply", () => {
    const card: MessageCard = { kind: "angles", angles: [angle] };
    expect(render(card, true)).toContain("Go with A");
    expect(render(card, false)).not.toContain("Go with A");
  });
  it("offers Write it only while its action can apply", () => {
    const card: MessageCard = { kind: "confirmation", card: confirmation };
    expect(render(card, true)).toContain("Write it");
    expect(render(card, false)).not.toContain("Write it");
  });
  it("shows a pending proposal as it was, with no choices and no status", () => {
    expect(render(proposal("pending"), true)).toContain("Accept");
    const out = render(proposal("pending"), false);
    expect(out).not.toContain("Accept");
    expect(out).not.toContain("Reject");
    expect(out).not.toContain("Applied");
  });
  it("keeps a decided proposal's status", () => {
    expect(render(proposal("accepted"), false)).toContain("Applied");
  });
  it("shows a pending import with no choices", () => {
    expect(render(importCard, true)).toContain("Replace the draft");
    expect(render(importCard, false)).not.toContain("Replace the draft");
  });
});

describe("the person's message", () => {
  it("shows a short message whole", () => {
    expect(renderToStaticMarkup(<CopilotChatMessage message={mine("Make it warmer")} actions={actions} avatars={[]} />)).not.toContain('data-clipped="true"');
  });
  it("clips a pasted script to its first lines, fading out", () => {
    const pasted = Array.from({ length: 40 }, (_, i) => `| row ${i} | visual | vo |`).join("\n");
    expect(renderToStaticMarkup(<CopilotChatMessage message={mine(pasted)} actions={actions} avatars={[]} />)).toContain('data-clipped="true"');
  });
});
