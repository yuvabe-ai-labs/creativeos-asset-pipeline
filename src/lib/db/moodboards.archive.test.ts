import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const update = vi.fn();
const eq = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: () => ({ update, eq }) }),
}));

import { claimArchive, completeArchive, failArchive, skipArchive } from "./moodboards";

describe("archive state transitions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    eq.mockResolvedValue({ error: null });
    update.mockReturnValue({ eq });
  });

  it("completeArchive writes the url, size, type and ready status", async () => {
    await completeArchive("item-1", {
      mediaUrl: "https://gcs/media.mp4",
      mediaBytes: 4158066,
      mediaType: "video/mp4",
    });
    const patch = update.mock.calls[0][0];
    expect(patch.media_url).toBe("https://gcs/media.mp4");
    expect(patch.media_bytes).toBe(4158066);
    expect(patch.media_type).toBe("video/mp4");
    expect(patch.archive_status).toBe("ready");
    expect(patch.archived_at).toEqual(expect.any(String));
  });

  // A previous failure's reason must not linger on a row that has since succeeded,
  // or the UI would report a healthy archive as broken.
  it("completeArchive clears any previous failure reason", async () => {
    await completeArchive("item-1", {
      mediaUrl: "https://gcs/media.mp4",
      mediaBytes: 1,
      mediaType: "video/mp4",
    });
    expect(update.mock.calls[0][0].archive_error).toBeNull();
  });

  it("failArchive records the reason", async () => {
    await failArchive("item-1", "download failed: HTTP 404");
    const patch = update.mock.calls[0][0];
    expect(patch.archive_status).toBe("failed");
    expect(patch.archive_error).toBe("download failed: HTTP 404");
  });

  // archive_error is a text column being written from provider output, which can be
  // arbitrarily long. Truncating here keeps one bad payload from bloating the row.
  it("failArchive truncates a very long reason", async () => {
    await failArchive("item-1", "x".repeat(2000));
    expect(update.mock.calls[0][0].archive_error).toHaveLength(500);
  });

  // The attempt count is owned by the claim, not the failure — incrementing in both
  // places would double-count and retire a row after two real attempts, not four.
  it("failArchive does not touch the attempt count", async () => {
    await failArchive("item-1", "nope");
    expect(update.mock.calls[0][0]).not.toHaveProperty("archive_attempts");
  });

  it("claimArchive stamps archive_started_at so the sweep can find abandoned rows", async () => {
    await claimArchive("item-1", 1);
    const patch = update.mock.calls[0][0];
    expect(patch.archive_status).toBe("downloading");
    expect(patch.archive_attempts).toBe(1);
    expect(patch.archive_started_at).toEqual(expect.any(String));
  });

  it("skipArchive is terminal and records no error", async () => {
    await skipArchive("item-1");
    const patch = update.mock.calls[0][0];
    expect(patch.archive_status).toBe("skipped");
    expect(patch).not.toHaveProperty("archive_error");
  });

  it("propagates a database error rather than reporting success", async () => {
    eq.mockResolvedValue({ error: new Error("connection lost") });
    await expect(failArchive("item-1", "nope")).rejects.toThrow("connection lost");
  });
});
