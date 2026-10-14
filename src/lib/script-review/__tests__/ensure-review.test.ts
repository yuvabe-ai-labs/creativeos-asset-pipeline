// src/lib/script-review/__tests__/ensure-review.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client-reviews", () => ({ ShareCodeTakenError: class ShareCodeTakenError extends Error {} }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(),
  insertScriptReview: vi.fn(),
  ScriptReviewExistsError: class ScriptReviewExistsError extends Error {},
}));

import { ShareCodeTakenError } from "@/lib/db/client-reviews";
import { getScriptReviewForScript, insertScriptReview, ScriptReviewExistsError } from "@/lib/db/script-reviews";
import { ensureScriptReview } from "../ensure-review";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const row = (token: string) => ({ id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: token, created_by: "u1", created_at: "t" });
const input = { scriptId: SCRIPT_ID, clientId: "c1", createdBy: "u1" };

beforeEach(() => vi.resetAllMocks());

describe("ensureScriptReview", () => {
  it("returns the script's existing review: one link for every version", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(row("6f1c"));
    expect(await ensureScriptReview(input)).toEqual(row("6f1c"));
    expect(insertScriptReview).not.toHaveBeenCalled();
  });

  it("makes one with the 4-character code, one longer on a clash", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    vi.mocked(insertScriptReview).mockRejectedValueOnce(new ShareCodeTakenError()).mockResolvedValueOnce(row("6f1c2"));
    expect((await ensureScriptReview(input)).share_token).toBe("6f1c2");
    expect(vi.mocked(insertScriptReview).mock.calls.map((c) => c[0].shareToken)).toEqual(["6f1c", "6f1c2"]);
  });

  it("returns the row another request made first", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValueOnce(null).mockResolvedValueOnce(row("6f1c"));
    vi.mocked(insertScriptReview).mockRejectedValueOnce(new ScriptReviewExistsError());
    expect((await ensureScriptReview(input)).share_token).toBe("6f1c");
  });
});
