import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/route-helpers", async (original) => ({
  ...(await original<typeof import("@/lib/api/route-helpers")>()),
  isAuthorizedWebhook: vi.fn(() => true),
}));
vi.mock("@/lib/db/kb-jobs", () => ({ updateKBJobPhase: vi.fn(), markKBJobSucceeded: vi.fn(), markKBJobFailed: vi.fn(), getKBJob: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn(), insertKBDocument: vi.fn(), insertKBVersion: vi.fn(), setActiveKBVersion: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(), setKBStatus: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadKBDocument: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ insertCopilotMessages: vi.fn() }));
// The org check and the helpers it pulls in are not what is under test.
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));

import { getKBJob, markKBJobFailed } from "@/lib/db/kb-jobs";
import { getActiveKBVersion, insertKBVersion } from "@/lib/db/kb";
import { getClientById } from "@/lib/db/clients";
import { insertCopilotMessages } from "@/lib/db/copilot-messages";

const post = (body: unknown) => new Request("http://localhost/api/webhooks/kb-build", { method: "POST", body: JSON.stringify(body) });
const job = (over: Record<string, unknown> = {}) =>
  ({ id: "j1", client_id: "c1", org_id: "org-1", status: "finalizing", website_url: "https://acme.com", doc_ids_used: ["d1", "d2"], ...over }) as never;
const succeeded = { jobId: "j1", kind: "succeeded", researchMarkdown: null, kbOutput: {}, modelUsed: "m", fillRate: 0.5 };

describe("POST /api/webhooks/kb-build, the copilot thread", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getKBJob).mockResolvedValue(job());
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "org-1" } as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue(null);
    vi.mocked(insertKBVersion).mockResolvedValue({ id: "v1" } as never);
  });

  it("says in the thread that the KB is built", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(succeeded));
    expect(await res.json()).toEqual({ ok: true, versionId: "v1" });
    expect(insertCopilotMessages).toHaveBeenCalledTimes(1);
    const [clientId, thread, userId, messages] = vi.mocked(insertCopilotMessages).mock.calls[0];
    expect([clientId, thread, userId]).toEqual(["c1", "onboarding", null]);
    expect(messages[0].content).toContain("The brand KB is built and ready for your review");
    expect(messages[0].card).toEqual({
      kind: "status",
      lines: [
        { text: "Read the website", state: "done" },
        { text: "Read 2 documents", state: "done" },
        { text: "Built the brand KB", state: "done" },
      ],
    });
  });

  it("writes the account and the first question together when the build lands", async () => {
    const { kbWith } = await import("@/lib/kb/__tests__/fixtures");
    const { POST } = await import("./route");
    await POST(post({ ...succeeded, kbOutput: kbWith({ "target_audience.age_range": { evidence_type: "inferred", value: "25 to 40" } }) }));
    expect(insertCopilotMessages).toHaveBeenCalledTimes(1);
    const messages = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("I filled 43 of 43 fields. 1 of them I inferred and could not find stated.");
    expect(messages[1].card).toEqual({ kind: "question", field: "target_audience.age_range", label: "Audience & Casting · Age Range" });
  });

  it("asks nothing when everything was stated", async () => {
    const { kbWith } = await import("@/lib/kb/__tests__/fixtures");
    const { POST } = await import("./route");
    await POST(post({ ...succeeded, kbOutput: kbWith({}) }));
    expect(vi.mocked(insertCopilotMessages).mock.calls[0][3]).toHaveLength(1);
  });

  it("still succeeds when the thread message cannot be stored", async () => {
    vi.mocked(insertCopilotMessages).mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    const res = await POST(post(succeeded));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, versionId: "v1" });
    expect(markKBJobFailed).not.toHaveBeenCalled();
  });

  it("says nothing twice when the build had already landed", async () => {
    vi.mocked(getKBJob).mockResolvedValue(job({ status: "succeeded" }));
    const { POST } = await import("./route");
    await POST(post(succeeded));
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });

  it("says in the thread that the build failed", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ jobId: "j1", kind: "failed", error: "The website could not be reached." }));
    expect(res.status).toBe(200);
    expect(markKBJobFailed).toHaveBeenCalledWith({ jobId: "j1", error: "The website could not be reached." });
    const messages = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect(messages[0].content).toContain("The build failed: The website could not be reached.");
    expect(messages[0].suggestions).toEqual(["Start the build"]);
  });

  it("does not offer to start a build the copilot would refuse, on a client that already has a KB", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", org_id: "org-1", active_kb_version_id: "v0" } as never);
    const { POST } = await import("./route");
    await POST(post({ jobId: "j1", kind: "failed", error: "The website could not be reached." }));
    const messages = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect(messages[0].suggestions).toEqual([]);
    expect(messages[0].content).toContain("The brand KB you already have is unchanged.");
  });

  it("does not claim nothing changed when the webhook itself fails part-way", async () => {
    vi.mocked(insertKBVersion).mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    const res = await POST(post(succeeded));
    expect(res.status).toBe(500);
    const messages = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect(messages[0].content).not.toContain("Nothing was changed");
  });

  it("counts only the documents it could read", async () => {
    const { POST } = await import("./route");
    await POST(post({ ...succeeded, skippedDocs: [{ filename: "b.docx", reason: "unsupported" }] }));
    const messages = vi.mocked(insertCopilotMessages).mock.calls[0][3];
    expect((messages[0].card as { lines: { text: string }[] }).lines.map((l) => l.text)).toContain("Read 1 document");
  });

  it("does not repeat the failure for a job that had already finished", async () => {
    vi.mocked(getKBJob).mockResolvedValue(job({ status: "failed" }));
    const { POST } = await import("./route");
    await POST(post({ jobId: "j1", kind: "failed", error: "again" }));
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });

  it("writes nothing to the thread for a phase update", async () => {
    const { POST } = await import("./route");
    await POST(post({ jobId: "j1", kind: "phase", status: "extracting", message: "Reading the documents…" }));
    expect(insertCopilotMessages).not.toHaveBeenCalled();
  });
});
