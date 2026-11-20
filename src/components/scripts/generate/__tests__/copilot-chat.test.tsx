import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { CopilotChat } from "../copilot-chat";

const actions = { busy: false, send: () => {}, resolve: () => {}, link: () => {} };
const said = { id: "m1", role: "assistant" as const, content: "What format is this reel?", card: null, suggestions: [], createdAt: "t" };
const html = (over: Partial<ComponentProps<typeof CopilotChat>>) => renderToStaticMarkup(
  <CopilotChat client={{ name: "Chupps", slug: "chupps" }} scriptId="s1" stage="visualise" messages={[said]} avatars={[]} waiting={null} live={null} {...over} />,
);

describe("the script's copilot after Generate", () => {
  const out = html({ waiting: { kind: "task", line: "Waiting for you: finish the storyboard and send it for review" } });

  it("shows the saved thread with no message box", () => {
    expect(out).toContain("What format is this reel?");
    expect(out).not.toContain("<textarea");
  });

  it("says the stage and what is waiting at the foot of the thread", () => {
    expect(out).toContain("Visualise");
    expect(out).toContain("Waiting for you: finish the storyboard and send it for review");
  });

  it("links back to the client's scripts", () => {
    expect(out).toMatch(/<a[^>]*href="\/clients\/chupps\/scripts"/);
  });

  // Piece 5.1: the copilot leads at Visualise, so it starts open there; later stages start folded.
  it("starts open at Visualise, and folded In review and Approved", () => {
    expect(out).not.toContain('aria-label="Show copilot"');
    expect(html({ stage: "in_review" })).toContain('aria-label="Show copilot"');
    expect(html({ stage: "approved" })).toContain('aria-label="Show copilot"');
  });
});

describe("the script's copilot at Generate", () => {
  const out = html({ stage: "generate", live: { actions, suggestions: [] }, waiting: { kind: "reply", line: "Waiting for you: answer the copilot" } });

  it("has its message box and starts open", () => {
    expect(out).toContain("<textarea");
    expect(out).not.toContain('aria-label="Show copilot"');
  });

  it("draws no foot line while it waits on an answer", () => {
    expect(out).not.toContain('aria-label="Waiting"');
    expect(out).not.toContain(">Generate<");
  });

  it("draws the foot line, without a stage label, for something to do", () => {
    const task = html({ stage: "generate", live: { actions, suggestions: [] }, waiting: { kind: "task", line: "Waiting for you: mark the script final" } });
    expect(task).toContain('aria-label="Waiting"');
    expect(task).toContain("Waiting for you: mark the script final");
    expect(task).not.toContain(">Generate<");
  });
});
