import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { makeScript } from "@/lib/scripts/visualise/__tests__/fixtures";
import { TeamReviewBoard } from "../team/team-review-board";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const review = (over: Partial<TeamScriptReview>): TeamScriptReview => ({
  stage: "in_review", shareToken: "6f1c", latest: { number: 1, scope: "script", sharedAt: "2026-10-10T09:00:00.000Z" },
  comments: [], removedShots: {}, activity: [], approval: null, commentsOpen: true, feedbackCount: 0, ...over,
});

const render = (initialReview: TeamScriptReview) => {
  const script = makeScript(undefined, initialReview.stage);
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TeamReviewBoard
        clientId="c1"
        initial={{ script, board: { avatars: [], takes: [], picks: {}, kits: [] } }}
        initialReview={initialReview}
      />
    </QueryClientProvider>,
  );
};

describe("TeamReviewBoard (final review: no reflow on load)", () => {
  it("draws the Comments column on the first render once something is shared, so the board never reflows", () => {
    const html = render(review({}));
    expect(html).toContain('aria-label="Comments and activity"');
    expect(html).toContain("Share again");
  });

  it("keeps spec 3's two panes before anything is shared (Review Focus 4)", () => {
    const html = render(review({ stage: "visualise", latest: null, shareToken: null }));
    expect(html).not.toContain('aria-label="Comments and activity"');
    expect(html).toContain("Move to In review");
  });
});
