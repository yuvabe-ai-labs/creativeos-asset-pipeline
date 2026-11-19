import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@trigger.dev/sdk", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(), updateClientWebsiteUrl: vi.fn() }));
vi.mock("@/lib/db/brand-kit", () => ({ getBrandDetails: vi.fn(), patchBrandDetails: vi.fn() }));
vi.mock("@/lib/jobs/db", () => ({ failJob: vi.fn(), failStaleJobs: vi.fn(), insertJob: vi.fn(), listRecentJobs: vi.fn(async () => []), setJobRunId: vi.fn() }));
vi.mock("./refresh-plan", () => ({ planRefreshSince: vi.fn(async () => null) }));
vi.mock("@/lib/journey/kb-copilot/job-failed", () => ({ sayJobFailed: vi.fn() }));

import { tasks } from "@trigger.dev/sdk";
import { getClientById } from "@/lib/db/clients";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { failJob, insertJob } from "@/lib/jobs/db";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import { startAssetImports } from "./start";

describe("startAssetImports, when a run cannot be queued", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1", org_id: "org-1", website_url: null } as never);
    vi.mocked(getBrandDetails).mockResolvedValue({ instagram: "brand" } as never);
    vi.mocked(insertJob).mockImplementation(async (a) => ({ id: "job-1", client_id: "client-1", kind: "asset-import", input: a.input }) as never);
  });

  it("fails that source's job and says so once in the copilot thread (D506)", async () => {
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("trigger down"));
    await startAssetImports({ clientId: "client-1", sources: ["instagram"] });
    expect(failJob).toHaveBeenCalledWith("job-1", expect.any(String));
    expect(sayJobFailed).toHaveBeenCalledTimes(1);
    expect(sayJobFailed).toHaveBeenCalledWith(expect.objectContaining({
      client_id: "client-1", kind: "asset-import", input: expect.objectContaining({ source: "instagram" }),
    }));
  });

  it("says nothing when the run was queued", async () => {
    vi.mocked(tasks.trigger).mockResolvedValue({ id: "run-1" } as never);
    await startAssetImports({ clientId: "client-1", sources: ["instagram"] });
    expect(sayJobFailed).not.toHaveBeenCalled();
  });
});
