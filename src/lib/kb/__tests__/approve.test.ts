import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ setKBStatus: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ listUnreviewedFields: vi.fn() }));
vi.mock("@/lib/db/profiles", () => ({ resolveDisplayNames: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));

import { setKBStatus } from "@/lib/db/clients";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";
import { listUnreviewedFields } from "@/lib/db/kb";
import { resolveDisplayNames } from "@/lib/db/profiles";
import { approveKB } from "../approve";

const client = (over: Record<string, unknown> = {}) =>
  ({ id: "c1", slug: "acme", org_id: "o1", kb_status: "in_review", active_kb_version_id: "v1", ...over }) as never;

describe("approveKB", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listUnreviewedFields).mockResolvedValue([]);
    vi.mocked(resolveDisplayNames).mockResolvedValue(new Map([["u1", "Asha"]]));
  });

  it("approves a fully reviewed KB and says who did", async () => {
    expect(await approveKB({ client: client(), userId: "u1" })).toEqual({ ok: true });
    expect(setKBStatus).toHaveBeenCalledWith("c1", "ready");
    expect(insertCopilotMessages).toHaveBeenCalledTimes(1);
    const [clientId, thread, , messages] = vi.mocked(insertCopilotMessages).mock.calls[0];
    expect([clientId, thread]).toEqual(["c1", "onboarding"]);
    expect(messages).toEqual([{
      role: "assistant", content: "Asha approved the brand KB. Market research is now open.", suggestions: [],
      card: { kind: "approval", what: "the brand KB", by: "Asha", byId: "u1" }, createdBy: "u1",
    }]);
  });

  it("makes sure the thread has its opening before the approval line", async () => {
    const { ensureOpening } = await import("@/lib/journey/thread/opening");
    await approveKB({ client: client(), userId: "u1" });
    expect(vi.mocked(ensureOpening).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(insertCopilotMessages).mock.invocationCallOrder[0]);
  });

  it("does nothing the second time", async () => {
    expect(await approveKB({ client: client({ kb_status: "ready" }), userId: "u1" })).toEqual({ ok: true });
    expect(setKBStatus).not.toHaveBeenCalled();
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });

  it("refuses while a field is unreviewed, and writes nothing", async () => {
    vi.mocked(listUnreviewedFields).mockResolvedValue(["brand_profile.tagline"]);
    expect(await approveKB({ client: client(), userId: "u1" })).toEqual({ error: "All fields must be reviewed before marking KB ready." });
    expect(setKBStatus).not.toHaveBeenCalled();
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });

  it("refuses when there is no brand KB, or the one named is no longer the active one", async () => {
    expect(await approveKB({ client: client({ active_kb_version_id: null }), userId: "u1" })).toEqual({ error: "There is no brand KB to approve yet." });
    expect(await approveKB({ client: client(), userId: "u1", versionId: "old" })).toEqual({ error: "The brand KB was rebuilt. Reload to see the new one." });
    expect(setKBStatus).not.toHaveBeenCalled();
  });

  it("still approves when the thread cannot be written", async () => {
    vi.mocked(insertCopilotMessages).mockRejectedValue(new Error("down"));
    expect(await approveKB({ client: client(), userId: "u1" })).toEqual({ ok: true });
    expect(setKBStatus).toHaveBeenCalledWith("c1", "ready");
  });

  it("falls back to 'A teammate' when the name is not found", async () => {
    vi.mocked(resolveDisplayNames).mockResolvedValue(new Map());
    await approveKB({ client: client(), userId: "u1" });
    expect(vi.mocked(insertCopilotMessages).mock.calls[0][3][0].content).toBe("A teammate approved the brand KB. Market research is now open.");
  });
});
