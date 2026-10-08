// src/lib/script-review/__tests__/load.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { content, reelDoc } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn(),
  listVersions: vi.fn(), listScriptComments: vi.fn(), listScriptEvents: vi.fn(),
}));

import { getLatestVersion, getScriptReviewForScript, listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";
import { loadApprovedVersion, loadTeamReview } from "../load";

const review = { id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t" };

beforeEach(() => vi.resetAllMocks());

describe("loadApprovedVersion (4.17)", () => {
  it("is the latest shared version: the one the client approved", async () => {
    const v = { ...content({ scope: "panels" }), id: "v3", number: 3, sharedAt: "t" };
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue(v);
    expect(await loadApprovedVersion("s1")).toEqual(v);
    expect(getLatestVersion).toHaveBeenCalledWith("r1");
  });

  it("is null for an approved script that never went through review (Review Focus 5)", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    expect(await loadApprovedVersion("s1")).toBeNull();
    expect(getLatestVersion).not.toHaveBeenCalled();
  });
});

describe("loadTeamReview (final review: seed the team page from the server)", () => {
  it("builds the team's payload from the review row and its state, as the review route does", async () => {
    const v = { ...content({ scope: "avatars" }), id: "v1", number: 1, sharedAt: "2026-10-10T09:00:00.000Z" };
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(listVersions).mockResolvedValue([v]);
    vi.mocked(listScriptComments).mockResolvedValue([]);
    vi.mocked(listScriptEvents).mockResolvedValue([]);
    const out = await loadTeamReview({ id: "s1", stage: "in_review", doc: reelDoc() });
    expect(out).toMatchObject({ stage: "in_review", shareToken: "6f1c", latest: { number: 1, scope: "avatars" } });
  });

  it("has no link and no version before the first share", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    vi.mocked(listScriptEvents).mockResolvedValue([]);
    expect(await loadTeamReview({ id: "s1", stage: "visualise", doc: reelDoc() })).toMatchObject({ shareToken: null, latest: null });
    expect(listVersions).not.toHaveBeenCalled();
  });
});
