import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb-jobs", () => ({}));
vi.mock("@/lib/db/kb", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/kb/approve", () => ({ approveKB: vi.fn() }));
vi.mock("@/lib/kb/start-build", () => ({ startKBBuild: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));
// withAction is the impersonation write-gate; pass it through so these tests exercise the action.
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { getClientById } from "@/lib/db/clients";
import { approveKB } from "@/lib/kb/approve";
import { markKBReadyAction } from "./kb";

describe("markKBReadyAction", () => {
  const client = { id: "c1", slug: "acme", org_id: "o1" };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1" } as never);
    vi.mocked(getClientById).mockResolvedValue(client as never);
    vi.mocked(approveKB).mockResolvedValue({ ok: true });
  });

  it("approves through the one approval, as the person asking, for the KB they were looking at", async () => {
    expect(await markKBReadyAction("c1", "v1", "acme")).toEqual({ ok: true });
    expect(approveKB).toHaveBeenCalledWith({ client, userId: "u1", versionId: "v1" });
  });

  it("passes on why it was refused", async () => {
    vi.mocked(approveKB).mockResolvedValue({ error: "All fields must be reviewed before marking KB ready." });
    expect(await markKBReadyAction("c1", "v1", "acme")).toEqual({ error: "All fields must be reviewed before marking KB ready." });
  });

  it("refuses a client the caller may not open, without approving anything", async () => {
    vi.mocked(resolveOrgId).mockResolvedValue("another-org");
    expect(await markKBReadyAction("c1", "v1", "acme")).toEqual({ error: "Client not found." });
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(getClientById).mockResolvedValue(null);
    expect(await markKBReadyAction("c1", "v1", "acme")).toEqual({ error: "Client not found." });
    expect(approveKB).not.toHaveBeenCalled();
  });
});
