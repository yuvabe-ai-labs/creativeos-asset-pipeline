// src/components/script-review/__tests__/review-actions.test.tsx
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { Script } from "@/lib/scripts/schema";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";
import { ReviewActions } from "../team/review-actions";
import { renderInSurface, testSurface } from "./surface";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const script = (stage: Script["stage"]): Script => ({ id: "s1", clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });
const review = (over: Partial<TeamScriptReview>): TeamScriptReview => ({
  stage: "in_review", shareToken: "6f1c", latest: { number: 2, scope: "avatars", sharedAt: "2026-10-10T09:00:00.000Z" },
  comments: [], removedShots: {}, activity: [], approval: null, commentsOpen: true, feedbackCount: 3, ...over,
});
const render = (s: Script, r: TeamScriptReview | undefined) =>
  renderInSurface(
    testSurface({ mode: "team" }),
    <QueryClientProvider client={new QueryClient()}>
      <ReviewActions clientId="c1" script={s} review={r} commentCount={2} />
    </QueryClientProvider>,
  );

describe("ReviewActions (review board)", () => {
  it("offers only Move to In review at Visualise, with no Comments button before anything is shared (Review Focus 4)", () => {
    const html = render(script("visualise"), review({ stage: "visualise", latest: null, shareToken: null, feedbackCount: 0 }));
    expect(html).toContain("Move to In review");
    expect(html).not.toContain("Share");
    expect(html).not.toContain("Comments");
  });

  it("In review: the count, the version, Share again, Copy link and Move back", () => {
    const html = render(script("in_review"), review({}));
    expect(html).toContain("Client feedback 3");
    expect(html).toContain("Version 2 · shared 10 Oct");
    expect(html).toContain("Share again");
    expect(html).toContain("Copy link");
    expect(html).toContain("Move back to Visualise");
    expect(html).toContain("Comments · 2");
  });

  it("Approved: Reopen to Visualise, never spec 3's Reopen", () => {
    const html = render(script("approved"), review({ stage: "approved" }));
    expect(html).toContain("Reopen to Visualise");
    expect(html).not.toContain("Share again");
  });
});
