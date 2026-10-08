// src/services/script-review.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptReviewService } from "./script-review.service";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

describe("scriptReviewService", () => {
  it("reads the team review from the script's review route", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ review: { stage: "in_review" } }));
    expect(await scriptReviewService.getTeam("c1", "s1")).toEqual({ stage: "in_review" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/clients/c1/scripts/s1/review");
  });

  it("posts a client comment on the token's link", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ comment: { id: "c9" } }, 201));
    const out = await scriptReviewService.postComment("golu-6f1c", {
      authorName: "Priya", body: "Blue?", part: { kind: "context" }, versionNumber: 1,
    });
    expect(out).toEqual({ id: "c9" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/r/s/golu-6f1c/comments");
  });

  it("throws the server's words when an approval is refused", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "A newer version was shared. Reload to see it." }, 409));
    await expect(scriptReviewService.approve("golu-6f1c", { approverName: "Priya", versionNumber: 1 }))
      .rejects.toThrow("A newer version was shared. Reload to see it.");
  });

  it("throws when a post answers ok without a comment", async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 201));
    await expect(scriptReviewService.reply("c1", "s1", "x", "hi")).rejects.toThrow();
  });
});
