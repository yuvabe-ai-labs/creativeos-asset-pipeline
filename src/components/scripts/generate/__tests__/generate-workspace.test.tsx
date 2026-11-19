import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { scriptKeys } from "@/hooks/queries/scripts";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateState } from "@/lib/scripts/copilot/schema";
import { GenerateWorkspace } from "../generate-workspace";

// The script pane needs the editor's providers; this test is about the copilot panel beside it.
vi.mock("../generate-script-pane", () => ({ GenerateScriptPane: () => null }));

const state = (stage: GenerateState["script"]["stage"]): GenerateState => ({
  script: { id: "s1", clientId: "c1", stage, doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t" },
  messages: [], openItems: [], avatars: [], formats: [],
});

describe("the Generate workspace's copilot", () => {
  it("is Generate's panel even when the cache still holds the stage from before a reopen", () => {
    // Mark final refetches this query, so it can hold "visualise" when the script is reopened.
    const queryClient = new QueryClient();
    queryClient.setQueryData(scriptKeys.generate("c1", "s1"), state("visualise"));
    const out = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <GenerateWorkspace client={{ id: "c1", name: "Chupps", slug: "chupps" }} initialState={state("generate")} initialReview={null} />
      </QueryClientProvider>,
    );
    expect(out).not.toContain('aria-label="Show copilot"');
    expect(out).toContain("<textarea");
    expect(out).toContain("min-h-[32rem]");
  });
});
