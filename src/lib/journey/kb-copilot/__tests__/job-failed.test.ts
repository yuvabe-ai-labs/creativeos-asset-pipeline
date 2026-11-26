import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));
vi.mock("@/lib/journey/market-copilot/cards", () => ({ reopenBrandsCard: vi.fn() }));
import { reopenBrandsCard } from "@/lib/journey/market-copilot/cards";

import { getClientById } from "@/lib/db/clients";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { failedLineMessage, jobFailedLine, sayJobFailed } from "../job-failed";
import { RECONCILED_JOB_KINDS } from "@/lib/jobs/reconcile";

const INSTAGRAM = "Could not collect images and video from Instagram. You can try again from Brand assets.";

describe("jobFailedLine", () => {
  it("names the source a collection failed for, and what the person can do", () => {
    expect(jobFailedLine("asset-import", { source: "instagram" })).toBe(INSTAGRAM);
    expect(jobFailedLine("asset-import", { source: "website" })).toBe("Could not collect images and video from the website. You can try again from Brand assets.");
    expect(jobFailedLine("asset-import", { source: "facebook" })).toBe("Could not collect images and video from Facebook. You can try again from Brand assets.");
  });
  it("says the image study failed and where to run it again", () => {
    expect(jobFailedLine("image-analysis", {})).toBe("Could not study the images. You can run it again from the Image Analysis tab.");
  });
  it("names the documents a reading of them failed for", () => {
    expect(jobFailedLine("kb-propose", { added: [{ id: "d1", name: "guide.pdf" }], removed: [] })).toBe("Could not read guide.pdf. Try again from Source files.");
  });
  it("says a market job failed and that nothing else changed (D530)", () => {
    expect(jobFailedLine("market-fetch", {})).toBe("I could not finish bringing in their posts. Nothing else changed; ask me to try again.");
    expect(jobFailedLine("market-draft", {})).toBe("I could not finish drafting signals. Nothing else changed; ask me to try again.");
  });
  it("the reconcile sweep covers the market jobs, so a dead run is said and settled", () => {
    expect(RECONCILED_JOB_KINDS).toEqual(expect.arrayContaining(["market-fetch", "market-draft"]));
  });
  it("has nothing to say for a job the copilot does not speak about, or a collection with no source", () => {
    expect(jobFailedLine("editor-export", {})).toBeNull();
    expect(jobFailedLine("asset-import", {})).toBeNull();
    expect(jobFailedLine("asset-import", null)).toBeNull();
  });
});

describe("failedLineMessage", () => {
  it("is one failed status line with no words, so it reads as it did at the bottom of the panel", () => {
    expect(failedLineMessage(INSTAGRAM)).toEqual({
      role: "assistant", content: "", card: { kind: "status", lines: [{ text: INSTAGRAM, state: "failed" }] }, suggestions: [],
    });
  });
});

describe("sayJobFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1" } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("writes the line once into the client's thread, after its opening", async () => {
    await sayJobFailed({ client_id: "client-1", kind: "asset-import", input: { source: "instagram" } });
    expect(ensureOpening).toHaveBeenCalledWith({ id: "client-1" });
    expect(insertCopilotMessages).toHaveBeenCalledTimes(1);
    expect(insertCopilotMessages).toHaveBeenCalledWith("client-1", "onboarding", null, [failedLineMessage(INSTAGRAM)]);
    expect(vi.mocked(ensureOpening).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(insertCopilotMessages).mock.invocationCallOrder[0]);
  });
  it("puts a failed fetch's list of brands back for the person (D530)", async () => {
    await sayJobFailed({ client_id: "client-1", kind: "market-fetch", input: { messageId: "m1", brands: [] } });
    expect(reopenBrandsCard).toHaveBeenCalledWith("client-1", "m1");
    await sayJobFailed({ client_id: "client-1", kind: "market-draft", input: { focus: null } });
    expect(reopenBrandsCard).toHaveBeenCalledTimes(1);
  });
  it("reads and writes nothing for a job with no client or nothing to say", async () => {
    await sayJobFailed({ client_id: null, kind: "asset-import", input: { source: "instagram" } });
    await sayJobFailed({ client_id: "client-1", kind: "editor-render", input: {} });
    expect(getClientById).not.toHaveBeenCalled();
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });
  it("writes nothing for a client that no longer exists", async () => {
    vi.mocked(getClientById).mockResolvedValue(null);
    await sayJobFailed({ client_id: "client-1", kind: "image-analysis", input: {} });
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });
  it("never throws: the job's own ending matters more than the line", async () => {
    vi.mocked(insertCopilotMessages).mockRejectedValue(new Error("db down"));
    await expect(sayJobFailed({ client_id: "client-1", kind: "image-analysis", input: {} })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
