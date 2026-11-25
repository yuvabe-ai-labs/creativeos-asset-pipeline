import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { linkedDoc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { CopilotChatMessage } from "@/components/scripts/generate/copilot-chat-message";
import { CopilotPictureComposer, PictureTargetChoice } from "../copilot-picture-composer";

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("pictures in the chat", () => {
  it("offers Attach a picture in the message box at Visualise", () => {
    const out = wrap(
      <CopilotPictureComposer clientId="c1" scriptId="s1" doc={linkedDoc()} busy={false} text="" onTextChange={vi.fn()} request={null} onSend={vi.fn()} />,
    );
    expect(out).toContain('aria-label="Attach a picture"');
    expect(out).toContain("<textarea");
  });

  it("asks which product or location a picture is for, one button each", () => {
    const out = renderToStaticMarkup(
      <PictureTargetChoice items={[{ id: "location:cafe", name: "the café" }, { id: "product:pouch", name: "the bottle" }]} onPick={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(out).toContain("Which is this for?");
    expect(out).toContain("The café");
    expect(out).toContain("The bottle");
  });

  it("shows a sent picture in the thread", () => {
    const message = {
      id: "m1", role: "user" as const, content: "", suggestions: [], createdAt: "t",
      card: { kind: "picture" as const, url: "https://x/cafe.png", name: "cafe.png", target: "location:cafe" },
    };
    const out = renderToStaticMarkup(<ul><CopilotChatMessage message={message} actions={null} avatars={[]} /></ul>);
    expect(out).toContain('src="https://x/cafe.png"');
    expect(out).toContain("cafe.png");
  });
});
