import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GenerateAllPlan } from "@/lib/scripts/visualise/state";
import { generateAllLabel } from "@/lib/scripts/visualise/state";
import { makeScript } from "@/lib/scripts/visualise/__tests__/fixtures";
import { CopilotStepCard } from "../copilot-step-card";
import { CopilotSendCard } from "../copilot-send-card";
import { ScriptAssetsProvider } from "@/components/scripts/script-assets-context";

const plan = (n: number): GenerateAllPlan => ({ shotIds: Array.from({ length: n }, (_, i) => `s${i}`), credits: 70 * n, redraw: false, waiting: 0 });
vi.mock("../visualise-board-context", () => ({
  useVisualiseBoardActions: () => ({
    data: { script: makeScript(), board: { avatars: [], takes: [], picks: {}, kits: [] } },
    draws: { drawingAll: false, drawAll: vi.fn() },
    model: { plan: plan(6) },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const wrap = (node: ReactNode) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><ScriptAssetsProvider clientId="c1" scriptId="s1">{node}</ScriptAssetsProvider></QueryClientProvider>,
);
const avatars = [
  { id: "a1", name: "Priya", story: "", front: "https://x/p.png", specific: false },
  { id: "a2", name: "Lata", story: "", front: null, specific: false },
];

describe("CopilotStepCard", () => {
  it("asks who plays a character, with one button per avatar, and offers what can be drawn now", () => {
    const out = wrap(<CopilotStepCard clientId="c1" step={{ kind: "cast", castId: "meenakshi", name: "Meenakshi", drawable: 4 }} avatars={avatars} />);
    expect(out).toContain("Who plays Meenakshi?");
    expect(out).toContain("Priya");
    expect(out).toContain("Lata");
    expect(out).toContain("Draw the 4 panels I can draw now");
  });

  it("asks for the missing pictures first, and still offers to draw without them", () => {
    const step = { kind: "pictures" as const, plan: plan(6), missing: [{ id: "cafe", kind: "location" as const, name: "the café" }, { id: "pouch", kind: "product" as const, name: "the bottle" }] };
    const out = wrap(<CopilotStepCard clientId="c1" step={step} avatars={[]} />);
    expect(out).toContain("The café and the bottle have no picture. Panels drawn now would need redrawing once they do.");
    expect(out).toContain("Draw it");
    expect(out).toContain("Pick on the board");
    expect(out).toContain("Draw 6 panels without them");
  });

  it("offers the draw with its count and credits", () => {
    expect(wrap(<CopilotStepCard clientId="c1" step={{ kind: "draw", plan: plan(6) }} avatars={[]} />)).toContain(generateAllLabel(plan(6)));
  });

  it("says panels are being drawn, with no button", () => {
    const out = wrap(<CopilotStepCard clientId="c1" step={{ kind: "drawing", count: 6 }} avatars={[]} />);
    expect(out).toContain("Drawing 6 panels…");
    expect(out).not.toContain("<button");
  });
});

describe("CopilotSendCard", () => {
  const script = makeScript();
  it("names what is missing before the send", () => {
    const out = wrap(<CopilotSendCard clientId="c1" script={script} latest={null} missing={["2 shots have no panel; the client will see them as text only."]} />);
    expect(out).toContain("2 shots have no panel; the client will see them as text only.");
    expect(out).toContain("Move to In review");
  });
  it("says when nothing is missing", () => {
    expect(wrap(<CopilotSendCard clientId="c1" script={script} latest={null} missing={[]} />)).toContain("Nothing is missing.");
  });
});

describe("CopilotOfferCard", () => {
  it("offers the board's draw, with its count and credits", async () => {
    const { CopilotOfferCard } = await import("../copilot-offer-card");
    const out = wrap(<CopilotOfferCard clientId="c1" card={{ kind: "offer", action: "draw" }} latest={null} pendingCard={false} />);
    expect(out).toContain(generateAllLabel(plan(6)));
  });
  it("offers the reopen as the page's own Reopen", async () => {
    const { CopilotOfferCard } = await import("../copilot-offer-card");
    expect(wrap(<CopilotOfferCard clientId="c1" card={{ kind: "offer", action: "reopen" }} latest={null} pendingCard={false} />)).toContain("Reopen");
  });
});
