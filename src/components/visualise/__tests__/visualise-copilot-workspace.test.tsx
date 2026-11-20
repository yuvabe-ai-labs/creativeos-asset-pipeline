import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateState } from "@/lib/scripts/copilot/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { linkedDoc, makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";
import { useVisualiseBoardActions } from "../visualise-board-context";
import { VisualiseCopilotWorkspace } from "../visualise-copilot-workspace";

// The board itself has its own tests; here it stands for "a child of the same provider".
vi.mock("@/components/script-review/team/team-review-board", () => ({
  TeamReviewBoard: () => {
    const { data } = useVisualiseBoardActions();
    return <div data-board={data.script.id} />;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const doc = linkedDoc();
const state = (stage: ScriptStage): GenerateState => ({
  script: { id: SCRIPT_ID, clientId: "c1", stage, doc, brief: { ...EMPTY_BRIEF, phase: "written" }, notes: EMPTY_NOTES, docVersion: 3, createdAt: "t", updatedAt: "t" },
  messages: [{ id: "m1", role: "assistant", content: "The script is final.", card: null, suggestions: [], createdAt: "t" }],
  openItems: [], avatars: [], formats: [],
});
const render = (stage: ScriptStage) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <VisualiseCopilotWorkspace
      client={{ id: "c1", name: "Chupps", slug: "chupps" }}
      initialState={state(stage)}
      initialBoard={{ script: makeScript(doc, stage), board: { avatars: [], takes: [], picks: {}, kits: [] } }}
      initialReview={{} as never}
    />
  </QueryClientProvider>,
);

describe("the Visualise workspace", () => {
  it("gives the panel a message box at Visualise, open", () => {
    const out = render("visualise");
    expect(out).toContain("<textarea");
    expect(out).not.toContain('aria-label="Show copilot"');
  });

  it("keeps the panel read-only and folded In review", () => {
    const out = render("in_review");
    expect(out).not.toContain("<textarea");
    expect(out).toContain('aria-label="Show copilot"');
  });

  it("draws the board from the same provider the panel uses", () => {
    expect(render("visualise")).toContain(`data-board="${SCRIPT_ID}"`);
  });

  it("says what the walk waits on", () => {
    // Both are cast, but their avatars are not on the board yet: the walk asks to finish the lead's.
    expect(render("visualise")).toContain("Waiting for you: finish Meenakshi&#x27;s avatar");
  });

  it("asks for the provider", () => {
    const Lost = () => { useVisualiseBoardActions(); return null; };
    expect(() => renderToStaticMarkup(<Lost />)).toThrow(/VisualiseBoardProvider/);
  });
});
