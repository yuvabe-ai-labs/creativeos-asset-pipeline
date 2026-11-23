import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const { guards } = vi.hoisted(() => ({ guards: new Map<string, unknown>() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/kb-jobs", () => ({
  getKBJob: vi.fn(async () => ({ id: "job-1", client_id: "c1" })),
  markKBJobStuckIfRunning: vi.fn(),
}));
vi.mock("@/lib/db/kb", () => ({}));
vi.mock("@/lib/kb/approve", () => ({ approveKB: vi.fn() }));
vi.mock("@/lib/kb/start-build", () => ({ startKBBuild: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));
// withAction is the impersonation write-gate; pass it through so these tests exercise the action.
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (name: string, guard: unknown, fn: (ctx: unknown) => Promise<unknown>) => {
    guards.set(name, guard);
    return fn({ target: null, caller: { userId: "u1" } });
  },
}));

import { getClientById } from "@/lib/db/clients";
import { approveKB } from "@/lib/kb/approve";
import { markKBReadyAction, markStuckJobFailed } from "./kb";
import { markKBJobStuckIfRunning } from "@/lib/db/kb-jobs";

describe("markKBReadyAction", () => {
  const client = { id: "c1", slug: "acme", org_id: "o1" };
  beforeEach(() => {
    vi.resetAllMocks();
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

  it("needs Edit on the client, and refuses a slug that is not the client's, without approving anything", async () => {
    await markKBReadyAction("c1", "v1", "acme");
    expect(guards.get("markKBReadyAction")).toEqual({ need: "edit", on: { clientId: "c1" } });
    vi.mocked(approveKB).mockClear();
    expect(await markKBReadyAction("c1", "v1", "other")).toEqual({ error: "Client not found." });
    vi.mocked(getClientById).mockResolvedValue(null);
    expect(await markKBReadyAction("c1", "v1", "acme")).toEqual({ error: "Client not found." });
    expect(approveKB).not.toHaveBeenCalled();
  });
});

// Clearing a build fails it, and the credits spent on it are lost. It needs what starting
// the build needs (Generate), not just being on the client.
describe("markStuckJobFailed", () => {
  it("needs Generate on the job's client, like the build it fails", async () => {
    await markStuckJobFailed("job-1");
    expect(guards.get("markStuckJobFailed")).toEqual({ need: "generate", on: { kbJobId: "job-1" } });
    expect(markKBJobStuckIfRunning).toHaveBeenCalledWith("job-1");
  });
});
