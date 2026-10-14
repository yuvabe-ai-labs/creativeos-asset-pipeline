import { describe, it, expect, vi, beforeEach } from "vitest";

const authFetch = vi.fn();
vi.mock("@/lib/supabase/session-ready", () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }));

import { clientReviewService } from "./client-review.service";

const comment = {
  id: "c1", authorName: "Priya", body: "Logo", timecodeMs: 4000,
  editedByName: null, createdAt: "t", updatedAt: "t",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  authFetch.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("clientReviewService.getForNode", () => {
  it("treats a 404 (node row not saved yet) as no cut", async () => {
    authFetch.mockResolvedValue(json({ error: "Node not found." }, 404));
    expect(await clientReviewService.getForNode("n1")).toEqual({ review: null, comments: [] });
    expect(authFetch).toHaveBeenCalledWith("/api/nodes/n1/client-review", { cache: "no-store" });
  });
  it("throws on any other failure", async () => {
    authFetch.mockResolvedValue(json({ error: "boom" }, 500));
    await expect(clientReviewService.getForNode("n1")).rejects.toThrow();
  });
});

describe("clientReviewService public calls", () => {
  it("posts a comment and returns it", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ comment }, 201));
    const out = await clientReviewService.postComment("tok", { authorName: "Priya", body: "Logo", timecodeMs: 4000 });
    expect(out).toEqual(comment);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/r/tok/comments");
  });
  it("throws when a post answers ok without a comment", async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 201));
    await expect(
      clientReviewService.postComment("tok", { authorName: "P", body: "x", timecodeMs: 0 }),
    ).rejects.toThrow("Could not post the comment.");
  });
  it("throws the server's message on a refused post", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "This review has reached its comment limit." }, 409));
    await expect(
      clientReviewService.postComment("tok", { authorName: "P", body: "x", timecodeMs: 0 }),
    ).rejects.toThrow("This review has reached its comment limit.");
  });
  it("throws when an edit answers ok without a comment", async () => {
    vi.mocked(fetch).mockResolvedValue(json({}));
    await expect(
      clientReviewService.editComment("tok", "c1", { editorName: "A", body: "b" }),
    ).rejects.toThrow("Could not save the edit.");
  });
});
